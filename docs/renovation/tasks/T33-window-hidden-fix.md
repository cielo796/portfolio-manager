# T33 ショートカット起動でウィンドウが非表示のままになる不具合の修正（小修正）

共通ルール: docs/renovation/AGENT_RULES.md を必ず読んで従うこと。

## 現象と原因
- デスクトップのショートカット（scripts/launch-desktop.vbs → npm run desktop:start → electron/desktop-runner.mjs）から起動すると、アプリのウィンドウが作られるが**非表示（IsWindowVisible=false）のまま**になる。ユーザーには「起動しない」ように見える。
- 原因：`electron/desktop-runner.mjs` 191〜192行目付近で Electron を `spawn(electronPath, [root], { ..., windowsHide: true })` で起動している。Windows では `windowsHide: true` により子プロセスの STARTUPINFO が SW_HIDE になり、Electron の最初の ShowWindow が非表示扱いになる。

## やること
1. `electron/desktop-runner.mjs`：**Electron の spawn だけ** `windowsHide: false` にする（Next.js・ビルド・taskkill 等のコンソール系プロセスは `windowsHide: true` のまま）。理由をコメントで1行残す。
2. `electron/main.mjs` の `createWindow`：念のため確実に表示されるようにする。
   - `new BrowserWindow({ ..., show: false })` にし、`win.once('ready-to-show', ...)` で `win.show()` と `win.focus()`。
   - さらに保険として、`ready-to-show` 後に `setTimeout(..., 300)` で `!win.isVisible()` なら再度 `win.show()`（最小化なら `restore()`）。
   - 読み込みが失敗して `ready-to-show` が来ない場合でも表示されるよう、`did-fail-load` か一定時間（例 5 秒）後に未表示なら `show()` する。
   - `focusWindow`（second-instance 時）も、`!isVisible()` のときは `show()` を確実に呼ぶ（既存のままで良ければ変更不要）。
3. テスト：`electron/main.test.mjs`（既存のモックテスト）に、`show: false` で作成され `ready-to-show` で表示されること、未表示時の保険で再表示されることを追加。`electron/desktop.test.mjs` 等に Electron の spawn オプションが `windowsHide: false` であることの確認を追加できれば追加。

## 変更してよいファイル
- electron/desktop-runner.mjs（Electron の spawn オプションのみ）
- electron/main.mjs（createWindow と focusWindow の表示処理のみ）
- electron/main.test.mjs、electron/desktop.test.mjs
- docs/renovation/reports/T33.md（新規）

## 確認
- `node --check electron/main.mjs electron/desktop-runner.mjs`、`npm run test:desktop`、`npm test`、`npm run lint`（PM_FORBID_REAL_DB=1 は設定済み）。
- **Electron・`npm run desktop*`・`next start`・`npm run build` は実行しないこと**（ユーザーがアプリを使用中）。

## レポート
docs/renovation/reports/T33.md に変更点と結果を短く書く。