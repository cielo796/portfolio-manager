# T13 ホーム画面の作り替え

まず `docs/renovation/AGENT_RULES.md`、`docs/renovation/PLAN.md`、`docs/renovation/design/README.md` を読むこと。T11（保有銘柄画面）と T12（価格履歴・スパークライン）の後に行う。
見た目の基準は `docs/renovation/design/Main.dc.html`。

## 目的
`/` を、1画面で資産・市場・今日の動き・予定・ニュースが見渡せる高密度のホームに作り替える。

## 変更してよいファイル
- `src/app/page.tsx`
- `src/components/home/**`（新規）
- `src/components/holdings/**`（T11 で作ったサマリー帯を共通化して使う場合のみ）
- `src/hooks/use-portfolio.ts`（必要な値の追加のみ）
- `src/app/api/fundamentals/route.ts`（後述の決算日のための 24時間 DB キャッシュ追加のみ）、`src/lib/db/migrations.ts`、`src/lib/db/fundamentals-cache.ts`（新規）
- `src/types/index.ts`
- `docs/renovation/reports/T13.md`（新規）

古い `src/components/holdings-table.tsx`・`portfolio-summary.tsx`・`sector-chart.tsx`・`holding-chart.tsx`・`news-list.tsx`・`transaction-history.tsx` は、このタスク後どこからも使われなくなれば削除してよい（削除してよいファイルに含める）。

## 画面構成（上から）
1. **サマリー帯**：T11 の保有銘柄画面と同じもの（共通コンポーネントにする）。
2. **2列**（左7：右5の比率、900px 未満は縦に並ぶ）
   - 左「保有銘柄」：コード・銘柄名・現在値・前日比%・評価額（円）・評価損益・損益%・構成比の8列と合計行。行クリックで `/portfolio?symbol=<code>&market=<market>` へ（T11 の画面がこのクエリで選択状態になるよう対応する）。右上に「すべての列を表示 →」リンク。
   - 右「主要指数・為替」：`/api/market` の項目から6つ（日経225・S&P500・NASDAQ・USD/JPY・米10年債・VIX）を2列×3段のカードで表示。各カードに名称・値・騰落率と、`POST /api/sparklines`（`market: 'INDEX'`、FX は `FX`）による直近20営業日のスパークライン（SVGの折れ線、騰落色）。
3. **4列**（900px 未満は2列→1列）
   - 「今日の騰落（保有）」：前日比%の大きい順に全保有（現金除く）。コード・名称・前日比%・当日損益（円）。
   - 「配分」：セクター別と市場別の横積み上げバー＋凡例（`computeSectorAllocation` と市場別集計を使う。色は `SECTOR_CHART_COLORS`）。
   - 「決算予定（今後3週間）」：保有銘柄の次回決算日（`/api/fundamentals` の `next_earnings_date`）を日付順に。日付・曜日・コード・名称。日本株・FX は対象外（値が無ければ出さない）。
   - 「最新ニュース」：`/api/news`（キャッシュ）の新しい順6件。時刻・銘柄・見出し（1行で省略）。クリックで元記事を新しいウィンドウで開く。「一覧 →」でニュース画面へ。
4. 価格更新（上部バーのボタン）でサマリー・保有・騰落を更新する（T10 の仕組みに登録）。

## 決算日のキャッシュ
`/api/fundamentals` は毎回 Yahoo と Nasdaq に問い合わせて遅い。結果を `fundamentals_cache(symbol, market, data_json, fetched_at, PRIMARY KEY(symbol, market))` に保存し、24時間以内ならそれを返す（同期対象外・バックアップ対象外）。`?refresh=1` 相当の指定（POST 本文の `refresh: true`）で取り直す。

## きまり
- 数値は `.num`、騰落色は `var(--pm-up)` / `var(--pm-down)`、行の高さは `var(--pm-row-h)`。
- パネルの見出し・枠・余白は design/README.md のトークンに合わせる。
- 取得中はスケルトン（灰色の帯）を表示し、失敗したパネルは「取得できませんでした」と再試行ボタンを出す。1つのパネルの失敗で画面全体を止めない。

## 確認
`npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`。一時DBのコピーで `next start` を起動し、`/` が 200、サーバーログにエラーがないこと。

## レポート
`docs/renovation/reports/T13.md` に AGENT_RULES.md の形式で書く。
