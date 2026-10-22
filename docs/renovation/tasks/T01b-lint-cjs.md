# T01b lint エラーの解消（CommonJS スクリプト）

まず `docs/renovation/AGENT_RULES.md` を読み、ルールに従うこと。
**同時に別のエージェントが `src/lib/` と `src/app/api/` を変更している。それらの変更には一切触れず、`git status` に出ても無視すること。**

## 目的
`npm run lint` で `scripts/node-readlink-eisdir-fix.cjs` の `require()` が `@typescript-eslint/no-require-imports` エラーになっている。このファイルは Node の `--require` で読み込む CommonJS なので `require` が正しい。lint 設定側で `.cjs` ファイルに限りこのルールを無効にする。

## 変更してよいファイル
- `eslint.config.mjs`
- `docs/renovation/reports/T01b.md`（新規）

## やること
`eslint.config.mjs` の `defineConfig([...])` の配列に、次の設定オブジェクトを `globalIgnores(...)` の前に1つ追加する。
```js
{
  files: ["**/*.cjs"],
  rules: {
    "@typescript-eslint/no-require-imports": "off",
  },
},
```
`scripts/node-readlink-eisdir-fix.cjs` 自体は変更しない。

## 確認
`npm run lint` を実行し、`scripts/node-readlink-eisdir-fix.cjs` のエラーが消えたことを確認する。他のファイルにエラーが出ても、それが `src/lib/` や `src/app/api/` の作業中のファイルなら無視してよい（レポートに書くだけ）。

## レポート
`docs/renovation/reports/T01b.md` に AGENT_RULES.md の形式で書く。
