# T08a LAN同期：Electron の同期専用中継サーバー

まず `docs/renovation/AGENT_RULES.md` と `docs/renovation/PLAN.md`、`docs/renovation/tasks/T07-sync-engine.md` の「ネットワーク構成」を読むこと。
**T07（同期エンジンとAPI）を別のエージェントが同時に実装している。`electron/` と `README.md` 以外には触れず、`git status` に出る他の変更は無視すること。`npm run build`・`npm run desktop:start`・`next start` は実行しないこと（ビルドが衝突するため。結合確認はレビュー担当が行う）。**

## 目的
Next.js サーバーを LAN に公開せず、相手PCからの同期リクエスト（`/api/sync/peer/*`）だけを LAN から受け付ける小さな中継サーバーを Electron 側に作る。これで画面用のAPI（全データ削除など）は LAN から一切届かない。

## 変更してよいファイル
- `electron/sync-relay.mjs`（新規）
- `electron/main.mjs`
- `electron/desktop-runner.mjs`
- `README.md`（「LAN同期」節の追加のみ）
- `docs/renovation/reports/T08a.md`（新規）

## 仕様
1. `electron/sync-relay.mjs` に `startSyncRelay({ listenPort, targetOrigin, log })` を作る。Node 標準の `http` だけで実装する（依存追加なし）。
   - `0.0.0.0:listenPort` で待ち受ける。
   - パスが `/api/sync/peer/` で始まるリクエストだけを `targetOrigin`（例 `http://127.0.0.1:38401`）へそのまま転送する（メソッド、クエリ、本文、`Content-Type` と `X-PM-` で始まるヘッダー）。それ以外は 404。
   - 転送時に `X-Forwarded-For` を接続元IP（`req.socket.remoteAddress`、IPv4射影 `::ffff:` は外す）で**上書き**する（相手が送ってきた値は捨てる）。
   - 本文は 20MB まで（超えたら 413）。転送先への接続は 30秒でタイムアウト（504）。転送先に繋がらなければ 502。
   - 接続元がプライベートIPv4（10/8、172.16/12、192.168/16）またはループバック以外なら 403。
   - 停止用の `close()` を返す。
2. `electron/main.mjs`（パッケージ版）
   - Next.js サーバーは今どおり `127.0.0.1` の空きポートで起動する。
   - 中継サーバーを `PM_SYNC_PORT`（既定 38400）で起動する。使用中なら警告をログに出し、同期は無効のまま起動を続ける（アプリ自体は使える）。
   - Next.js の子プロセスに環境変数 `PM_SYNC_PORT` と `PM_SYNC_PUBLIC_PORT`（どちらも実際に待ち受けたポート、失敗時は空）を渡す。
   - アプリ終了時に中継サーバーも閉じる。
3. `electron/desktop-runner.mjs`（開発・`desktop:start`）
   - `npm run dev` / `start` を `--hostname 127.0.0.1` 付きで起動するように変える（今は全インターフェースで待ち受けている）。
   - 同じく中継サーバーを起動し、環境変数を渡す。
4. `README.md` に「LAN同期」節を追加：仕組み（中継ポート 38400、Link と同期ボタン）、初回に Windows ファイアウォールの許可ダイアログが出たら「プライベートネットワーク」だけ許可すること、ポートを変える環境変数。

## 確認
- `npm run lint`、`npx tsc --noEmit`
- `node` で中継サーバー単体を起動する一時スクリプトを書き、転送されるパス／されないパス、`X-Forwarded-For` の上書き、本文サイズ上限、転送先停止時の 502 を確認する（確認後スクリプトは削除）。
- 中継サーバー単体の確認では、転送先に `node:http` で作った簡易サーバー（一時スクリプト内）を使う。

## レポート
`docs/renovation/reports/T08a.md` に AGENT_RULES.md の形式で書く。
