# T32 ホーム画面のカードをマウスでリサイズ可能にする

共通ルール: docs/renovation/AGENT_RULES.md、docs/renovation/PLAN.md、デザインは docs/renovation/design/README.md を読むこと。

## 要望
ホーム画面の各カード（保有銘柄・主要指数/為替・今日の騰落・配分・資産推移・決算予定・最新ニュース）の大きさを、マウスで変えられるようにしたい。

## 現状
`src/app/page.tsx` は CSS グリッドで固定配置：
- 1段目：資産サマリー帯（HoldingsSummaryStrip）※これはリサイズ対象外
- 2段目：`grid-cols-[7fr_5fr]` で HomeHoldings ｜ HomeMarket
- 3段目：`grid-cols-4` で HomeMovers ｜ HomeAllocation（下に資産推移パネル）｜ HomeEarnings ｜ HomeNews
各カード内は `max-h-[360px]` などの固定最大高でスクロールしている（`src/components/home/portfolio-panels.tsx` ほか）。

## 方針
- ライブラリ `react-resizable-panels`（bvaughn 製、最新安定版）を **依存として追加してよい**（`npm install react-resizable-panels`。他の依存追加は不可）。
- 1100px 以上の幅では、ホームを**ウィンドウ高さいっぱい**（サマリー帯の下〜ステータスバーの上）に収め、ページ全体はスクロールさせない。各カードは割り当てられた領域いっぱいに広がり、中身が収まらない分はカード内でスクロールする（`max-h-[...]` の固定値をやめ、`h-full` + `overflow-auto` に）。
- 構成（縦の PanelGroup の中に横の PanelGroup）：
  - 上段（横）：保有銘柄 ｜ 主要指数・為替（既定 58% / 42%）
  - 下段（横）：今日の騰落 ｜ 配分＋資産推移（この列は**縦**に分割：配分 / 資産推移、既定 62% / 38%）｜ 決算予定 ｜ 最新ニュース（既定 各25%）
  - 上段 / 下段の境目（既定 52% / 48%）
- 境目ハンドル：T29 の `src/components/shell/resize-handle.tsx` と同じ見た目（細い線、ホバー・ドラッグ中はアクセント色、カーソル col-resize/row-resize）。ライブラリの `PanelResizeHandle` を使い、スタイルだけ合わせる（必要なら resize-handle.tsx に縦横両対応の見た目用コンポーネントを追加してよい）。
- 各パネルに最小サイズを設定（文字が潰れない程度。例：保有銘柄 35%、指数 22%、下段各 12%、高さ方向 25%）。
- サイズは保存して次回も復元する（ライブラリの `autoSaveId` を使い、キーは `pm.home.layout.*`）。localStorage が使えない環境でも既定で動くこと。
- ハンドルのダブルクリックで、そのグループを既定比率に戻す。ホームのどこか目立たない位置（サマリー帯の右端や、設定画面の「表示」セクション）に「レイアウトを初期化」を用意し、全グループを既定に戻す。
- 1100px 未満では従来どおりの縦積みレイアウト（リサイズなし）。
- ハイドレーションの不一致を出さないこと（保存値はマウント後に適用される実装なら可。ちらつきが大きい場合は対処）。
- 既存のカードの中身・データ取得・リンク・クリック動作は変えない。資産推移パネル（T26）のチャートと配分のドーナツ（T31）がパネルのサイズ変更に追従して描き直されること（ResizeObserver／recharts の ResponsiveContainer／lightweight-charts の autoSize）。

## 変更してよいファイル
- src/app/page.tsx
- src/components/home/**（カードの高さ指定の変更・パネル化に必要な範囲）
- src/components/shell/resize-handle.tsx（見た目の共通化のみ。T29 の挙動は変えない）
- src/components/home/home-layout.tsx（新規、レイアウト部品を置く場合）
- src/components/settings/**（「レイアウトを初期化」を置く場合のみ）、src/app/settings/page.tsx（同）
- package.json / package-lock.json（react-resizable-panels の追加のみ）
- テスト：既定比率・保存値の解釈を純粋関数に切り出した場合のテスト
- docs/renovation/reports/T32.md（新規）

## 確認
- `npx tsc --noEmit`、`npm run lint`、`npm test`（PM_FORBID_REAL_DB=1 は設定済み）。
- **`npm run build`、`next start`、`npm run desktop*` は実行しないこと**（ユーザーが本番DBでアプリを使用中。画面確認はレビュー担当が別フォルダで行う）。
- 実DBには触れないこと。

## レポート
docs/renovation/reports/T32.md に、構成、既定比率・最小サイズ、保存キー、判断、確認結果を書く。