# T15 銘柄詳細画面（ローソク足チャート）と銘柄検索

まず `docs/renovation/AGENT_RULES.md`、`docs/renovation/PLAN.md`、`docs/renovation/design/README.md` を読むこと。T12（`/api/chart`）の後に行う。
見た目の基準は `docs/renovation/design/Detail.dc.html`。

## 追加してよい依存
- `lightweight-charts`（TradingView 製、Apache-2.0）

## 変更してよいファイル
- `src/app/detail/page.tsx`（新規。`/detail?symbol=NVDA&market=US`）
- `src/components/detail/**`（新規）
- `src/components/shell/top-bar.tsx`、`src/components/shell/side-nav.tsx`（検索欄とナビ項目の追加）
- `src/components/holdings/**`、`src/components/watchlist/**`、`src/components/home/**`（銘柄名から詳細画面へのリンクを足すことと、下記「保有銘柄画面のクエリ対応」）
- `src/app/portfolio/page.tsx`（下記「保有銘柄画面のクエリ対応」）
- `src/lib/chart-data.ts`（指標計算の追加）
- `src/types/index.ts`、`package.json`、`package-lock.json`
- `docs/renovation/reports/T15.md`（新規）

## 画面（3ペイン）
1. **左：銘柄リスト**（幅220〜260px）：タブ「保有」「メイン」「サブ1」〜「サブ4」。コード・名称・現在値・前日比%。クリックでその銘柄に切り替え（URL のクエリも更新）。選択中の行を強調。
2. **中央**
   - 見出し：コード・名称・市場・セクター・状態（保有中／登録リスト名）、現在値と前日比（大きめ）、始値・高値・安値・前日終値・出来高。
   - ツールバー：期間（3M・6M・1Y・5Y）、足（日足・週足・月足）、移動平均の表示切替（MA5・MA25・MA75。米国株は MA20・MA50・MA200 を既定にしてよい）、「取得単価」ライン、「目標価格」ライン、「売買記録」マーカー。設定は `localStorage`（`pm.chart`）に保存。
   - チャート：`lightweight-charts` のローソク足＋出来高（下段）＋移動平均。騰落色は `--pm-up` / `--pm-down` を読んで使う。取得単価（保有中のみ）と目標価格（ウォッチリストに目標があるときのみ）を水平の点線で表示し、右端にラベル。売買記録（`/api/transactions` の該当銘柄）を購入▲・売却▼のマーカーで表示。背景・グリッド・文字色はデザイントークンに合わせる。ウィンドウ幅の変化に追従。
   - 下段タブ：「ニュース」（`/api/news` から該当銘柄の新しい順10件）、「売買記録」（該当銘柄の取引一覧）。メモ・トレードアイデアのタブは後続タスクで足すので今は作らない。
3. **右：指標**（幅240〜280px）：保有情報（保有中のみ。数量・取得単価・評価額・評価損益と率・当日損益）、財務・バリュエーション（`/api/fundamentals` のキャッシュ。時価総額・PER（実績／予想）・PBR・PSR・売上高成長率・営業利益率・ROE・自己資本比率・ネットキャッシュ・配当利回り・次回決算）。値が無い項目は「—」。

## 銘柄検索（上部バー）
- 上部バーに検索欄を追加（Ctrl+K でフォーカス）。保有・ウォッチリスト・ティッカー候補（`/api/tickers`）を対象に、コードと名称の部分一致で候補を最大10件表示。上下キーで選択、Enter で `/detail?symbol=…&market=…` へ。
- 候補が無いとき、入力が米国株らしい英字なら「NVDA（米国）で開く」、4桁数字なら「7203（日本）で開く」を出す。

## 保有銘柄画面のクエリ対応
`/portfolio?symbol=<code>&market=<market>`（ホームの保有一覧からの遷移）で開いたとき、その銘柄を選択状態にして右ペインに表示する（`src/app/portfolio/page.tsx` と `src/components/holdings/holdings-workspace.tsx` の変更を許可。`useSearchParams` を使う場合は Next.js 16 の要件どおり `Suspense` で包む）。

## ナビ
左ナビに「銘柄詳細」（`/detail`、クエリが無ければ保有の先頭銘柄）を「登録銘柄」の次に追加。保有銘柄・登録銘柄・ホームの銘柄名から詳細画面へリンクする。

## 確認
`npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`。一時DBのコピーで `next start` を起動し、`/detail?symbol=NVDA&market=US`・`/detail?symbol=7203&market=JP`・`/detail?symbol=USDJPY&market=FX` が 200、ブラウザのコンソールにエラーが出ないこと（確認できなければ理由を書く）。

## レポート
`docs/renovation/reports/T15.md` に AGENT_RULES.md の形式で書く。
