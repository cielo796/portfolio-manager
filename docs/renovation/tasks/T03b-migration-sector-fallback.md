# T03b マイグレーション version 2 の補正（セクター未設定の株式を自動判定する）

まず `docs/renovation/AGENT_RULES.md` を読み、ルールに従うこと。
**同時に別のエージェントが `src/lib/` や `src/hooks/` などを変更している。`src/lib/db/migrations.ts` 以外の変更には一切触れず、`git status` に出ても無視すること。**

## 目的
`src/lib/db/migrations.ts` の `normalizeHoldingSectors`（version 2）は、既存の株式の行で sector が null や空文字だと `other` にしてしまう。また sector に `Cash` / `FX` と書かれた株式の行（誤った値）が null になってしまう。どちらも、銘柄から自動判定するべき。

## 変更してよいファイル
- `src/lib/db/migrations.ts`（`normalizeHoldingSectors` 関数の中だけ）
- `docs/renovation/reports/T03b.md`（新規）

## やること
`normalizeHoldingSectors` のループ内の判定を、`src/lib/sectors.ts` にある `resolveHoldingSector(symbol, market, sector)` を使う形に置き換える。
- 現金（symbol が `CASH`）と FX（market が `FX`）の行 → null（`resolveHoldingSector` がそうする）
- それ以外で、元の sector が `cash` / `fx`（大文字小文字・前後空白を無視）なら、元の値は無いものとして `resolveHoldingSector(symbol, market, null)` を使う
- それ以外は `resolveHoldingSector(symbol, market, row.sector)`
- 変化がある行だけ UPDATE する（今と同じ）

`resolveHoldingSector` を import に追加し、使わなくなった import（`normalizeSectorKey` を他で使っていなければ）は消す。ほかの関数・バージョン番号・マイグレーション一覧は変えない。

## 確認
`npx tsc --noEmit` と `npm run lint`。他のエージェントの作業中ファイルでエラーが出た場合は、`migrations.ts` 以外のエラーとしてレポートに書くだけでよい。

## レポート
`docs/renovation/reports/T03b.md` に AGENT_RULES.md の形式で書く。
