# T36: ホーム画面の保有銘柄カード・今日の騰落カードにも右クリックメニュー

## 背景
T35 で `/portfolio`（保有銘柄ページ）の行に右クリックメニューを実装したが、ユーザーが普段見ているのは
ホーム（`/`）の「保有銘柄」カードと「今日の騰落（保有）」カードで、ここでは右クリックしても何も出ない
（実機 Electron で確認済み。`/portfolio` 側は実機でも正常に出る）。

## ゴール
ホームの2つのカードの各行で右クリック（および行フォーカス中の Shift+F10 / ContextMenu キー）すると、
`/portfolio` と同じ右クリックメニューが出て、同じ操作ができること。

## 実装方針
1. `src/components/holdings/holdings-workspace.tsx` にあるメニュー制御（menu state, openMenu, actions, runMenuAction,
   watchlist/top-picks の reload, `HoldingActionModal`, `DeleteHoldingDialog`, エラー表示）を
   新規 `src/components/holdings/use-holding-context-menu.tsx` に共通化する。
   - 例: `const menu = useHoldingContextMenu({ onAdd, onEdit, onAfterChange, variant })` が
     `{ openMenu(x, y, target, row?), element /* ContextMenu + モーダル + ダイアログ + エラー */ }` を返す形。
   - `HoldingsWorkspace` はこのフックを使うように置き換え、**挙動・見た目を一切変えない**（既存テストが通ること）。
     行選択（setSelectedId）など workspace 固有の処理はコールバックで渡す。
2. `src/components/holdings/context-menu-items.ts` の `buildHoldingMenuItems` に `variant: 'workspace' | 'home'` を追加（既定 'workspace'）。
   - 'home' では行なし（空白部分）メニューを「保有を追加…」「保有銘柄ページを開く」にする（CSV出力・列設定は出さない）。
   - 行ありメニューは workspace と同じ項目。
3. `src/components/home/portfolio-panels.tsx`
   - `HomeHoldings` の各行（`role="row"` の div）と `HomeMovers` の各 `<tr>` に `onContextMenu`（preventDefault + stopPropagation + openMenu）と
     キーボード（Shift+F10 / ContextMenu キー）を付ける。行内のリンク上で右クリックしても同じメニューが出ること。
   - CASH 行はT35と同じ CASH 用メニュー。合計行・ヘッダー行では出さない。
   - カード内の空白部分の右クリックは 'home' の行なしメニュー。
   - 右クリック中の行が分かるよう、メニュー表示中はその行に選択色（`--pm-selected-row`）を付ける。
4. `src/app/page.tsx`
   - 「編集…」は `EditHoldingModal`、行なし「保有を追加…」は `AddHoldingModal` をホーム上で開く（`/portfolio/page.tsx` と同じ使い方）。
     必要な `updateHolding / removeHolding / addHolding / portfolios / tickerPresets` は `usePortfolio` / `useTickerPresets` から取る。
   - 操作完了後（売買記録・追加・削除・編集）はホームの数値が更新されること（`reloadPortfolioData` 等）。
   - 「保有銘柄ページを開く」は `/portfolio?symbol=..&market=..`（行なしなら `/portfolio`）へ遷移。

## 対象ファイル（これ以外は触らない。必要なら作業を止めてレポートに理由を書く）
- src/components/holdings/use-holding-context-menu.tsx（新規）
- src/components/holdings/holdings-workspace.tsx
- src/components/holdings/context-menu-items.ts（＋そのテスト）
- src/components/home/portfolio-panels.tsx
- src/app/page.tsx
- 新規/既存のテストファイル（*.test.ts / *.test.tsx）
- docs/renovation/reports/T36.md（レポート）

## 制約
- 本番DB（data/portfolio.db）には絶対に触れない（PM_FORBID_REAL_DB=1 が設定済み）。動作確認はテストで行う。
- 依存パッケージの追加禁止。
- 既存の右クリックメニュー（/portfolio）の項目・順序・挙動・a11y を変えない。
- 文字コードは UTF-8（BOMなし）。日本語の文字列を壊さないこと。

## 完了条件
- `npx tsc --noEmit` / `npm run lint` / `npm test` / `npm run build` がすべて成功
  （build は `SQLITE_DB_PATH` をコピーDBに向けた状態で）。
- `buildHoldingMenuItems` の 'home' variant のテストを追加。
- レポート `docs/renovation/reports/T36.md` に変更点・確認結果を日本語で記載。
- コミットは1つ: `T36: ホームの保有銘柄・今日の騰落カードに右クリックメニュー`
