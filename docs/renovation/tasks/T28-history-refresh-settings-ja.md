# T28 資産推移の価格更新と、設定画面の日本語化（小修正）

共通ルール: docs/renovation/AGENT_RULES.md を必ず読んで従うこと。

## 1. 資産推移画面の「価格更新」で保有の価格も更新する
`src/components/history/history-workspace.tsx` は `usePageRefresh(refresh, ...)` で上部バーの「価格更新」に登録しているが、`refresh` はスナップショットを読み直すだけで、保有銘柄の価格を取得しない。そのため、この画面で価格更新を押しても今日の実測が記録されない（保有画面で更新すると記録される）。
- `refresh` の中で、まず全保有（CASH 除く、`/api/portfolio-data` の holdings）の `symbol`/`market` を `POST /api/prices` に送って価格を取得・保存し（サーバー側がこの時に日次記録を行う）、その後スナップショットを読み直す。
- `POST /api/prices` のリクエスト形式は `src/app/api/prices/route.ts` の `PriceRequest` を読んで合わせる。保有画面で使っている既存の価格更新処理（hooks 等）があれば、それを再利用してよい（読み取りのみ、そのファイルは変更しない）。
- 価格取得が一部失敗しても、スナップショットの読み直しは行う。

## 2. 設定画面の英語表記を日本語にする
`src/app/settings/page.tsx` に刷新前の英語表記が残っている。以下を日本語にする（意味を保ち、他画面の語調に合わせる）。
- `Settings` → `設定`
- `Manage ticker presets, backup, and storage.` → `ティッカー、バックアップ、保存先の管理`
- `Database` → `データベース`、`Data is stored in a local SQLite database.` → `データはこのPCのSQLiteデータベースに保存されます。`、`DB file:` → `DBファイル:`
- `Registered Tickers` → `登録ティッカー`、`Actions` → `操作`、`No registered tickers yet.` → `登録されたティッカーはありません。`、`Loading ticker presets...` → `ティッカーを読み込み中…`
- `Delete all data and reset the app.` → `すべてのデータを削除してアプリを初期化します。`
- `Portfolio Manager v0.1.0` はそのまま
- 同ファイル内にほかの英語の見出し・ボタン・説明文があれば同様に日本語化する（コード上の識別子やAPIのキーは変えない）。

## 変更してよいファイル
- src/components/history/history-workspace.tsx
- src/app/settings/page.tsx
- docs/renovation/reports/T28.md（新規）

## 確認
- `npx tsc --noEmit`、`npm run lint`、`npm test`（PM_FORBID_REAL_DB=1 は設定済み）。
- **`npm run build`、`next start`、`npm run desktop*` は実行しないこと**（ユーザーが本番DBでアプリを使用中）。

## レポート
docs/renovation/reports/T28.md に変更点と結果を短く書く。