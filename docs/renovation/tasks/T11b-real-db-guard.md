# T11b 実DBを開けなくするガード（作業中の事故防止）

まず `docs/renovation/AGENT_RULES.md` を読み、ルールに従うこと。

## 背景
T06 と T11 で、検証中の実装エージェントが `SQLITE_DB_PATH` を設定し忘れ、`.env.local` の `SQLITE_DB_PATH=data/portfolio.db` によって実DBを開いてしまった。環境変数 `PM_FORBID_REAL_DB=1` が設定されているときは、実DBを開こうとした時点で例外を投げて止まるようにする。

## 変更してよいファイル
- `src/lib/db/connection.ts`
- `src/lib/db/connection.test.ts`（新規）
- `docs/renovation/AGENT_RULES.md`（6. DB の項に1行追記するだけ）
- `docs/renovation/reports/T11b.md`（新規）

## やること
1. `connection.ts` に関数 `assertNotForbiddenPath(dbPath: string)` を追加する。
   - `process.env.PM_FORBID_REAL_DB === '1'` のときだけ働く。
   - `path.resolve(dbPath)` と `path.resolve(process.cwd(), 'data', 'portfolio.db')` を比べ、同じなら `Error('PM_FORBID_REAL_DB=1 のため実DB（data/portfolio.db）は開けません。SQLITE_DB_PATH に一時ファイルを指定してください。')` を投げる。Windows では大文字小文字を区別しない（両方 `toLowerCase()` してから比べる）。
2. `getDb()` が DB を開く直前と、`openDatabase(path)` の先頭で、この関数を呼ぶ。
3. `connection.test.ts`：`PM_FORBID_REAL_DB=1` のとき実DBのパス（大文字小文字違いを含む）で例外になること、一時パスでは例外にならないこと、変数が無いときは実DBのパスでも例外にならない（判定関数だけを呼んで確かめ、**実際に実DBを開かない**）こと。テスト後に環境変数を元に戻す。
4. `AGENT_RULES.md` の 6. に「作業用の実行環境では `PM_FORBID_REAL_DB=1` が設定されており、実DBを開くと例外になる。例外が出たら `SQLITE_DB_PATH` の設定漏れを直すこと（ガードを外さない）」と追記する。

## 確認
`npx tsc --noEmit`、`npm run lint`、`npm test`（`SQLITE_DB_PATH` に一時パスを設定して実行）。

## レポート
`docs/renovation/reports/T11b.md` に AGENT_RULES.md の形式で書く。
