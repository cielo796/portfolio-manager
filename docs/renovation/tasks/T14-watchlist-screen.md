# T14 登録銘柄（ウォッチリスト）画面の多列化

まず `docs/renovation/AGENT_RULES.md`、`docs/renovation/PLAN.md`、`docs/renovation/design/README.md` を読むこと。T11〜T13 の後に行う。
見た目の基準は `docs/renovation/design/Watchlist.dc.html`。T11 で作った保有銘柄テーブルの部品（`src/components/holdings/`、`use-column-settings.ts`）の作り方に合わせる。

## 目的
今のウォッチリスト画面（行を展開して財務指標を見る形）を、MarketSpeed II の「登録銘柄」のように財務指標まで列に並べた一覧に作り替える。今ある機能（5つのリスト、セクター別グループ、セクターフィルタ、検索、ドラッグ並べ替え・別リストへの移動、行内編集、追加フォーム、トレードアイデア）はすべて残す。

## 変更してよいファイル
- `src/app/watchlist/page.tsx`、`src/hooks/use-watchlist.ts`、`src/components/watchlist/**`
- `src/hooks/use-column-settings.ts`（汎用化が必要な場合）
- `src/app/api/prices/route.ts`、`src/lib/market.ts`、`src/lib/db/prices.ts`、`src/lib/db/migrations.ts`（出来高を保存するための列追加が必要な場合）
- `src/types/index.ts`
- `docs/renovation/reports/T14.md`（新規）

## 画面
1. **リストのタブ**（メイン・サブ1〜サブ4）と件数。タブへのドロップで別リストへ移動（今と同じ）。
2. **ツールバー**：セクターのチップ（件数つき）、検索、「セクター順に整列」、「列」メニュー、「価格・指標を更新」、「＋ 銘柄を追加」（追加フォームは今と同じく開閉式）。
3. **テーブル**（全19列、ヘッダー固定、横スクロール）：つまみ／コード／銘柄名（銘柄詳細ができるまではリンクなし）／現在値／前日比／前日比%／出来高／5日（スパークライン）／52週高値／52週安値／高値から%／目標価格（未設定は「未設定」）／目標まで%（目標の3%以内は強調色）／PER／PBR／配当利回り／時価総額／次回決算／メモ。初期表示は全列。列設定は `pm.columns.watchlist` に保存。
   - セクター見出し行（色つきバッジ・件数）でグループ表示。
   - 行のダブルクリックまたは行末の編集ボタンで、今の行内編集（社名・セクター・目標価格・メモ）に切り替わる。削除も今と同じ。
   - 財務指標の「展開パネル」は廃止し、列に置き換える（財務指標の値は `/api/fundamentals`、T13 で入れた24時間キャッシュを使う）。
   - 5日チャート・52週高安は `POST /api/sparklines`（T12）。
   - 出来高：`/api/prices` の Yahoo 応答（`meta.regularMarketVolume` または日足の最新出来高）から取り、`stock_prices` に `volume` 列を足して保存する（既存の挙動は変えない）。値は「52.4M」「6.8M」「2.1万」のように短縮表示（米国株は M/B、日本株は 万/億）。
4. **右ペイン「トレードアイデア」**（幅280〜300px、開閉式は廃止して常時表示。900px 未満では下に回る）：銘柄の選択と追加フォーム、保存済みアイデアの一覧（2行で省略・展開・編集・削除）。今のトレードアイデアの機能をそのまま移す。

## きまり
- データ取得・保存の処理は `use-watchlist.ts` に残し、表示はコンポーネントに分ける（T05 の分け方を保つ）。
- 価格未取得・指標未取得のセルは「—」を補助文字色で表示。
- 騰落色・行の高さ・数値の書式は T11 と同じ。

## 確認
`npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`。一時DBのコピーで `next start` を起動し、`/watchlist` が 200、主要API（`/api/watchlist`・`/api/prices`・`/api/fundamentals`・`/api/sparklines`）がエラーにならないこと。

## レポート
`docs/renovation/reports/T14.md` に AGENT_RULES.md の形式で書く。
