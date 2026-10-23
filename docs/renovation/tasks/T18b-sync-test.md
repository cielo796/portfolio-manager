# T18b 同期スキーマ移行テストを v7 に追従（小修正）

共通ルール: docs/renovation/AGENT_RULES.md を必ず読んで従うこと。

## 背景
T18 でマイグレーション v7（transactions に realized_pl / fx_rate / holding_id、holdings に ledger_opening_shares / ledger_opening_cost、索引 idx_transactions_holding、トリガー keep_ledger_holding）を追加した。
`src/lib/db/sync-schema.test.ts` の「バージョン2の既存データを保持して移行し、再実行しても変わらない」（77行目付近）は、現行スキーマから列を落として v2 を再現しているため、トリガーが transactions.deleted_at を参照していて DROP COLUMN が失敗する。

## やること
そのテストの `runMigrations(legacy);` 直後、既存の `for (const table of SYNC_TABLES)` ループより前に、v7 の追加物を取り除く処理を入れる:
```
DROP TRIGGER IF EXISTS keep_ledger_holding;
DROP INDEX IF EXISTS idx_transactions_holding;
ALTER TABLE transactions DROP COLUMN realized_pl;
ALTER TABLE transactions DROP COLUMN fx_rate;
ALTER TABLE transactions DROP COLUMN holding_id;
ALTER TABLE holdings DROP COLUMN ledger_opening_shares;
ALTER TABLE holdings DROP COLUMN ledger_opening_cost;
```
- 既存の INSERT の値や期待値は変えない。
- 追加で、移行後に `keep_ledger_holding` トリガーが再作成されていること（`SELECT name FROM sqlite_master WHERE type='trigger'`）を1行 expect してよい。

## 変更してよいファイル
- src/lib/db/sync-schema.test.ts
- docs/renovation/reports/T18b.md（新規）

## 確認
- `npm test` で全件成功（PM_FORBID_REAL_DB=1 は設定済み）、`npx tsc --noEmit`、`npm run lint`。
- `npm run build` と `next start` は実行しないこと。

## レポート
docs/renovation/reports/T18b.md に変更点と結果（件数）を短く書く。