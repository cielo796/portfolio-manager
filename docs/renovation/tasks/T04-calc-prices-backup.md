# T04 計算ロジックの切り出し・テスト、価格キーの修正、価格未取得の扱い、バックアップ取込の修正

まず `docs/renovation/AGENT_RULES.md` と `docs/renovation/PLAN.md` を読み、ルールに従うこと。
このタスクは T02（`src/lib/db/`）と T03（セクター統一）の後に行う。

## 変更してよいファイル
- `src/lib/portfolio-calc.ts`（新規）、`src/lib/price-key.ts`（新規）
- `src/lib/portfolio-calc.test.ts`、`src/lib/price-key.test.ts`、`src/lib/db/backup.test.ts`（新規）
- `vitest.config.ts`（新規）、`package.json`（devDependencies に `vitest` を追加、scripts に `"test": "vitest run"` を追加）、`package-lock.json`
- `src/hooks/use-portfolio.ts`
- `src/lib/db/prices.ts`、`src/lib/db/backup.ts`
- `src/app/api/prices/route.ts`、`src/app/api/portfolio-data/route.ts`
- `src/app/watchlist/page.tsx`（価格キーの helper を共通化する部分だけ）
- `src/components/holdings-table.tsx`、`src/components/portfolio-summary.tsx`（価格未取得の表示だけ）
- `src/lib/mock-data.ts`（価格のキー変更だけ）
- `src/types/index.ts`
- `docs/renovation/reports/T04.md`（新規）

追加してよい依存は `vitest` のみ（devDependencies）。

## 1. 価格マップのキーを `symbol|market` にする
- `src/lib/price-key.ts` に `priceKey(symbol: string, market: Market): string`（`${symbol.toUpperCase().trim()}|${market}`）を作る。
- `listStockPrices()` の戻り値、`POST /api/prices` のレスポンスの `prices`、`/api/portfolio-data` の `stockPrices`、`mockStockPrices` のキーをすべて `priceKey` にする。
- `use-portfolio.ts` の参照（`stockPrices[holding.symbol]`、`nextPrices.USDJPY` など）を `priceKey` に合わせる。USD/JPY は `priceKey('USDJPY', 'FX')`。
- `watchlist/page.tsx` のローカル `getPriceKey` と `pricesToPriceMap` は、`priceKey` を使う形にする。API がすでに `symbol|market` キーで返すので `pricesToPriceMap` は不要になるはず。画面の挙動は変えない。

## 2. 計算ロジックを純粋関数に切り出す
`use-portfolio.ts` にある、保有の評価額・損益・円換算、サマリー、セクター配分、銘柄別配分の計算を `src/lib/portfolio-calc.ts` に移す。
```ts
computeHoldingsWithPrices(holdings: Holding[], prices: Record<string, StockPrice>, usdJpy: number): HoldingWithPrice[]
computeSummary(holdings: HoldingWithPrice[], usdJpy: number): PortfolioSummary
computeSectorAllocation(holdings: HoldingWithPrice[], total: number): SectorAllocation[]
computeHoldingAllocation(holdings: HoldingWithPrice[], total: number): HoldingAllocation[]
```
- React に依存しないこと。`use-portfolio.ts` はこれらを呼ぶだけにする（useMemo で包む）。
- 計算結果は、価格がある銘柄については今とまったく同じになること。

## 3. 価格未取得の扱い
今は価格がない銘柄の現在値を取得単価で代用しており、損益0に見える。また `loadPortfolioData` が `mockStockPrices` を実データに混ぜているため、取得していない銘柄にモックの価格が表示される。これを直す。
- `loadPortfolioData` の成功時は `mockStockPrices` を混ぜない。API に届かないとき（catch）のモックへのフォールバックは残す。
- `HoldingWithPrice` に `price_status: 'live' | 'missing' | 'cash'` を追加する。
- 価格がない銘柄（現金以外）は `price_status = 'missing'`、`current_price` と `profit_loss` と `profit_loss_percent` と `change_percent` は `undefined`。評価額（`current_value` / `current_value_jpy`）は取得額で代用し、総資産が欠けないようにする。
- `PortfolioSummary` に `missing_price_count: number` を追加する。評価損益と損益率の合計は、価格がある銘柄だけで計算する（取得額も価格がある銘柄だけ）。日次損益は価格がある銘柄だけ。
- 表示：保有一覧の現在値・損益の欄に「価格未取得」と表示する（文字色は `text-slate-400`）。サマリーカードは `missing_price_count > 0` のとき「価格未取得 N銘柄（評価額は取得額で計算）」と小さく表示する。
- USD/JPY が取れていないときは、今と同じく `mockExchangeRate` の値を使ってよい。ただしサマリーに「為替は仮の値」と分かる表示を足す必要はない（後のフェーズで対応）。

## 4. バックアップ取込の修正
`importBackupData` は、`portfolios` が空だとモックの口座を入れて `return` するため、ウォッチリスト・ティッカー候補・トレードアイデアまで取り込まれずに消える。
- `portfolios` が空のときもモックの口座を入れたうえで、口座に依存しないデータ（`watchlistItems`、`tickerPresets`、`tradeIdeas`）は取り込む。保有と取引は、対応する口座がないので取り込まない（今と同じ）。
- 取り込みは今どおり1つのトランザクションで行う。

## 5. テスト（vitest）
- `vitest.config.ts`：`@/` を `src/` に解決し、`server-only` を空のモジュールに差し替える（`resolve.alias`）。環境は `node`。
- `portfolio-calc.test.ts`：米国株の円換算、USDクォートのFX（例 EURUSD）、JPYクォートのFX、現金（USD・JPY）、価格未取得の銘柄が混ざったときの総資産・損益・`missing_price_count`、日次損益率、セクター配分（現金・FXの扱いと合計100%）を最低限カバーする。
- `price-key.test.ts`：大文字化と前後の空白除去。
- `backup.test.ts`：一時ディレクトリのDBパスを `SQLITE_DB_PATH` に設定してから `@/lib/db` を動的 import し、(a) 通常のバックアップの書き出し→取込で件数が一致する、(b) `portfolios: []` でウォッチリストとティッカー候補が取り込まれる、を確認する。テスト後に一時ファイルを消す。

## 確認
1. `npm install`（vitest 追加のため）、`npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`
2. 本物の `data/portfolio.db` には触れない。

## レポート
`docs/renovation/reports/T04.md` に AGENT_RULES.md の形式で書く。テストの件数と結果を載せる。
