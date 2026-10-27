# T22 トップピック追加ダイアログ：現在値の自動取得と選定日の初期値（小改善）

共通ルール: docs/renovation/AGENT_RULES.md を必ず読んで従うこと。

## 現状
`src/components/top-picks/add-pick-dialog.tsx` で、保存済み株価（stock_prices）がない銘柄を選んで「選定時の価格」を空のまま追加すると「現在値がありません。選定時の価格を入力してください。」で失敗する。選定日の入力欄も空。

## やること
1. 選定日（picked_at）の初期値を Asia/Tokyo の今日（YYYY-MM-DD）にする。`new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })` で可。
2. 銘柄を候補から選んだとき、またはコード欄の入力が確定したとき（blur 時）に、既存の `POST /api/prices` を呼んでその1銘柄の現在値を取得・保存する。
   - リクエスト形式は `src/app/api/prices/route.ts` の `PriceRequest` 型を読んで合わせる（`symbols` 配列）。
   - 取得できたら「選定時の価格」欄の placeholder に「現在値 ¥xxx / $xxx（空欄なら この値で記録）」のように表示する。入力欄の値は自動で埋めない（ユーザーの入力を優先）。
   - 取得中は追加ボタンを押しても、取得完了を待ってから送信する。取得に失敗したら現状どおりのエラー表示でよい（価格の手入力を促す）。
   - サーバー側（作成API）は picked_price 省略時に保存済み株価を使う実装なので、サーバーは変更不要。
3. 市場を手で切り替えた場合も、コードがあれば再取得する。

## 変更してよいファイル
- src/components/top-picks/add-pick-dialog.tsx
- src/components/top-picks/shared.ts（API 呼び出しヘルパーを置く場合のみ）
- docs/renovation/reports/T22.md（新規）
## 確認（共通）
- `npx tsc --noEmit`、`npm run lint`、`npm test`（PM_FORBID_REAL_DB=1 は設定済み）。
- `npm run build` と `next start` は実行しないこと（別タスクが使用）。
- 他タスクが並行で別ファイルを編集している。変更許可ファイル以外の差分が見えても触らないこと。テストが他タスクの途中変更で失敗した場合は、その旨をレポートに書く。

## レポート
docs/renovation/reports/T22.md に変更点と結果を短く書く。
