# Windowsデスクトップ版

## 起動

Node.js/npm・依存パッケージ・`build/icon.ico` を用意したリポジトリで利用します。
エクスプローラーから `scripts/launch-desktop.vbs` をダブルクリックするか、作成済みの「Portfolio Manager」ショートカットを開いてください。黒いコンソールは表示しません。

VBSはリポジトリを作業ディレクトリにして `npm run desktop:start` を実行します。既存の本番ビルドを使い、ビルドがない場合は従来どおり自動でビルドします。起動済みの場合は既存ウィンドウを復元して前面に表示し、追加のNext.jsサーバーは起動しません。

コンソールで状態を見たい場合はリポジトリで `npm run desktop:start`、開発時は `npm run desktop:dev` を使えます。これらの直接実行では出力先はコンソールです。

## ショートカット

リポジトリで一度、次を実行します。

```powershell
npm run desktop:shortcuts
```

以下の「Portfolio Manager.lnk」を作成／更新します。作成処理では表示用ウィンドウもNext.jsも起動しません。

- スタートメニュー: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Portfolio Manager.lnk`
- デスクトップ: Windowsの既知のデスクトップフォルダー（OneDriveへの移動にも対応）

リンク先は `wscript.exe` とリポジトリ内のVBSです。AppUserModelIDは `com.cielo.portfolio-manager`、アイコンは `build/icon.ico` に統一しています。スタートメニューのリンクはアプリ起動時にも確認し、内容が違うときだけ更新します。デスクトップへの作成は上記コマンドの実行時だけです。

タスクバーへ固定するときは新しいショートカット、または起動後のアプリのボタンから固定してください。古い固定アイコンは一度固定を外し、アプリを終了してから新しいショートカットで起動して固定し直してください。リポジトリを移動した場合もショートカットを再作成します。

## ログと終了

VBS／ショートカットから起動したログは `data/logs/desktop-YYYYMMDD.log` に追記します。日付は起動日のローカル日付です。日付をまたいだ稼働中のログは起動日のファイルに続きます。フォルダーは自動作成され、Gitの対象外です。

アプリのウィンドウを閉じるとElectron・Next.js・同期リレー・mDNSを終了します。通常終了では `taskkill /t /f` と同期サービスの終了を待ちます。Windowsでは非表示の監視用PowerShellがJob Objectを保持し、runnerのクラッシュ・強制終了・コンソールを閉じた場合にも子孫プロセスを終了させます。監視が準備できない場合はサーバー起動前に失敗してログを残します。

配布済み実行ファイルが内蔵サーバーを起動する場合も終了監視を使います。この形式のリンク先は配布実行ファイル、ログは従来どおりユーザーデータ内の `next-server.log` です。

## トラブル時

- 起動しない: 最新のログでビルド・Windows Job Object・依存パッケージのエラーを確認します。ログ自体がない場合はWindows Script Host/VBScriptと、Node.js/npmがPATH上で使えるか確認してください。PowerShellの実行制限やConstrained Language Modeで監視の初期化が失敗する場合は、ログを添えて実行環境を確認してください。
- 古いアイコンが残る: ショートカットを再作成し、古いタスクバー固定を外して固定し直します。同じパスのアイコン画像を差し替えてもWindowsのアイコンキャッシュが更新されない場合は、Explorerの再起動／サインアウト後にも確認します。
- ポート3001が使用中: 3001〜3020から空きポートを選び、使用中のポートと選択したURLをログに出します（`DESKTOP_PORT`指定時はその値から20個）。他アプリを誤終了させないため、旧版の孤立サーバーも自動削除しません。全ポート使用中なら起動を中止します。
- 同期が使えない: ログの `[sync-relay]` を確認します。同期ポート38400（`PM_SYNC_PORT`で変更可）が使用中の場合はLAN同期を無効にし、画面は起動します。
- 旧版の孤立サーバーを調べる: 以下で待受PIDとコマンドラインを照合します。このリポジトリの `node_modules\next\dist\bin\next` を起動した自分のプロセスであることを確認したうえで、そのPIDだけを終了してください。すべての `node.exe` や `electron.exe` を一括終了しないでください。

```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
Get-CimInstance Win32_Process -Filter 'ProcessId = <確認したPID>' |
  Select-Object ProcessId, ParentProcessId, ExecutablePath, CommandLine
# 対象が確認できた場合のみ
taskkill /pid <確認したPID> /t /f
```

## 開発用の確認

```powershell
node --check electron/main.mjs
node --check electron/desktop-runner.mjs
node --check electron/sync-relay.mjs
node --check electron/discovery.mjs
node --check scripts/create-shortcuts.mjs
npx tsc --noEmit
npm run lint
npm test
npm run test:desktop
```

`test:desktop` はElectron APIとショートカットをモックで検証します。Windowsでは専用のダミーNodeプロセスでJob Objectによる子・孫と待受ポートの回収も確認します。Electron・Next.js・実DBは使いません。通常の `npm test` とは別設定です。
