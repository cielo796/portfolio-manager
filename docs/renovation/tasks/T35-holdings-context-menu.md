# T35 保有銘柄の右クリックメニュー

共通ルール: docs/renovation/AGENT_RULES.md、docs/renovation/PLAN.md、デザインは docs/renovation/design/README.md を読むこと。
作業ブランチは `feature/holdings-context-menu`（チェックアウト済み）。Git 操作はしないこと。

## 要望
保有銘柄画面（`src/components/holdings/holdings-workspace.tsx`）の一覧で、右クリックから保有の**追加・削除**ができるようにしたい。あわせて、右クリックにあると便利な操作もまとめて入れる。

## 1. 共通の右クリックメニュー部品
`src/components/shell/context-menu.tsx`（新規）：
- 画面上の任意の位置に開くメニュー。ウィンドウ端ではみ出さない位置に補正。サブメニュー（▶）対応。
- 区切り線、無効項目（理由をツールチップで表示）、ショートカット表記（右寄せ）、危険な操作（削除）は赤系の文字。
- キーボード：上下で移動、Enter で実行、右／左でサブメニューの開閉、Esc で閉じる。メニューを開いたら先頭項目にフォーカス、閉じたら元の行にフォーカスを戻す。
- 外側クリック・スクロール・ウィンドウのリサイズ・別の右クリックで閉じる。
- `role="menu"` / `menuitem` / `aria-haspopup` など ARIA を付ける。
- デザインはトークンに合わせる（パネル色の地、`--pm-border` の枠、行高 24px 程度、ホバーは選択行と同じ色）。
- 他画面でも使えるよう、項目は配列（`{ id, label, shortcut?, disabled?, disabledReason?, danger?, children?, onSelect? } | 'separator'`）で受け取る。

## 2. 保有一覧に適用
- 行を右クリック（または行にフォーカスして Shift+F10 / アプリケーションキー）でメニューを開く。右クリックした行を選択状態にする（右側の詳細ペインもその銘柄になる）。
- 株式・FX の行のメニュー：
  1. 銘柄詳細を開く（Enter）
  2. 銘柄メモを書く
  ─
  3. 売買を記録 ▶ 購入／売却／配当（既存の記録フォーム／モーダルを、口座・銘柄・市場を入れた状態で開く。売却は既存の「売却を記録」と同じく保有数量を初期値に）
  4. 編集…（既存の編集モーダル）
  5. 保有を追加…（既存の追加モーダルを開く。この行の銘柄・市場を初期値に入れ、別口座への追加をしやすくする）
  ─
  6. 登録リストに追加 ▶ メイン／サブ1〜4（既に登録済みのリストはチェック付きで無効。既存の登録 API を使用）
  7. トップピックに追加（既にピック済み・10件満杯なら無効＋理由。既存の作成 API。選定価格は保存済み現在値）
  8. 価格を更新（この銘柄だけ `POST /api/prices`）
  ─
  9. コードをコピー／銘柄名をコピー（クリップボード）
  10. Yahoo Finance で開く（`https://finance.yahoo.com/quote/<Yahooシンボル>`、日本株は `.T`、FX は `=X`。外部ブラウザで開く。Electron は既存の setWindowOpenHandler で外部ブラウザに渡る）
  ─
  11. 削除…（危険操作）
- 現金（CASH）の行：編集…／保有を追加…／削除… のみ（他は出さない）。
- 一覧の空白部分（行以外）を右クリック：保有を追加…／CSV出力／列設定… を出す。
- グループ見出し行（米国株・現金など）は既存の挙動のまま（メニューは空白部分と同じでよい）。

## 3. 削除の扱い
- 削除はアプリ内の確認ダイアログ（`window.confirm` は使わない）で「<銘柄>（<口座>）の保有を削除します。」と表示し、「削除」ボタンで実行。既存の保有削除 API（`src/app/api/holdings/[id]/route.ts` の DELETE、論理削除）を使う。
- その保有に連動する売買記録（`transactions.holding_id` が一致し未削除のもの）がある場合は、ダイアログで「売買記録と連動しています。記録画面で記録を削除すると保有も再計算されます」と案内し、削除ボタンは無効化して「記録画面を開く」ボタンを出す（T18 の `keep_ledger_holding` と整合させる）。判定のために API が必要なら、既存の取引一覧 API の結果から判定してよい。
- 削除後は一覧と右ペインを更新し、選択は次の行へ移す。

## 4. その他
- `.gitignore` に `/data/sync-backups/` を追加する（LAN同期前のDBバックアップがGitの追跡対象外になっていないため）。
- メニュー項目の組み立て（行の種類・登録状況・ピック状況から項目と無効状態を決める）は純粋関数にしてテストを書く（`src/components/holdings/context-menu-items.ts` と `.test.ts`）。Yahoo シンボル変換のテストも。
- 既存のドラッグ並べ替え、キーボード操作、行クリックの挙動を壊さないこと。

## 変更してよいファイル
- src/components/shell/context-menu.tsx（新規）、src/components/shell/confirm-dialog.tsx（新規、確認ダイアログが無ければ）
- src/components/holdings/**（context-menu-items.ts / .test.ts を含む）
- src/components/add-transaction-modal.tsx、src/components/edit-holding-modal.tsx、保有追加のモーダル（初期値を受け取るための props 追加のみ）
- src/app/api/holdings/**（削除時の連動チェックが必要な場合のみ）
- .gitignore
- docs/renovation/reports/T35.md（新規）

## 確認
- `npx tsc --noEmit`、`npm run lint`、`npm test`（PM_FORBID_REAL_DB=1 は設定済み）。
- **`npm run build`、`next start`、`npm run desktop*` は実行しないこと**（ユーザーが本番DBでアプリを使用中。画面確認はレビュー担当が行う）。

## レポート
docs/renovation/reports/T35.md に、メニュー構成、削除の扱い、判断、確認結果を書く。