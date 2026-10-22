# T13b テストの固定バージョン番号の修正（2件目）

まず `docs/renovation/AGENT_RULES.md` を読み、ルールに従うこと（6. DB の「user_version を固定の数値で比べない」）。
**同時に別のエージェントが `src/components/watchlist/` などを変更している。`src/lib/db/price-history.test.ts` 以外には触れず、`git status` に出る他の変更は無視すること。`npm run build` は実行しないこと。**

## やること
`src/lib/db/price-history.test.ts` の69行目付近、`user_version` を `4` と固定で比べている箇所を `toBeGreaterThanOrEqual(4)` に変える（このテストの意図は「価格履歴テーブル（version 4）以降まで移行できること」）。ほかにも同じファイル内で `user_version` を固定値で比べている箇所があれば同様に直す。

## 変更してよいファイル
- `src/lib/db/price-history.test.ts`
- `docs/renovation/reports/T13b.md`（新規）

## 確認
`SQLITE_DB_PATH` を一時パスにして `npx vitest run`（全件）。`npm run lint`。

## レポート
`docs/renovation/reports/T13b.md` に AGENT_RULES.md の形式で書く。
