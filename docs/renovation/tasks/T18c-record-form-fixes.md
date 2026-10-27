# T18c 記録フォームの口座初期値と、新規保有の銘柄名・セクター（小修正）

共通ルール: docs/renovation/AGENT_RULES.md を必ず読んで従うこと。

## 不具合1: 口座の初期値
`src/components/records/record-form.tsx` で銘柄候補から保有銘柄を選んでも、口座が先頭口座（portfolios[0]）のまま。
トヨタ(7203)を口座2で保有しているのに口座1が選ばれ、保存すると口座1に新しい保有ができてしまう。
- 修正: 候補選択時、その銘柄（symbol と market が一致、CASH 除く）の有効な保有が存在する口座が1つならその口座を自動選択する。複数口座にあれば、現在選択中の口座がその中に含まれていればそのまま、含まれなければ最初の保有口座を選ぶ。保有がない（登録銘柄など）場合は変更しない。
- 編集モード（editing）では口座を変えない（既存どおり）。
- 候補を選んだら候補リストを閉じる（現状、選択後も候補が表示されたままになる）。

## 不具合2: 記録から新規作成される保有の銘柄名・セクター
`src/lib/db/transactions.ts` で、購入記録により保有を新規作成するとき `name` が NULL、`sector` が 'other' になる。
- 修正: 
  - name: フォームから渡された銘柄名（候補の name）を使う。API の入力に `name`（任意）を追加し、record-form から送る。無ければ既存の保有・登録銘柄（watchlist_items）の同じ symbol+market の name を使い、それも無ければ NULL。
  - sector: 既存の `resolveHoldingSector`（src/lib 配下。grep で場所を確認）で解決する。登録銘柄に sector があればそれを優先してよい。
- 既存の保有を更新するときは name / sector を上書きしない。

## その他
- `.gitignore` に `tmp/` を1行追加する。

## 変更してよいファイル
- src/components/records/record-form.tsx、src/components/records/records-workspace.tsx（name を送るのに必要な場合のみ）
- src/components/add-transaction-modal.tsx（同上）
- src/lib/db/transactions.ts、src/app/api/transactions/route.ts（name の受け渡し）
- src/lib/db/transactions.test.ts（「新規保有に name と sector が入る」テストを追加）
- .gitignore
- docs/renovation/reports/T18c.md（新規）

## 確認
- `npx tsc --noEmit`、`npm run lint`、`npm test`（PM_FORBID_REAL_DB=1 は設定済み）。
- `npm run build` と `next start` は実行しないこと（別タスクが使用）。

## レポート
docs/renovation/reports/T18c.md に変更点と結果を短く書く。