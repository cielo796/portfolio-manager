# T34 ニュース画面の3ペインをマウスでリサイズ可能にする（共通化つき）

共通ルール: docs/renovation/AGENT_RULES.md、docs/renovation/PLAN.md を読むこと。T32 のレポート（docs/renovation/reports/T32.md）と実装（src/components/home/home-layout.tsx、layout-model.ts）を最初に把握すること。

## 要望
ニュース画面でも、ホームと同じように各ペイン（項目）の大きさをマウスで変えたい。

## 現状
`src/components/news/news-workspace.tsx` 172行目付近：
`min-[900px]:grid-cols-[210px_minmax(0,1fr)_minmax(300px,380px)]` で「絞り込み（news-filter-pane）｜見出し一覧（news-list-pane）｜プレビュー（news-preview-pane）」を固定配置。

## やること
1. 共通化：T32 でホーム専用に作ったリサイズの仕組みを、他画面でも使える共通部品にする。
   - 置き場所：`src/components/shell/resizable-layout.tsx`（Group/Panel/Separator の薄いラッパー、T29/T32 と同じ見た目の境目、境目ダブルクリックでそのグループを既定比率に戻す）と `src/lib/resizable-layout.ts`（既定比率・最小サイズ・保存キーの定義型、保存値の検証、安全な localStorage）。
   - ホーム（home-layout.tsx / layout-model.ts）をこの共通部品を使う形に置き換える。**ホームの挙動・保存キー（pm.home.layout.*）・既定比率は変えない**（既存の保存値がそのまま使えること）。既存テストは通し続け、共通部分のテストは共通側へ移してよい。
2. ニュース画面に適用
   - 900px 以上：横の Group で「絞り込み｜見出し一覧｜プレビュー」。既定は 16% / 56% / 28% 程度（現在の見た目に近い比率を、1440px 幅での現状の実寸から決めてよい）。最小は 絞り込み 12%、一覧 30%、プレビュー 18% 程度。保存キー `pm.news.layout.panes`。
   - 900px 未満：従来どおりの縦積み（リサイズなし）。
   - 各ペインは割り当て領域いっぱいに広がり、中身はペイン内でスクロール。プレビューの画像やテキストは幅に追従すること。
   - 画面上部（既存のヘッダー行があればその右端）に「レイアウトを初期化」を置く（ホームと同じ見た目・動作）。
3. 見出し一覧の列幅（任意・余力があれば）：`news-list-pane.tsx` の `ROW_GRID`（日時78px・コード60px・ソース96px・見出し残り）について、ヘッダーの列境界をドラッグして日時・コード・ソースの幅を変えられるようにし、`pm.news.listColumns` に保存。難しければ対応しなくてよい（レポートに記載）。

## 変更してよいファイル
- src/components/shell/resizable-layout.tsx（新規）、src/lib/resizable-layout.ts（新規）とそのテスト
- src/components/home/home-layout.tsx、src/components/home/layout-model.ts、src/components/home/layout-model.test.ts（共通部品への置き換えのみ）
- src/components/news/**
- docs/renovation/reports/T34.md（新規）
- 依存の追加は不可（react-resizable-panels は導入済み）

## 確認
- `npx tsc --noEmit`、`npm run lint`、`npm test`（PM_FORBID_REAL_DB=1 は設定済み）。
- **`npm run build`、`next start`、`npm run desktop*` は実行しないこと**（ユーザーがアプリを使用中。画面確認はレビュー担当が行う）。

## レポート
docs/renovation/reports/T34.md に、共通部品の構成、ニュース画面の既定比率・最小サイズ・保存キー、ホームへの影響がないことの確認、判断を書く。