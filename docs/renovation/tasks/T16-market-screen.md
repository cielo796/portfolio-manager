# T16 マーケット画面

まず `docs/renovation/AGENT_RULES.md`、`docs/renovation/PLAN.md`、`docs/renovation/design/README.md` を読むこと。T12（価格履歴・スパークライン）の後に行う。
見た目の基準は `docs/renovation/design/Market.dc.html`。

## 変更してよいファイル
- `src/lib/market.ts`、`src/app/api/market/route.ts`（対象の追加と `group` の付与）
- `src/app/market/page.tsx`（新規）、`src/components/market/**`（新規）
- `src/components/shell/side-nav.tsx`
- `src/types/index.ts`
- `src/lib/market.test.ts`
- `docs/renovation/reports/T16.md`（新規）

## API の拡張
`/api/market` の各項目に `group: 'index' | 'fx' | 'rate' | 'commodity' | 'sector'` を付け、次を追加する（ティッカーは今の11項目だけを表示し続けるよう、ティッカー側は `group !== 'sector'` かつ既存のキーだけに絞る）。
- 株価指数：グロース250（Yahoo で取得できるシンボルを調べ、無ければ外す）、ラッセル2000 `^RUT`
- 為替：EUR/USD `EURUSD=X`、GBP/JPY `GBPJPY=X`、AUD/JPY `AUDJPY=X`
- 金利：米2年債（`2YY=F` など取得できるもの。無ければ外す）、米30年債 `^TYX`
- 商品：銅 `HG=F`、ビットコイン `BTC-USD`
- 米国セクターETF（`group: 'sector'`）：XLK・XLC・XLY・XLP・XLV・XLF・XLI・XLE・XLB・XLU・XLRE（表示名は `sectors.ts` の日本語ラベルに対応させる）
取得できなかったシンボルはレポートに書く。

## 画面 `/market`
1. 上段：4つのパネル（株価指数・為替・金利・商品）。各行：名称・現在値・前日比・騰落率・5日スパークライン（`POST /api/sparklines`、`market: 'INDEX'`、FX は `FX`）。
2. 下段左：「米国セクター別騰落」。期間切替（1日・1週・1か月・年初来）。1日は `/api/market` の騰落率、それ以外は `/api/sparklines` か `/api/chart` の終値から計算。中央が0の横棒グラフ（右に上昇・左に下落、騰落色）を騰落率の大きい順に。
3. 下段右：「ヒートマップ（保有＋登録銘柄）」。セクターごとにタイルを並べ、タイルの色の濃さ＝前日比（±3%で最大）、幅＝保有は評価額に比例（最小80px）、登録は一定。切替「保有＋登録」「保有のみ」。タイルクリックで銘柄詳細へ（T15 ができていれば。無ければリンクなし）。凡例（-3%〜+3%）。
- 左ナビに「マーケット」（`/market`）を「銘柄詳細」の次に追加。
- 上部バーの価格更新に登録する。

## 確認
`npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`。一時DBのコピーで `next start` を起動し、`/market` が 200、`/api/market` に追加項目が入ること。

## レポート
`docs/renovation/reports/T16.md` に AGENT_RULES.md の形式で書く。
