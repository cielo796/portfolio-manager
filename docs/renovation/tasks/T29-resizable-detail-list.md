# T29 銘柄詳細：左の銘柄リストの幅をドラッグで変更（UI改善）

共通ルール: docs/renovation/AGENT_RULES.md を必ず読んで従うこと。

## 現状
`src/components/detail/detail-workspace.tsx` 37行目付近で、1100px 以上の画面は `min-[1100px]:grid-cols-[240px_minmax(0,1fr)]` により左の銘柄リスト（保有／メイン／サブ1〜4 タブ）が 240px 固定。銘柄名が「Verizon...」「GE Ver...」のように途中で切れる。

## やること
1. 汎用部品を作る
   - `src/hooks/use-resizable-width.ts`：`useResizableWidth({ storageKey, defaultWidth, min, max })` → `{ width, setWidth, reset, handleProps }`。
     - 幅は localStorage に保存（キーは呼び出し側が指定）。読み書きは try/catch で囲み、使えない環境でも既定値で動く。SSR 時は既定値（ハイドレーション不一致を出さないよう、マウント後に保存値を反映）。
     - min/max でクランプ。
   - `src/components/shell/resize-handle.tsx`：縦の細いドラッグハンドル。
     - Pointer Events（pointerdown → setPointerCapture → pointermove → pointerup）でドラッグ。ドラッグ中は `document.body` に `cursor: col-resize` と `user-select: none` を付け、終了時に戻す。
     - 見た目：幅 6px のヒット領域、中央に 1px の線（`var(--pm-border)`）、ホバー・ドラッグ中はアクセント色（`#f0a33a` もしくは既存のアクセント変数）。
     - ダブルクリックで既定幅に戻す。
     - アクセシビリティ：`role="separator"`、`aria-orientation="vertical"`、`aria-valuenow/min/max`、`tabIndex=0`、左右キーで ±16px（Shift で ±48px）、Home/End で min/max。`aria-label="銘柄リストの幅"`。
2. 銘柄詳細に適用
   - 左リストの幅を `useResizableWidth({ storageKey: 'pm.layout.detail.listWidth', defaultWidth: 240, min: 200, max: 520 })` で管理。
   - グリッドは CSS 変数で幅を渡す：例 `min-[1100px]:grid-cols-[var(--pm-detail-list-w)_6px_minmax(0,1fr)]` と `style={{ '--pm-detail-list-w': `${width}px` }}`、リストとメイン領域の間に ResizeHandle を置く。1100px 未満（縦積み）ではハンドルを表示しない。
   - リスト内の列（`grid-cols-[48px_minmax(0,1fr)_64px_48px]`）は名称列が伸びるので、幅を広げると銘柄名がより長く表示されることを確認。
   - チャート（lightweight-charts、autoSize）が幅変更に追従することを確認（必要なら何もしなくてよい）。
3. テスト
   - `src/hooks/use-resizable-width.test.ts`：クランプ、保存値の復元、不正な保存値（文字列・範囲外）で既定値、reset。React のフックを直接テストしにくい場合は、クランプ・保存値解釈を純粋関数に切り出してテストする。

## 変更してよいファイル
- src/hooks/use-resizable-width.ts（新規）、src/hooks/use-resizable-width.test.ts（新規）
- src/components/shell/resize-handle.tsx（新規）
- src/components/detail/detail-workspace.tsx
- docs/renovation/reports/T29.md（新規）

## 確認
- `npx tsc --noEmit`、`npm run lint`、`npm test`（PM_FORBID_REAL_DB=1 は設定済み）。
- **`npm run build`、`next start`、`npm run desktop*` は実行しないこと**（ユーザーが本番DBでアプリを使用中）。

## レポート
docs/renovation/reports/T29.md に変更点と結果を短く書く。