# T12 価格履歴（日足）の保存と `/api/chart`

まず `docs/renovation/AGENT_RULES.md`、`docs/renovation/PLAN.md` を読むこと。

## 目的
銘柄詳細のローソク足チャート、ホームやマーケットのミニチャート（スパークライン）、登録銘柄の52週高値・安値と5日チャートに使う日足データを、取得して DB に保存し、API で返す。

## 変更してよいファイル
- `src/lib/db/migrations.ts`（次の番号のマイグレーションを追加）
- `src/lib/db/price-history.ts`（新規）、`src/lib/db/index.ts`
- `src/lib/market.ts`（Yahoo chart API の呼び出しの共通化に必要な範囲）
- `src/lib/chart-data.ts`（新規、移動平均などの純粋関数）
- `src/app/api/chart/route.ts`（新規）、`src/app/api/sparklines/route.ts`（新規）
- `src/types/index.ts`
- テスト：`src/lib/chart-data.test.ts`、`src/lib/db/price-history.test.ts`（新規）
- `docs/renovation/reports/T12.md`（新規）

## 1. テーブル（キャッシュなので同期対象外・バックアップ対象外）
```
price_history(symbol TEXT, market TEXT, date TEXT /* YYYY-MM-DD 取引所の現地日付 */,
  open REAL, high REAL, low REAL, close REAL NOT NULL, volume REAL,
  updated_at TEXT NOT NULL, PRIMARY KEY(symbol, market, date))
```
指数（`^N225` など）も同じテーブルに `market = 'INDEX'` で入れる。`market` の CHECK 制約は付けない。

## 2. 取得
- Yahoo chart API（`range` と `interval=1d`）。日本株は `.T`、FX は `=X`（既存の `toYahooSymbol` と同じ規則）。
- タイムスタンプは取引所のタイムゾーン（応答の `meta.exchangeTimezoneName`）で日付に直す。
- **差分取得**：DBにある最新日付から今日までだけを取る（最新日付が無ければ `range=5y`）。最新日付が今日・前営業日なら取得しない（ただし当日分は最新値で上書きするため、最終取得から15分以上たっていれば `range=5d` で取り直す）。
- 同時に Yahoo へ出すリクエストは4件まで。

## 3. API
- `GET /api/chart?symbol=NVDA&market=US&range=3m|6m|1y|5y&interval=d|w|m`
  - `{ symbol, market, currency, candles: [{ date, open, high, low, close, volume }], fetchedAt, stale: boolean }`
  - 週足・月足は日足から集計（`chart-data.ts` の純粋関数）。
  - 取得に失敗してDBに古いデータがあれば、それを返して `stale: true`。何も無ければ 502。
- `POST /api/sparklines`：`{ items: [{ symbol, market }], days?: number /* 既定 5 */ }` → `{ items: [{ symbol, market, closes: number[], high52w?: number, low52w?: number }] }`。最大100件。52週高値・安値は1年分の日足から計算（無ければ省略）。
- `chart-data.ts`：週足・月足への集計、単純移動平均（期間指定、データ不足の位置は `null`）、52週高値・安値。

## テスト
- `chart-data.test.ts`：集計（週の境界は月曜始まり）、移動平均、52週高安、空配列。
- `price-history.test.ts`：一時DBで upsert・期間取得・差分取得の開始日の計算（fetch はスタブ）。AGENT_RULES の DB テストのきまりを守る。

## 確認
`npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`。一時DBのコピーで `next start` を起動し、`/api/chart?symbol=NVDA&market=US&range=1y` と `symbol=7203&market=JP`、`symbol=USDJPY&market=FX`、`POST /api/sparklines` が値を返すこと（ネットワークに出られなければ 502 / 空になることを確認）。

## レポート
`docs/renovation/reports/T12.md` に AGENT_RULES.md の形式で書く。
