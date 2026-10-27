# T31 保有株の円グラフ（ドーナツ）を復活

共通ルール: docs/renovation/AGENT_RULES.md、docs/renovation/PLAN.md、デザインは docs/renovation/design/README.md を読むこと。

## 背景
刷新前はホームに「保有銘柄の構成」と「セクター構成」の円グラフ（recharts、`src/components/holding-chart.tsx`・`src/components/sector-chart.tsx`）があり、ユーザーが気に入っていた。刷新後のホーム「配分」パネル（`src/components/home/portfolio-panels.tsx` の `AllocationBar`）は横棒だけになっている。これを円グラフ付きに戻す。刷新前の使われ方は `git show 204a2e0c:src/app/page.tsx` で確認できる。

## やること
1. 既存の `holding-chart.tsx`・`sector-chart.tsx` を、刷新後のデザイン（暗い地、`--pm-*` トークン、11〜12px の高密度表記）に合わせて作り直す。新しい置き場所は `src/components/charts/allocation-donut.tsx`（汎用ドーナツ、`items: { key, label, value, percent, color? }[]`）。古い2ファイルは使われなくなるので削除してよい。
   - recharts（既存依存）を使用。ドーナツの中央に合計評価額（円）と銘柄数。
   - スライスに割合ラベル（5%未満は省略して凡例のみ）、ホバーでツールチップ（名称・評価額（円）・割合）。
   - 凡例は右側（幅が足りなければ下）に、色・名称・割合・評価額を表形式で。上位 9 件＋「その他」にまとめる。
   - 色はアクセントと調和する落ち着いた 10 色程度のパレットを定義（騰落色の赤/青は避ける）。セクターは既存のセクター定義の順で色を固定し、画面間で同じセクターが同じ色になるようにする。
   - 現金は「現金」として灰色系で表示。
2. ホーム「配分」パネルに配置
   - パネル内に「銘柄別／セクター別／市場別」の切替タブを置き、選んだ内訳をドーナツで表示（既定は銘柄別）。選択は localStorage（`pm.home.allocationView`、try/catch）に保存。
   - 既存の横棒（AllocationBar）は、ドーナツの下に「市場別」の細い帯として残すか、切替に統合する（見た目のまとまりで判断し、レポートに書く）。
   - 1440×900 のホームでレイアウトが崩れないこと（パネルの高さが大きく増えないよう、ドーナツは直径 150〜170px 程度）。
3. 保有銘柄画面にも同じドーナツを開けるようにする
   - 保有画面のツールバーに「構成」ボタンを追加し、押すとポップオーバー（またはパネル）で銘柄別／セクター別のドーナツを表示。口座フィルタがあれば、それに連動する。
4. 計算
   - 銘柄別は同一 `symbol|market` を全口座で合算した円換算評価額。価格未取得の銘柄は除外し、その件数を注記。既存の `computeHoldingsWithPrices` / `computeSummary` / ホームのセクター集計を再利用し、ホームの合計と一致させる。
   - テスト：上位9件＋その他の集約、割合の合計100%、価格欠損の除外と件数、セクター色の固定。

## 変更してよいファイル
- src/components/charts/**（新規）
- src/components/home/portfolio-panels.tsx, src/components/home/home-data.ts, src/components/home/home-data.test.ts
- src/components/holdings/**（構成ボタンとポップオーバー）
- src/components/holding-chart.tsx, src/components/sector-chart.tsx（削除可）
- src/lib/sectors.ts（色の定義を追加する場合のみ）
- docs/renovation/reports/T31.md（新規）

## 確認
- `npx tsc --noEmit`、`npm run lint`、`npm test`（PM_FORBID_REAL_DB=1 は設定済み）。
- **`npm run build`、`next start`、`npm run desktop*` は実行しないこと**（同時に別タスクが Electron 周りを編集中。画面確認はレビュー担当が行う）。

## レポート
docs/renovation/reports/T31.md に変更点・判断・確認結果を書く。