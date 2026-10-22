# T07b 同期の小さな修正（スキーマ版数の確認・purge の重複解消）

まず `docs/renovation/AGENT_RULES.md` を読み、ルールに従うこと（特に 6. DB のテストのきまり）。
**同時に別のエージェントが `src/components/settings/` と `src/app/settings/page.tsx` を変更している。それらには触れず、`git status` に出ても無視すること。`npm run build` は実行しないこと（ビルドが衝突するため）。**

## 変更してよいファイル
- `src/lib/sync/api.ts`、`src/lib/sync/engine.ts`、`src/lib/sync/sync.test.ts`
- `src/lib/db/maintenance.ts`、`src/lib/db/index.ts`
- `src/types/index.ts`（`SyncPing` 型に1項目足すだけ）
- `docs/renovation/reports/T07b.md`（新規）

## 1. スキーマ版数の確認
2台のPCでアプリの版が違う（DBの `user_version` が違う）と、`validateChanges` が列数の違いで「行データが不正です」と失敗し、原因が分かりにくい。
- `src/lib/sync/api.ts` の `ping` の応答に `schemaVersion`（`db.pragma('user_version', { simple: true })` の値、数値）を追加する。`src/types/index.ts` の `SyncPing` 型にも `schemaVersion: number` を足す。
- `src/lib/sync/engine.ts` の同期処理で、`ping` の直後に自分の `user_version` と相手の `schemaVersion` を比べ、違えば `new SyncError('相手PCとアプリのバージョンが違います（このPC: v<自分>、相手: v<相手>）。両方を最新にしてから同期してください。', 409)` を投げる。`schemaVersion` が無い（古い相手）場合も同じエラーにする（相手は v不明 と表示）。
- `sync.test.ts` に、相手の `schemaVersion` が違う場合にこのエラーで止まり、DBが変わらないことのテストを1件足す。既存テストの `ping` のスタブには `schemaVersion` を足して通るようにする。

## 1-2. 一覧APIに自分の情報を含める
`GET /api/sync/peers` の応答に `self: { deviceId, deviceName, schemaVersion }` を追加する（設定画面の「このPC」欄で使う）。既存の `peers` 配列はそのまま。テストに1件足す。

## 2. purgeDeletedRows の重複解消
`src/lib/db/maintenance.ts` の `purgeDeletedRows(days = 90)` と、`src/lib/sync/engine.ts` の `purgeDeletedRows(db)` が同じ処理を二重に持っている。
- `maintenance.ts` の関数を `purgeDeletedRows(days = 90, db = getDb())` に変え、DBを引数で受け取れるようにする（既存の呼び方はそのまま動く）。
- `engine.ts` の独自実装を削除し、`maintenance.ts` の関数を `purgeDeletedRows(90, db)` で呼ぶ。
- 処理内容（保持期間、子行を先に消す、参照が残る口座は残す）は変えない。既存のテストがそのまま通ること。

## 確認
`npx tsc --noEmit`、`npm run lint`、`npm test`（全件成功）。

## レポート
`docs/renovation/reports/T07b.md` に AGENT_RULES.md の形式で書く。
