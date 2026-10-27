# T02 sqlite.ts の分割と user_version によるマイグレーション管理

まず `docs/renovation/AGENT_RULES.md` と `docs/renovation/PLAN.md` を読み、ルールに従うこと。

## 目的
1,340行ある `src/lib/sqlite.ts` を責務ごとのモジュールに分け、スキーマ変更を `PRAGMA user_version` の番号で管理できるようにする。**アプリの挙動・APIの入出力・DBの中身は一切変えない**純粋なリファクタリング。後続のフェーズ1（LAN同期）でテーブル追加・列追加を安全に重ねるための土台。

## 変更してよいファイル
- `src/lib/sqlite.ts`（削除）
- `src/lib/db/**`（新規）
- `src/app/api/**/route.ts` の import 文のみ（`@/lib/sqlite` → `@/lib/db`）
- `docs/renovation/reports/T02.md`（新規）
- 確認用の一時スクリプトは `tmp/` に置き、作業の最後に削除する

## 構成
```
src/lib/db/
  index.ts          … 公開関数と型の再エクスポート（今 sqlite.ts が export しているものをすべて）
  connection.ts     … getDb()。DBパスの解決（SQLITE_DB_PATH、既定は data/portfolio.db）、globalThis へのキャッシュ、初回のみ migrate → seed
  migrations.ts     … マイグレーション定義と runMigrations(db)
  seed.ts           … seedIfEmpty（モックの口座・保有・取引の投入）
  validators.ts     … isValidMarket / isValidWatchlistKey などの共通判定
  portfolios.ts     … listPortfolios
  holdings.ts       … list / create / updateById / deleteById / updateHoldingsOrder
  transactions.ts   … list / create
  trade-ideas.ts    … list / create / updateById / deleteById
  watchlist.ts      … list / create / updateById / deleteById / updateWatchlistItemsLayout
  ticker-presets.ts … list / create / deleteById
  prices.ts         … listStockPrices / upsertStockPrices
  news.ts           … listNewsItems / upsertNewsItems
  backup.ts         … BackupData 型 / exportBackupData / importBackupData / clearAllData
```
- 各ファイルの先頭に `import 'server-only';` を付ける（今の sqlite.ts と同じ）。
- 関数名・引数・戻り値・SQL の結果は今と同じにする。ロジックの改善やバグ修正はしない（バックアップ取込の既知の問題も T04 で直すので、ここでは触らない）。

## マイグレーションの設計
- `migrations.ts` に番号付きの配列 `MIGRATIONS: Array<{ version: number; name: string; up: (db) => void }>` を持つ。
- `runMigrations(db)` は `PRAGMA user_version` を読み、それより大きい version の `up` を順に1つのトランザクション内で実行し、各実行後に `user_version` を更新する。
- **version 1**（基準スキーマ）は2つのケースを両方扱うこと。
  1. 新規DB：今の `initialize()` の CREATE TABLE 群とインデックスで全テーブルを作る。
  2. 既存DB（`user_version = 0` だがテーブルがある）：今の `ensureFxMarketSupport` / `ensureHoldingsOrderSupport` / `ensureWatchlistLayoutSupport` / `ensureWatchlistNameSupport` / `ensureWatchlistSectorSupport` と同じ処理を行い、今と同じ最終状態にする。CREATE TABLE IF NOT EXISTS とインデックス作成も実行する。
- `ensureFxMarketSupport` のように `foreign_keys = OFF` が必要な処理は、トランザクションの外で PRAGMA を切り替える必要がある（SQLite の仕様）。今のコードの順序を保つこと。
- `journal_mode = WAL` と `foreign_keys = ON` の設定は connection.ts で毎回行う。
- 今は起動のたびに `ensureWatchlistSectorSupport` が全行のセクター正規化を実行しているが、新しい設計では version 1 で1回だけ行う。挿入・更新時の正規化は既存の create/update 関数がすでに行っているので、それで足りる。

## import の付け替え
`src/app/api/**/route.ts` の `from '@/lib/sqlite'` を `from '@/lib/db'` に変える（15ファイル）。`scripts/seed-us-watchlist.mjs` は better-sqlite3 を直接使っているので変更不要だが、スキーマ（列名）が変わっていないことを確認する。

## 確認（すべて実行し、結果をレポートに書く）
1. `npx tsc --noEmit` と `npm run lint`
2. `npm run build`
3. 既存DBでの動作：`data/portfolio.db` を一時フォルダにコピーし（WAL があれば `-wal` `-shm` も）、`SQLITE_DB_PATH` にそのコピーを指定して `npx next start -p 3999` を起動し、`/api/portfolio-data`・`/api/watchlist`・`/api/tickers`・`/api/backup` を取得できること。さらに、better-sqlite3 を直接使う一時スクリプトで、コピー前後の各テーブルの行数が変わらないこと、`user_version` が 1 になったことを確認する。
4. 新規DBでの動作：存在しないパスを `SQLITE_DB_PATH` に指定して起動し、全テーブルが作られ、モックの口座・保有・取引が入り、`user_version` が 1 であること。
5. 3 と 4 の起動を2回ずつ行い、2回目でもエラーにならない（冪等である）こと。
6. サーバーを止め、一時フォルダとスクリプトを削除する。**本物の `data/portfolio.db` には触れないこと。**

サンドボックスの制約でサーバー起動やポート待ち受けができない場合は、その旨と代わりに行った確認をレポートに書く。

## レポート
`docs/renovation/reports/T02.md` に AGENT_RULES.md の形式で書く。行数の比較結果も表で載せる。
