# T07 LAN同期：同期エンジンと同期API

まず `docs/renovation/AGENT_RULES.md` と `docs/renovation/PLAN.md` を読み、ルールに従うこと。
このタスクは T06（論理削除・updated_by・sync_* テーブル）の後に行う。

## 目的
Link 済みのPCと、ボタン操作で双方向に差分を交換する。競合は行単位の後勝ち（LWW）。
画面（Link・同期ボタン）は T08 で作る。ここでは **エンジン・API・テスト** まで。

## 変更してよいファイル
- `src/lib/sync/**`（新規）
- `src/lib/db/connection.ts`（任意のパスでDBを開く `openDatabase(path)` を追加するため。既存の `getDb()` の挙動は変えない）
- `src/lib/db/index.ts`（必要な再エクスポートの追加のみ）
- `src/app/api/sync/**/route.ts`（新規）
- `src/types/index.ts`（同期関連の型の追加）
- `docs/renovation/reports/T07.md`（新規）

## ネットワーク構成（前提）
Next.js サーバーは今どおり `127.0.0.1` だけで待ち受ける。LANからは T08 で Electron に作る「同期専用の中継サーバー」（`0.0.0.0:38400`）経由で、`/api/sync/peer/*` だけが届く。したがって：
- `/api/sync/peer/*`：相手PCから呼ばれる。HMAC署名を必須にする（ペアリング開始の `pair` だけはコードで認証）。
- それ以外の `/api/sync/*`：自分の画面から呼ばれる（中継されないので LAN からは届かない）。

開発時（`npm run dev`）は中継サーバーがないので、同じPCで2つのサーバーを別ポート・別DBで起動し、`http://127.0.0.1:<port>` を相手のアドレスとして試せるようにする。

## API

| メソッドとパス | 呼ぶ側 | 内容 |
|---|---|---|
| `POST /api/sync/pairing` | 自分の画面 | ペアリングコード（6桁、5分有効、1回限り）を発行。`{ code, expiresAt, deviceId, deviceName, addresses: string[] }` を返す。`addresses` は `os.networkInterfaces()` のプライベートIPv4と中継ポート（環境変数 `PM_SYNC_PORT`、既定 38400）を組み合わせた `IP:port` |
| `DELETE /api/sync/pairing` | 自分の画面 | 受付を止める |
| `POST /api/sync/peers` | 自分の画面 | `{ address, code }` を受け、相手の `/api/sync/peer/pair` を呼んで Link する。自分の到達先として `PM_SYNC_PUBLIC_PORT`（既定 38400）を相手に伝える |
| `GET /api/sync/peers` | 自分の画面 | Link 済みの一覧（シークレットは返さない）と、各相手への疎通結果（`/api/sync/peer/ping` を2秒タイムアウトで呼ぶ） |
| `DELETE /api/sync/peers/[id]` | 自分の画面 | Link 解除（このPC側の登録を消す） |
| `POST /api/sync/run` | 自分の画面 | `{ peerId }`。同期を1回実行し、結果（受信・送信・競合の件数、時刻差、所要時間）を返す。同時に2つ走らないよう排他する |
| `GET /api/sync/log` | 自分の画面 | `sync_log` の直近50件 |
| `POST /api/sync/peer/pair` | 相手PC | `{ code, deviceId, deviceName, port }`。コードが正しければ32バイトのシークレットを生成し、相手を `sync_peers` に登録（`base_url` は `http://<接続元IP>:<port>`。Next.js のルートでは接続元IPが取れないため、中継サーバーが付ける `X-Forwarded-For` の先頭の値を使い、ヘッダーがなければ `127.0.0.1` とする。Next.js は 127.0.0.1 でしか待ち受けないので、このヘッダーは中継サーバーからしか来ない）。`{ deviceId, deviceName, secret }` を返す |
| `GET /api/sync/peer/ping` | 相手PC（署名必須） | `{ deviceId, deviceName, serverTime }` |
| `GET /api/sync/peer/changes?since=` | 相手PC（署名必須） | 指定時刻以降の変更行（後述） |
| `POST /api/sync/peer/apply` | 相手PC（署名必須） | 変更行を受け取り反映（後述） |

### 署名
- ヘッダー：`X-PM-Device`（送信側のデバイスID）、`X-PM-Timestamp`（ISO時刻）、`X-PM-Signature`（hex）
- 署名対象：`${method}\n${pathWithQuery}\n${timestamp}\n${sha256hex(body)}`、鍵は共有シークレット、HMAC-SHA256
- 受信側は、未登録のデバイス・時刻差5分超・署名不一致を 401 で拒否する。比較は `crypto.timingSafeEqual`。

## 同期エンジン（`src/lib/sync/`）
テストしやすいよう、DBインスタンスを引数に取る関数で作る（`getDb()` に依存しない）。

- `collectChanges(db, since: string | null, excludeDeviceId?: string)`：同期対象6テーブルから `updated_at > since` の行を、論理削除済みも含めて全列で返す。`updated_by === excludeDeviceId` の行は除く（相手から来たものをそのまま送り返さない）。
- `applyChanges(db, changes, { lastSyncedAt })`：1トランザクションで反映し、`{ applied, skipped, conflicts, conflictDetails }` を返す。
  - 反映順は `portfolios` → `holdings` / `transactions` / `trade_ideas` / `ticker_presets` / `watchlist_items`（外部キーのため）。
  - **後勝ちの判定**：受信行の `updated_at` が自分の行より新しければ受信側を採用。同じなら `updated_by` の文字列比較で大きい方。自分に行がなければ挿入。
  - 採用した受信行は **`updated_at` と `updated_by` を受信値のまま** 保存する（T06 で入れた自動の時刻付けを通さない。専用のSQLで書く）。
  - **競合**：自分の行が `lastSyncedAt` より後に更新されていて、かつ受信行と内容が違う場合を競合として数え、`conflictDetails` に（テーブル、ID、どちらを採用したか、両方の updated_at）を残す。
  - **銘柄で一意なテーブル**（`watchlist_items`、`ticker_presets`）：受信行のIDが自分になく、同じ `symbol + market` の行が別IDである場合は、**IDの文字列が小さい方を正のIDとする**。正のIDの行だけを残し、もう一方は物理削除する。内容は後勝ちで決める。両PCで同じ規則を使うので、同期を重ねると同じ状態に収束する。
- `runSync(db, peer, transport)`：`transport` は HTTP 呼び出しを抽象化したもの（テストで2つのDBを直結できるように）。手順：
  1. `db.backup()` で `data/sync-backups/portfolio-<日時>.db` にバックアップ（直近10個を残す。DBパスと同じフォルダ基準）
  2. 相手の `ping` で時刻差を測る（3分超なら警告として結果に含める）
  3. 受信：相手の `changes?since=<last_pulled_until − 5分>` → `applyChanges`。`last_pulled_until` を相手の `serverTime` に更新
  4. 送信：`collectChanges(since = last_pushed_until − 5分, excludeDeviceId = 相手)` → 相手の `apply`。`last_pushed_until` を収集開始時の自分の時刻に更新
  5. `sync_log` に記録、`sync_peers.last_synced_at` 更新、`purgeDeletedRows()`
  6. 途中で失敗したら `sync_log` に `failed` と理由を残す（受信分の反映はトランザクション単位で確定済みでよい）
- 5分の重なりは、相手と時計がずれていても取りこぼさないため。同じ行を2回受け取っても後勝ち判定で何も変わらない（冪等）。

## テスト（vitest、`src/lib/sync/*.test.ts`）
`openDatabase(path)` で一時DBを2つ（A・B）開き、`transport` を直結して確認する。
1. A で追加 → 同期 → B に出る。B で編集 → 同期 → A に反映。
2. A で削除 → 同期 → B でも一覧から消える（論理削除が伝わる）。
3. 同じ行を両方で編集 → 後で編集した方が残る。競合として1件数えられる。同時刻ならデバイスIDの大きい方。
4. A と B で別々に同じ銘柄をウォッチリストに追加 → 同期を2回 → 両方に1行だけ、IDが一致する。
5. 同期を2回続けても2回目の受信・送信の反映件数が0（冪等）。
6. 署名：正しい署名は通る。改ざんした本文・古いタイムスタンプ・未登録デバイスは拒否される（署名検証関数の単体テスト）。
7. ペアリングコード：期限切れ・使用済み・誤りを拒否する。
8. バックアップが作られ、10個を超えると古いものから消える。

## 確認
`npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`。
さらに手動確認として、`data/portfolio.db` のコピー2つで `next start -p 3101` と `-p 3102` を起動し（`PM_SYNC_PUBLIC_PORT` をそれぞれのポートに設定）、curl で pairing → peers → run を実行して双方向に同期できることを確かめ、手順と結果をレポートに書く。本物のDBには触れない。

## レポート
`docs/renovation/reports/T07.md` に AGENT_RULES.md の形式で書く。プロトコルの最終仕様（ヘッダー・ペイロード例）も載せる。
