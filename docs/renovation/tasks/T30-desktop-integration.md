# T30 Windows デスクトップ統合：タスクバーのアイコン・起動用ショートカット・終了処理

共通ルール: docs/renovation/AGENT_RULES.md と docs/renovation/PLAN.md を最初に読むこと。

## 現状と問題
- 起動は `D:\code\pm-ai-logs\start-portfolio.cmd`（`npm run desktop:start` → `electron/desktop-runner.mjs` が `next start` と Electron を起動）。
- `electron/main.mjs` は `app.setAppUserModelId('com.cielo.portfolio-manager')` と BrowserWindow の `icon`（build/icon.ico）を設定済み（T25）。
- ユーザーの要望：**タスクバーに新しいアイコン（build/icon.ico）が出るようにしたい**。現状は、同じ AppUserModelID を持つショートカットが無いため、Windows がタスクバーで electron.exe の既定アイコンや古いアイコンを出す可能性がある。また、黒いコマンドウィンドウ（cmd）が別ボタンとしてタスクバーに出る。
- 不具合：**アプリのウィンドウを閉じても `next start`（ポート 3001）が残る**ことがある（ウィンドウを閉じた後に node の next start プロセスが孤立して LISTEN し続けていた。親の cmd を閉じた場合と、Electron を閉じた場合の両方を想定して原因を調べること）。

## やること
1. タスクバーのアイコンとグループ化
   - Electron の `BrowserWindow#setAppDetails({ appId, appIconPath, appIconIndex, relaunchCommand, relaunchDisplayName })`（Windows のみ）を使い、タスクバーのボタンと「ピン留め」時のアイコン・起動コマンドを新アイコン（build/icon.ico）と正しい起動方法にする。
   - `shell.writeShortcutLink` で、スタートメニュー（`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Portfolio Manager.lnk`）に AppUserModelID・アイコン付きのショートカットを作成／更新する処理を用意する（起動時に毎回、内容が違うときだけ更新）。
   - デスクトップにも同じショートカットを作るスクリプト `scripts/create-shortcuts.mjs`（`npm run desktop:shortcuts`）を用意。ショートカットのリンク先は下記の「コンソールを出さない起動」。
2. コンソールを出さない起動
   - リポジトリ内に `scripts/launch-desktop.vbs`（または同等の方法）を用意し、コンソールウィンドウを表示せずに `npm run desktop:start` を起動する。ログは `data/logs/desktop-YYYYMMDD.log`（なければ作成、`.gitignore` 済みか確認）に出す。
   - すでにアプリが起動中なら二重起動せず、既存ウィンドウを前面に出す（Electron の `app.requestSingleInstanceLock` と `second-instance` イベント）。
3. 終了処理の修正
   - Electron のウィンドウを閉じたとき・Electron が落ちたとき・desktop-runner が終了したとき（コンソールを閉じた場合を含む）に、`next start` と同期リレー・mDNS をすべて確実に止める。Windows ではプロセスツリーごと終了（既存の `taskkill /t /f` の呼び出しが効いていない原因を特定して修正）。
   - 起動時、前回の孤立した自分の `next start`（このリポジトリの node_modules から起動され、ポートを LISTEN しているもの）が残っていたら検出して終了させるか、少なくとも別ポートで起動して警告をログに残す（判断をレポートに）。
4. ドキュメント
   - `docs/renovation/DESKTOP.md`（新規）に、起動方法・ショートカット作成・ログの場所・トラブル時の対処を日本語で簡潔に書く。

## 変更してよいファイル
- electron/main.mjs, electron/desktop-runner.mjs, electron/sync-relay.mjs（終了処理のみ）, electron/discovery.mjs（終了処理のみ）
- scripts/launch-desktop.vbs（新規）, scripts/create-shortcuts.mjs（新規）
- package.json（scripts の追加のみ。依存の追加は禁止）
- .gitignore（ログフォルダの除外が必要な場合のみ）
- docs/renovation/DESKTOP.md（新規）, docs/renovation/reports/T30.md（新規）
- 必要なら electron 側の新規テスト（vitest で実行できるもの）

## 確認
- `node --check` で変更した .mjs、`npx tsc --noEmit`、`npm run lint`、`npm test`。
- **Electron・`npm run desktop*`・`next start`・`npm run build` は実行しないこと**（ユーザーの画面にウィンドウが出る／本番DBを使うため。実機確認はレビュー担当が行う）。ショートカットの作成もスクリプトを用意するだけで、実行はしないこと。
- 実DB（data/portfolio.db）には触れないこと。

## レポート
docs/renovation/reports/T30.md に、原因（特にサーバーが残る理由）、変更点、レビュー担当が実機で確認すべき手順を書く。