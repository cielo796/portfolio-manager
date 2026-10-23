# T15b 銘柄詳細チャートの表示修正（小修正）

共通ルール: docs/renovation/AGENT_RULES.md を必ず読んで従うこと。

## 不具合1: チャート中段の白い帯
- 原因: `src/app/globals.css` の `.pm-main table :is(th, td) { height: var(--pm-row-h); padding-block: ... }` が、lightweight-charts が内部で使う `<table>`（`.tv-lightweight-charts` の中）にも効き、ペイン区切り行が 24px に広がっている。区切り線の色もライブラリ既定の #E0E3EB（白っぽい）のまま。
- 修正:
  1. globals.css の該当セレクタ（324行目付近）と、410行目付近の `table tbody tr` 系のルールがあれば同様に、`.tv-lightweight-charts` 配下のテーブルを対象外にする。例: `.pm-main table:not(.tv-lightweight-charts table) :is(th, td)`。既存の一覧テーブルの見た目は変えないこと。
  2. `src/components/detail/candlestick-chart.tsx` の `createChart` オプションの `layout` に `panes: { separatorColor: color('--pm-border'), separatorHoverColor: color('--pm-border'), enableResize: false }` を追加する（`color()` は同ファイルの既存ヘルパー）。

## 不具合2: 検索後に検索欄の文字が残る
- `src/components/detail/symbol-search.tsx`: 候補を確定して遷移したら入力欄を空にし、候補リストを閉じる。

## 変更してよいファイル
- src/app/globals.css
- src/components/detail/candlestick-chart.tsx
- src/components/detail/symbol-search.tsx
- docs/renovation/reports/T15b.md（新規）

## 確認
- `npx tsc --noEmit`、`npm run lint`、`npm test` を実行（PM_FORBID_REAL_DB=1 は設定済み）。
- `npm run build` と `next start` は実行しないこと（別タスクが使用中）。

## レポート
docs/renovation/reports/T15b.md に変更点と各コマンドの結果を短く書く。