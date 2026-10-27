# T08c `npm run dev` が起動しない問題の修正

まず `docs/renovation/AGENT_RULES.md` を読み、ルールに従うこと。

## 背景
Next.js 16 では `next dev` の既定が Turbopack になったが、`next.config.ts` に `webpack` の設定があるため、`npm run dev` がページを配信する前に終了する。`npm run build` はすでに `--webpack` を付けている。`npm run desktop`（`electron/desktop-runner.mjs` が `npm run dev` を呼ぶ）も同じ理由で起動しない。

## 変更してよいファイル
- `package.json`（`scripts.dev` の1行のみ）
- `docs/renovation/reports/T08c.md`（新規）

## やること
`package.json` の `"dev": "next dev"` を `"dev": "next dev --webpack"` に変える。他は変えない。

## 確認
1. 一時フォルダに空のDBパスを用意し、`$env:SQLITE_DB_PATH` にそれを設定してから `npm run dev -- -p 3012 --hostname 127.0.0.1` を起動し、`http://127.0.0.1:3012/` が 200 を返すことを確認して停止する。**`SQLITE_DB_PATH` を設定せずに起動しないこと**（実DBを開いてしまうため）。
2. `npm run lint`

## レポート
`docs/renovation/reports/T08c.md` に AGENT_RULES.md の形式で書く。
