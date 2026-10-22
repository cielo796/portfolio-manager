# T09 LAN同期の結合確認（中継サーバー＋Next.js＋同期API）

まず `docs/renovation/AGENT_RULES.md`、`docs/renovation/reports/T07.md`、`docs/renovation/reports/T08a.md` を読むこと。

## 目的
これまで別々に確認した部品（T07 の同期API、T08a の Electron 中継サーバー）を実際に組み合わせ、「2台のPC」を同じPC上で再現して、LAN経由の Link と同期が最後まで動くことを確かめる。**このタスクは確認が主目的。** 不具合を見つけた場合は、原因が明確で修正が小さい（数行）ときだけ直してよい。それ以外は直さずにレポートに書く。

## 変更してよいファイル
- 不具合修正が必要な場合に限り：`electron/sync-relay.mjs`、`electron/main.mjs`、`electron/desktop-runner.mjs`、`src/lib/sync/**`、`src/app/api/sync/**`
- `docs/renovation/reports/T09.md`（新規）
- 確認用スクリプトは一時フォルダ（`$env:TEMP` の下）に置き、最後に削除する

## 再現する構成
```
PC-A: Next.js (127.0.0.1:3201, DB=A) ← 中継A (127.0.0.1 ではなく このPCのLAN IPv4:38411)
PC-B: Next.js (127.0.0.1:3202, DB=B) ← 中継B (このPCのLAN IPv4:38412)
```
- DB は `data/portfolio.db` を**ファイルとしてコピー**した A・B を使う（AGENT_RULES の 6.）。コピー直後は同じデバイスIDなので、片方で `POST /api/sync/device/regenerate` を先に実行する。
- `npm run build` の後、`node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3201`（環境変数 `SQLITE_DB_PATH`、`PM_SYNC_PORT=38411`、`PM_SYNC_PUBLIC_PORT=38411`）、B も同様。
- 中継サーバーは `electron/sync-relay.mjs` の `startSyncRelay` を小さな Node スクリプトから起動する（`listenPort` 38411 → `targetOrigin` `http://127.0.0.1:3201`、B も同様）。
- このPCのLAN IPv4（`os.networkInterfaces()` のプライベートアドレス）を使い、相手のアドレスを `<LAN IP>:38412` のように指定する。LAN IP が取れない環境なら `127.0.0.1` で代用し、その旨を書く。

## 確認する手順（すべて HTTP で行い、結果を表にする）
1. B で `POST /api/sync/pairing` → A で `POST /api/sync/peers {address: "<LAN IP>:38412", code}` → 201。A・B の `GET /api/sync/peers` で互いが `reachable: true`。**B 側に登録された A の `base_url` が中継A（:38411）を指していること**（X-Forwarded-For 経由の IP 取得の確認）。
2. A でウォッチリスト追加・保有の編集・トレードアイデア削除 → A から `POST /api/sync/run` → B に反映。
3. B で取引追加・ウォッチリストのメモ編集 → B から同期 → A に反映。
4. 両方で同じウォッチリスト行を編集 → 片方から同期 → 後で編集した方が残り、`conflicts` が1。
5. A と B で別々に同じ銘柄をウォッチリストに追加 → 同期を2回 → 両方に1行だけ・同じID。
6. 2回続けて同期すると2回目は受信・送信とも0。
7. 中継経由で、署名なしの `GET /api/sync/peer/ping` → 401。`GET /api/portfolio-data`・`POST /api/sync/run`・`DELETE /api/backup` → 中継が 404 を返し Next.js に届かない。
8. 中継B を止めた状態で A から同期 → 失敗し、`sync_log` に `failed` と理由が残る。再起動後の同期で回復する。
9. 片方の DB の `user_version` を一時的に1下げたコピーで同期 → T07b のバージョン違いのエラー（409）になる（このケースは別のコピーで行う）。

## 後片付け
全プロセスを止め、一時フォルダを削除し、元の `data/portfolio.db` のハッシュが作業前と同じことを確認する。

## レポート
`docs/renovation/reports/T09.md` に AGENT_RULES.md の形式で、手順ごとの結果表、見つけた不具合と対応、Windows ファイアウォールの許可ダイアログが出たかどうかを書く。
