# T14b テスト2件の修正（v6 追加への追従）

共通ルール: docs/renovation/AGENT_RULES.md を必ず読んで従うこと。

## 背景
T14 で `stock_prices.volume` 列を追加するマイグレーション v6 を入れた結果、既存テスト2件が失敗している。

## やること
1. `src/components/home/fundamentals-cache.test.ts` 46行目付近
   - `user_version` を 5 に固定比較している。`toBeGreaterThanOrEqual(5)` に変える（固定値比較は禁止ルール）。
2. `src/lib/db/sync-schema.test.ts` 225行目付近
   - `INSERT INTO stock_prices VALUES (...)` が列名を省略している。既存8列の列名を明示した INSERT に書き換える（値は変えない）。
   - 列名は `src/lib/db/prices.ts` の upsert を参照すること。

## 変更してよいファイル
- src/components/home/fundamentals-cache.test.ts
- src/lib/db/sync-schema.test.ts
- docs/renovation/reports/T14b.md（新規）

## 確認
- `npm test` を実行し全件成功を確認（PM_FORBID_REAL_DB=1 は環境変数で設定済み）。
- `npm run build` は実行しないこと（別作業でビルド成果物を使用中）。
- `npx tsc --noEmit` と `npm run lint` を実行。

## レポート
docs/renovation/reports/T14b.md に、変更点・各コマンドの結果（件数）を短く書く。