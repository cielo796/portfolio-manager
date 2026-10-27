# T21 JSONバックアップの v7 列復元と、トップピック上限超過時の同期メッセージ

共通ルール: docs/renovation/AGENT_RULES.md と docs/renovation/PLAN.md を最初に読むこと。

## 1. JSON バックアップで記録連動情報を復元する
T18（v7）で以下の列を追加したが、`src/lib/db/backup.ts` の書出し・取込はこれらを扱っておらず、JSON から別DBへ復元すると記録と保有の連動情報が失われる。
- transactions: `realized_pl`, `fx_rate`, `holding_id`
- holdings: `ledger_opening_shares`, `ledger_opening_cost`

やること:
- 書出し（exportBackupData）にこれらの列を含める。
- 取込（importBackupData）でこれらを検証して復元する（数値は有限数または null、holding_id は文字列または null）。旧形式（列が無い JSON）の取込は従来どおり null として受け付ける。
- `holding_id` が取込データ内に存在しない保有を指す場合は null にする（壊れた参照を作らない）。取込後に参照される保有が論理削除されている場合の扱いは、T18 の `keep_ledger_holding` トリガーと矛盾しないようにする。
- 既存の取込処理は「旧行を論理削除して自分の更新として復活」させる。連動列も同じ流れで上書きされること。
- テスト: 往復（書出し→別の一時DBへ取込）で 5 列が一致する、旧形式 JSON で null になる、存在しない holding_id が null になる。
- `src/lib/db/transactions.ts` は別タスクが編集中なので変更しないこと（読むのは可）。

## 2. トップピック上限超過で同期が止まったときのメッセージ
T20 で、同期後に現在のトップピックが 10 件を超える場合は 409 で全体を取り消すようにした。現状、設定画面（LAN 同期）に出るエラーが利用者にとって分かりにくい可能性がある。
- 同期の実行経路（`src/lib/sync/engine.ts`・`changes.ts`・`src/app/api/sync/**`・`src/components/settings/sync-settings.tsx`）を確認し、この 409 のとき画面に次の趣旨の文言が出るようにする：
  「トップピックが合計 N 件（上限 10 件）になるため同期を中止しました。どちらかの PC でピックを外してから、もう一度同期してください。データは変更されていません。」
- N は同期後に現在ピックとなる件数。相手側（ピア）で発生した場合も同じ文言が届くようにする。
- 同期ログ（sync_log）にも同じ趣旨の失敗理由が残ること。
- テスト: 既存の `src/lib/sync/sync.test.ts` の上限超過ケースで、エラーメッセージに件数と「外して」の案内が含まれることを確認。

## 変更してよいファイル
- src/lib/db/backup.ts
- src/lib/db/backup.test.ts（新規、または既存のバックアップ関連テストファイル）
- src/lib/sync/engine.ts、src/lib/sync/changes.ts、src/lib/sync/transport.ts、src/app/api/sync/**
- src/components/settings/sync-settings.tsx
- src/lib/sync/sync.test.ts、src/lib/db/sync-schema.test.ts（必要な場合のみ）
- src/types/index.ts
- docs/renovation/reports/T21.md（新規）

## 確認
- `npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`（PM_FORBID_REAL_DB=1 と一時 SQLITE_DB_PATH で）。
- 他タスク（T22〜T24、DeepSeek）が並行で別ファイルを編集している。変更許可ファイル以外の差分が見えても触らないこと。

## レポート
docs/renovation/reports/T21.md に変更点・確認結果・判断・未対応を書く。