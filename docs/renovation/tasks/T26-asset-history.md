# T26 資産推移グラフ

共通ルール: docs/renovation/AGENT_RULES.md、docs/renovation/PLAN.md、デザインは docs/renovation/design/README.md を読むこと。
## 作業環境（重要）
- この作業は git worktree（`D:\code\pm-wt\T26`、ブランチ `feature/T26-asset-history`）で行う。`node_modules` は本体 `D:\code\portfolio-manager\node_modules` へのジャンクション。**`npm install` / 依存の追加・削除はしないこと**（本体と共有しているため）。必要な依存がある場合は「未対応・相談事項」に書く。
- ユーザーは本体フォルダ（D:\code\portfolio-manager）で本番DBを使ってアプリを起動中（Next.js 127.0.0.1:3001、同期リレー 0.0.0.0:38400）。**本体フォルダのファイル・`.next`・`data/` には一切触れないこと**。
- このフォルダ内での `npm run build` と、一時DBを使った `next start`（ポート 3400 番台を使用）は可。`npm run desktop*` と Electron の起動は禁止（ユーザーの画面にウィンドウが出る・ポートが衝突する）。
- DB を使う確認は必ず `PM_FORBID_REAL_DB=1` と一時の `SQLITE_DB_PATH` で行う。
- 並行して別の worktree で別タスク（T27 同期の自動化）が進んでいる。マイグレーション番号は **v10（このタスク専用。v11 は使わない）** を使うこと（他方と衝突させない）。
## 目的
今は「今日の評価額」しか分からない。総資産（円）の推移を毎日記録し、S&P500・日経平均と比べて見られるようにする。

## DB（v10）
`portfolio_snapshots`：
- `id TEXT PRIMARY KEY` … **決定的なID** `"<YYYY-MM-DD>|<portfolio_id または 'ALL'>"`（2台のPCが同じ日に記録しても同じIDになり、LWW 同期で自然に収束させるため）
- `snapshot_date TEXT NOT NULL`（Asia/Tokyo の日付）、`portfolio_id TEXT`（全口座合計は NULL、IDは 'ALL'）
- `market_value_jpy REAL NOT NULL`、`cost_basis_jpy REAL NOT NULL`、`cash_jpy REAL`、`usd_jpy REAL`
- `is_estimate INTEGER NOT NULL DEFAULT 0`（後述の参考推移なら 1）
- 同期用の標準列（`created_at, updated_at, deleted_at, updated_by`）と `idx_portfolio_snapshots_updated_at`、`(snapshot_date)` の索引
- 同期対象（sync-tables.ts / changes.ts）・JSONバックアップ（backup.ts）に追加。`src/lib/db/sync-schema.test.ts` の旧スキーマ再現は既存の LEGACY_SYNC_TABLES の考え方で追従させる。
- 同期の競合：実測（is_estimate=0）は推計（1）より常に優先。同じ種類同士は既存の LWW。

## 記録のタイミング
- 価格更新（`POST /api/prices` が成功したとき）と、`/api/portfolio-data` 取得時に、その日の全口座合計＋口座別のスナップショットを upsert（同じ日は最新値で上書き）。評価額の計算は既存の `portfolio-calc` の計算を再利用し、画面の合計と一致させる。価格未取得の保有がある日は記録しない、または欠損を明示する（判断をレポートに）。
- 書込みが頻繁にならないよう、同じ日の再記録は値が変わったときだけ更新日時を進める。

## 参考推移（初回の空白を埋める）
- 記録がない過去について、「現在の保有数量 × 過去の終値（price_history、なければ /api/chart で取得してキャッシュ）× 当時の USD/JPY」で最大1年分を `is_estimate=1` として作成するボタン（「参考推移を作成」）を用意。売買の履歴は考慮しない近似であることを画面に明記。実測がある日は上書きしない。

## 画面
- 新規 `/history`（左ナビの「マーケット」の次に「資産推移」）。
- 上段：期間ボタン（1M/3M/6M/YTD/1Y/全期間）、口座切替（全口座／各口座）、指標（評価額・取得額・評価損益・期間騰落率・最大ドローダウン）。
- 中段：lightweight-charts の折れ線。評価額（実線）、取得額（点線）、評価損益は下段のエリア。推計部分は淡色／破線で区別。
- 比較モード：期間の開始日を100とした指数で、ポートフォリオ・S&P500（^GSPC、円換算と現地通貨の切替）・日経平均（^N225）を重ねる。
- 下段：月末ごとの表（評価額・前月比・取得額・損益）。CSV 出力。
- ホームに小さなパネル（直近3か月の評価額の折れ線＋期間騰落率、/history へのリンク）を追加（既存レイアウトを崩さない範囲）。

## テスト
- スナップショットの計算（円換算、口座別、価格欠損）、決定的ID、同日上書き、実測と推計の優先、期間騰落率・最大ドローダウン、指数化、移行の冪等性、2台同期で同じIDに収束すること。

## 変更してよいファイル
- src/lib/db/migrations.ts, src/lib/db/snapshots.ts（新規）, src/lib/db/index.ts, src/lib/db/sync-tables.ts, src/lib/db/backup.ts
- src/lib/sync/changes.ts（競合ルール）
- src/app/api/snapshots/**（新規）, src/app/api/prices/route.ts, src/app/api/portfolio-data/route.ts（記録の呼出しのみ）
- src/app/history/page.tsx（新規）, src/components/history/**（新規）
- src/components/home/**（パネル追加）, src/components/shell/side-nav.tsx
- src/lib/portfolio-calc.ts（再利用のための小さな切り出しのみ）
- src/types/index.ts
- テスト：src/lib/db/snapshots.test.ts（新規）, src/lib/sync/sync.test.ts, src/lib/db/sync-schema.test.ts, 関連の新規テスト
- docs/renovation/reports/T26.md（新規）

## 確認
`npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`、一時DBでの `next start -p 3401` による画面・API確認。

## レポート
docs/renovation/reports/T26.md に、変更点・確認結果・判断・未対応を書く。