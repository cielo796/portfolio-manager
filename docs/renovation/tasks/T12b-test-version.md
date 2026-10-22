# T12b テストの固定バージョン番号の修正

まず `docs/renovation/AGENT_RULES.md` を読み、ルールに従うこと。
**同時に別のエージェントが `src/lib/db/migrations.ts` などを変更している。`src/lib/db/sync-schema.test.ts` 以外には触れず、`git status` に出る他の変更は無視すること。`npm run build` は実行しないこと。**

## 目的
`src/lib/db/sync-schema.test.ts` の97行目付近 `expect(legacy.pragma('user_version', { simple: true })).toBe(3);` は、マイグレーションが増えるたびに壊れる。このテストの意図は「version 2 の旧DBから、同期用スキーマ（version 3）以降まで移行できること」なので、`toBeGreaterThanOrEqual(3)` に変える。

## 変更してよいファイル
- `src/lib/db/sync-schema.test.ts`（上記の1行のみ）
- `docs/renovation/reports/T12b.md`（新規）

## 確認
`SQLITE_DB_PATH` を一時パスにして `npx vitest run src/lib/db/sync-schema.test.ts` を実行し、全件成功すること。`npm run lint`。

## レポート
`docs/renovation/reports/T12b.md` に AGENT_RULES.md の形式で書く。
