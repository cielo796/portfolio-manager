# T19b 同期スキーマテストを v8（銘柄メモ）に追従（小修正）

共通ルール: docs/renovation/AGENT_RULES.md を必ず読んで従うこと。

## 背景
T19 で `stock_memos` と `memo_symbols`（テーブル名は src/lib/db/migrations.ts の v8 と src/lib/db/sync-tables.ts で確認）を同期対象に追加した結果、`src/lib/db/sync-schema.test.ts` の2件が失敗している。

## やること
1. 「バージョン2の既存データを保持して移行し、再実行しても変わらない」
   - 既に v7 追加物を外している `legacy.exec(...)` に、v8 で追加されたメモ2テーブル（と、その索引があれば索引）の `DROP TABLE IF EXISTS` を追加する（子テーブル memo_symbols → 親 stock_memos の順）。
   - その後の `for (const table of SYNC_TABLES)` ループは、v2 時点で存在したテーブルだけを対象にする必要がある。テスト内に v2 時点のテーブル一覧（例: `const LEGACY_SYNC_TABLES = ['portfolios','holdings','transactions','trade_ideas','watchlist_items','ticker_presets']`。実際の旧6テーブル名をテストの既存 INSERT から確認）を定義し、旧スキーマ再現と移行後の検証ループの両方でそれを使う。
   - 移行後に、メモ2テーブルが存在し同期列（deleted_at, updated_by）を持つことを expect してよい。
2. 「バックアップは同期情報を含まず、取込は旧行を論理削除して自分の更新として復活する」（275行付近）
   - 全同期対象に有効行が1件あることを期待している箇所を、fixture に含まれる旧6テーブルは1件、メモ2テーブルは0件、という期待に変える（上の LEGACY_SYNC_TABLES を再利用）。

## 変更してよいファイル
- src/lib/db/sync-schema.test.ts
- docs/renovation/reports/T19b.md（新規）

## 確認
- `npm test` 全件成功、`npx tsc --noEmit`、`npm run lint`（PM_FORBID_REAL_DB=1 は設定済み）。
- `npm run build` と `next start` は実行しないこと。

## レポート
docs/renovation/reports/T19b.md に変更点と結果（件数）を短く書く。