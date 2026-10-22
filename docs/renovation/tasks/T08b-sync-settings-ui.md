# T08b LAN同期：設定画面の「LAN同期・Link」セクション

まず `docs/renovation/AGENT_RULES.md` を読み、ルールに従うこと。T07 の後に行う。
API の仕様は `docs/renovation/tasks/T07-sync-engine.md` の「API」表と `docs/renovation/reports/T07.md` を見ること。**API 側は変更しない。**

## 目的
設定画面（`/settings`）に、Link と同期の操作UIを追加する。見た目は今の設定画面の他のセクションに合わせる（このフェーズでは新デザインにしない）。

## 変更してよいファイル
- `src/components/settings/sync-settings.tsx`（新規）
- `src/app/settings/page.tsx`（新しいセクションを一番上に差し込む1か所だけ）
- `docs/renovation/reports/T08b.md`（新規）

## 画面の中身（上から順に）
1. **このPC**：デバイス名とデバイスID。その横に「デバイスIDを作り直す」ボタン（2回押す方式。1回目で「もう一度押すとLinkがすべて解除されます」に変わる）→ `POST /api/sync/device/regenerate` → 画面を再読み込み（`POST /api/sync/pairing` の戻りではなく、`GET /api/sync/peers` の戻りに含まれる自分の情報を使う。含まれていなければ T07 のレポートで確認し、取れない場合は表示を省略してレポートに書く）。
2. **このPCで Link を受け付ける**：ボタン「Linkを受け付ける」→ `POST /api/sync/pairing`。成功したら6桁のコード（3桁ずつ空白で区切る）、相手に入力してもらうアドレス（`addresses` の各値）、残り時間（mm:ss、1秒ごとに減る）を表示。「受付を止める」ボタン → `DELETE /api/sync/pairing`。期限が切れたら表示を消す。
3. **相手のPCに接続する**：入力欄「相手のアドレス」（例 `192.168.1.41:38400`）と「ペアリングコード」（数字6桁、空白は除去して送る）、ボタン「Linkする」→ `POST /api/sync/peers` に `{ address, code }`。成功したら一覧を再読み込み。失敗したら API が返したエラーメッセージを赤字で表示（409 のデバイスID重複のメッセージもそのまま表示）。
4. **Link済みのPC**：`GET /api/sync/peers` の一覧を表で表示（名前、アドレス、最終同期日時、状態＝接続可／応答なし）。行ごとに「今すぐ同期」→ `POST /api/sync/run` に `{ peerId }`。実行中はボタンを無効にして「同期中…」。完了したら「受信 N件・送信 N件・競合 N件（X秒）」を行の下に表示し、時刻差の警告があれば黄色で表示。「Link解除」→ 確認ダイアログは使わず、ボタンを2回押す方式（1回目で「もう一度押すと解除」に文言が変わる）→ `DELETE /api/sync/peers/[id]`。
5. **同期ログ**：`GET /api/sync/log` の直近10件を表で表示（日時、相手、受信、送信、競合、結果）。セクション表示時と同期完了時に再読み込み。

## 実装のきまり
- `'use client'` のコンポーネントにする。状態は `useState`、読み込みは `useEffect`。
- 日時は `src/lib/utils.ts` の `formatDate(…, 'full')` で表示する。
- ボタン・入力欄・カードは、設定画面ですでに使っている `@/components/ui/button`、`@/components/ui/input`、`@/components/ui/card` を使う。
- すべての入力に `<label>` を付ける。
- `fetch` の失敗時は画面にエラーを表示し、例外で画面全体が落ちないようにする。

## 確認
- `npx tsc --noEmit`、`npm run lint`、`npm run build`
- `npm run dev` で `/settings` を開いてエラーが出ないこと（同期相手がいなくても表示できること）。

## レポート
`docs/renovation/reports/T08b.md` に AGENT_RULES.md の形式で書く。
