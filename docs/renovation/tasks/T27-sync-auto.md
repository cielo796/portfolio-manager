# T27 同期の自動化（相手PCの自動検出・自動同期・同期履歴）

共通ルール: docs/renovation/AGENT_RULES.md、docs/renovation/PLAN.md を読むこと。既存の LAN 同期の仕組み（src/lib/sync/**、src/app/api/sync/**、electron/sync-relay.mjs、electron/desktop-runner.mjs、src/components/settings/sync-settings.tsx）を最初に把握すること。
## 作業環境（重要）
- この作業は git worktree（`D:\code\pm-wt\T27`、ブランチ `feature/T27-sync-auto`）で行う。`node_modules` は本体 `D:\code\portfolio-manager\node_modules` へのジャンクション。**`npm install` / 依存の追加・削除はしないこと**（本体と共有しているため）。必要な依存がある場合は「未対応・相談事項」に書く。
- ユーザーは本体フォルダ（D:\code\portfolio-manager）で本番DBを使ってアプリを起動中（Next.js 127.0.0.1:3001、同期リレー 0.0.0.0:38400）。**本体フォルダのファイル・`.next`・`data/` には一切触れないこと**。
- このフォルダ内での `npm run build` と、一時DBを使った `next start`（ポート 3400 番台を使用）は可。`npm run desktop*` と Electron の起動は禁止（ユーザーの画面にウィンドウが出る・ポートが衝突する）。
- DB を使う確認は必ず `PM_FORBID_REAL_DB=1` と一時の `SQLITE_DB_PATH` で行う。
- 並行して別の worktree で別タスク（T26 資産推移グラフ）が進んでいる。マイグレーション番号は **v11（DB 変更が必要な場合のみ。v10 は使わない。不要なら追加しない）** を使うこと（他方と衝突させない）。
## 目的
今はペアリング後、毎回ボタンを押して同期している。相手PCのIPが変わると手で直す必要もある。これを自動化する。

## 1. 相手PCの自動検出（mDNS / DNS-SD）
- Electron 側（desktop-runner / sync-relay と同じプロセス）で、サービス `_pm-sync._tcp`（ポートは同期リレーのポート）を広告し、同種のサービスを探索する。TXT には deviceId・表示名・スキーマバージョンのみ（秘密情報は載せない）。
- **依存の追加は禁止**（node_modules 共有のため）。まず Node 標準の `dgram` でマルチキャスト 224.0.0.251:5353 の最小限の mDNS（PTR/SRV/TXT/A の問い合わせと応答）を実装する方針で検討し、無理がある場合は実装を止めて「未対応・相談事項」に必要な依存（例：bonjour-service）を書くこと。
- 検出結果は 127.0.0.1 限定の内部経路で Next.js 側に渡す（例：desktop-runner から `POST http://127.0.0.1:<port>/api/sync/discovery`、または Next 側が取りに行く）。外部（0.0.0.0 の同期リレー）からは到達できないこと。
- 検出情報は信頼しない：
  - **ペアリング済みの相手**（deviceId 一致）なら、保存しているアドレスを新しいIP/ポートに更新してよい（HMAC 認証は従来どおり必須なので、なりすましても同期はできない）。
  - **未ペアリングの相手**は設定画面に「近くのPC」として表示し、ペアリング操作の入力補助（アドレスの自動入力）にのみ使う。自動でペアリングしない。
- 自分自身の広告は除外する。

## 2. 自動同期
- 設定で「自動同期」を選べるようにする：オフ／起動時のみ／起動時＋定期（15・30・60分）。既定はオフ（ユーザーが明示的に有効化）。
- 実行はペアリング済みで到達可能な相手のみ。同時に2つの同期が走らないよう排他する（手動同期と自動同期の衝突も含む）。失敗時は次回まで待つ（連続リトライで負荷をかけない、指数バックオフ）。
- スケジューラはサーバー側（Next.js プロセス）か Electron 側かを検討し、アプリ起動中のみ動作すること。判断をレポートに書く。
- 最終同期日時・次回予定・直近の結果を、左ナビ下部の「LAN同期」表示と設定画面に反映する。

## 3. 同期履歴画面
- 設定画面の同期セクションに「同期履歴」タブを追加（既存の `sync_log`、API の action 'log' を利用・拡張）。
- 一覧：日時、相手、手動／自動、結果（成功・失敗・一部）、送受信件数（テーブル別に展開可能）、所要時間、エラーメッセージ（T21 で整えた文言をそのまま表示）。結果での絞り込み、直近 200 件まで。

## テスト
- mDNS メッセージのエンコード/デコード（自前実装の場合）、自分自身の除外、ペアリング済み相手のアドレス更新、未ペアリングは更新しない、内部経路が外部から呼べないこと、自動同期の間隔判定・排他・バックオフ、履歴APIの絞り込み。
- 実ネットワークでの2台検証はできないので、2つのソケット（またはモック）で広告と探索がつながることを単体テストで確認する。

## 変更してよいファイル
- electron/desktop-runner.mjs, electron/sync-relay.mjs, electron/discovery.mjs（新規）
- src/lib/sync/**（新規ファイル含む）, src/app/api/sync/**
- src/components/settings/**, src/components/shell/side-nav.tsx（LAN同期表示の部分のみ）
- src/lib/db/migrations.ts（v11 が必要な場合のみ）, src/lib/db/sync-tables.ts（必要な場合のみ）
- src/types/index.ts
- テスト：src/lib/sync/*.test.ts、electron 側の新規テスト（vitest で実行できる形）
- docs/renovation/reports/T27.md（新規）

## 確認
`npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`、一時DBで `next start -p 3402` による API・設定画面の確認（Electron は起動しない）。

## レポート
docs/renovation/reports/T27.md に、変更点・確認結果・判断（mDNS の実装方式、スケジューラの置き場所）・未対応（Windows ファイアウォールで UDP 5353 の許可が必要になる可能性など）を書く。