# T11 保有銘柄画面の作り替え（多列テーブル＋右ペイン）

まず `docs/renovation/AGENT_RULES.md`、`docs/renovation/PLAN.md`、`docs/renovation/design/README.md` を読むこと。T10（画面フレーム）の後に行う。
見た目の基準は `docs/renovation/design/Holdings.dc.html`。

## 目的
`/portfolio` を、MarketSpeed II の保有一覧のような高密度の画面に作り替える。1920×1080 の画面で保有30行が1画面に収まること（行の高さ24px）。

## 追加してよい依存
- `@tanstack/react-table`

## 変更してよいファイル
- `src/app/portfolio/page.tsx`
- `src/components/holdings/**`（新規）
- `src/hooks/use-column-settings.ts`（新規）
- `src/hooks/use-portfolio.ts`（必要な値を返すための追加のみ。計算は `src/lib/portfolio-calc.ts` を使う）
- `src/lib/portfolio-calc.ts`、`src/lib/portfolio-calc.test.ts`（グループ小計の計算を足す場合）
- 既存の `src/components/edit-holding-modal.tsx`・`add-holding-modal.tsx`・`add-transaction-modal.tsx`（開き方の調整のみ）
- `package.json`、`package-lock.json`
- `src/components/portfolio-summary.tsx`、`src/components/watchlist/watchlist-table.tsx`（T10 で残った固定の騰落色 `emerald` / `red` を `var(--pm-up)` / `var(--pm-down)` に置き換えるだけ）
- `docs/renovation/reports/T11.md`（新規）

`src/components/holdings-table.tsx`・`portfolio-summary.tsx` はホーム画面がまだ使うので消さない。

## 画面構成
1. **ツールバー**（1行）：見出し「保有銘柄」／グループ化の切替（市場・セクター・口座・なし）／絞り込み入力（コード・銘柄名・メモ）／「列」ボタン（列の表示切替メニュー）／「CSV出力」／「＋ 保有を追加」（既存の追加モーダル）／「売買を記録」（既存の取引追加モーダル）。
2. **テーブル**（左、残り幅すべて）：
   - 列（全18列）：コード、銘柄名、市場、セクター（日本語ラベル）、数量、取得単価、現在値、前日比、前日比%、評価額（現地通貨）、評価額（円）、評価損益、損益%、当日損益（円）、構成比、口座、メモ、最終価格更新。
   - 初期表示は「コード・銘柄名・市場・セクター・数量・取得単価・現在値・前日比・前日比%・評価額（現地）・評価額（円）・評価損益・損益%・当日損益・構成比」の15列。列の表示／非表示と列幅は `use-column-settings.ts` で `localStorage`（キー `pm.columns.holdings`）に保存。読み書きは try/catch。
   - ヘッダー固定。ヘッダークリックで並べ替え（昇順→降順→解除）。数値列は右寄せ・`tabular-nums`。
   - グループ化時はグループ見出し行に件数と小計（評価額（円）・評価損益・損益%・当日損益・構成比）、最後に合計行。
   - 価格未取得（`price_status === 'missing'`）の行は、現在値・前日比・損益の欄に「価格未取得」を補助文字色で表示。
   - 騰落・損益の色は `var(--pm-up)` / `var(--pm-down)`。行の高さは `var(--pm-row-h)`。
   - 行をクリック（またはキーボードで選択して Enter）すると右ペインがその銘柄に切り替わる。選択行は背景 `#1a2638`、`aria-selected`。銘柄名はボタン要素にしてキーボードで操作できるようにする。
   - グループ化「なし」かつ並べ替え解除のときだけ、ドラッグで並べ替え（今の `reorderHoldings` を使う）。
   - 横にはみ出す場合はテーブル部分だけ横スクロール。
3. **右ペイン**（幅320px、900px未満では下に回り込む）：選択銘柄のコード・名称・市場、現在値と前日比（大きめ）、保有情報（数量・取得単価・評価額（現地／円）・評価損益と率・当日損益・構成比・セクター）、メモ（今の `memo` 欄の表示と編集）、ボタン「編集」（既存の編集モーダル）・「決済」（既存の決済＝削除の確認つき）。チャートと銘柄メモ一覧は後続タスクで足すので、場所だけ空けておく必要はない。
4. **サマリー帯**（ツールバーの上、1行）：総資産・前日比（額と率）・評価損益（額と率）・米国株／日本株／FX／現金の金額と構成比・USD/JPY。`missing_price_count > 0` なら「価格未取得 N銘柄（評価額は取得額で計算）」を補助文字で表示。
5. **CSV出力**：表示中の列・並び順で、UTF-8（BOM付き、Excelで文字化けしないように）の CSV をダウンロード。ファイル名 `holdings-YYYYMMDD.csv`。

## きまり
- テーブルは `@tanstack/react-table` のヘッドレス機能（列定義・並べ替え・表示切替・列幅）を使い、見た目は Tailwind で design に合わせて自前で描く。
- 金額の書式は既存の `formatCurrency` / `formatNumber` / `formatPercent` を使う。
- 既存の `/portfolio` にあったセクター配分・売買履歴は、この画面からは外す（ホームと後続の「記録」画面で扱う）。

## テスト
- グループ小計の計算を `portfolio-calc.ts` に足した場合は、そのテストを追加する。
- CSV 生成を純粋関数（`src/components/holdings/csv.ts` など）にして、エスケープ（カンマ・改行・ダブルクォート）と BOM のテストを書く。

## 確認
1. `npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`
2. 一時DBのコピーで `next start` を起動し `/portfolio` が 200。Playwright が使えれば 1920×1080 と 1280×800 のスクリーンショットを `docs/renovation/reports/T11-*.png` に保存する（モックの7銘柄で、15列が収まっているか、右ペインが出ているか）。

## レポート
`docs/renovation/reports/T11.md` に AGENT_RULES.md の形式で書く。
