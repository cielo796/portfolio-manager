# T06 LAN同期のためのDB変更（論理削除・更新日時・同期用テーブル）

まず `docs/renovation/AGENT_RULES.md` と `docs/renovation/PLAN.md` を読み、ルールに従うこと。
このタスクは T05 までの後に行う。DBアクセスは `@/lib/db`、マイグレーションは `src/lib/db/migrations.ts` に番号を追加する。

## 目的
各PCが自分の SQLite を持ち、Link 済みの相手とボタン操作で差分を交換する（後続の T07）。そのために、削除を相手に伝えられるよう論理削除に変え、全同期対象の行に更新日時と更新元デバイスを持たせ、同期用のテーブルを用意する。**このタスクでは同期処理そのものは作らない。**

## 同期対象のテーブル
`portfolios` / `holdings` / `transactions` / `trade_ideas` / `watchlist_items` / `ticker_presets`
（`stock_prices` と `news_items` はキャッシュなので対象外。後のフェーズで追加する `stock_memos` / `memo_symbols` / `top_picks` も最初から同じ規則で作る前提）

## 変更してよいファイル
- `src/lib/db/**`
- `src/types/index.ts`
- `src/app/api/**/route.ts`（削除APIの挙動確認と、必要なら戻り値の調整のみ）
- `src/lib/db/*.test.ts`（新規）
- `docs/renovation/reports/T06.md`（新規）

## 仕様

### 1. マイグレーション（次の番号を1つ追加）
- 同期対象の全テーブルに `deleted_at TEXT`（NULL＝有効）と `updated_by TEXT`（更新したデバイスID）を追加する。
- `transactions` に `updated_at TEXT NOT NULL` を追加する（既存行は `created_at` で埋める）。`portfolios` など既に `updated_at` があるテーブルはそのまま。
- `ticker_presets` も `updated_at` があることを確認する。
- 同期対象テーブルに `updated_at` のインデックスを作る（差分取得用）。
- 新規テーブル
  - `sync_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)`：`device_id`（初回に UUID を生成）、`device_name`（既定は OS のホスト名）
  - `sync_peers(id TEXT PRIMARY KEY, device_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, base_url TEXT NOT NULL, secret TEXT NOT NULL, last_synced_at TEXT, last_pulled_until TEXT, last_pushed_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`
  - `sync_log(id TEXT PRIMARY KEY, peer_device_id TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL CHECK (status IN ('running','success','failed')), received INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0, conflicts INTEGER NOT NULL DEFAULT 0, detail TEXT)`
- `sync_meta` / `sync_peers` / `sync_log` は同期対象にしない。バックアップの書き出しにも含めない（シークレットを含むため）。

### 2. デバイスIDと更新の記録
- `src/lib/db/device.ts` に `getDeviceId()` と `getDeviceName()` を作る（`sync_meta` から読み、なければ作る）。
- 同期対象テーブルへの INSERT / UPDATE はすべて `updated_at = 現在時刻` と `updated_by = getDeviceId()` を設定する。並べ替え（`updateHoldingsOrder` / `updateWatchlistItemsLayout`）も含む。
- 時刻はすべて ISO 8601 の UTC（`new Date().toISOString()`）。

### 3. 論理削除
- 各 `delete...ById` は行を消さず、`deleted_at = 現在時刻`、`updated_at = 現在時刻`、`updated_by` を設定する。戻り値（削除できたか）の意味は今と同じにする（既に削除済みなら false）。
- すべての `list...` と、ID で1件取る処理、更新処理は `deleted_at IS NULL` の行だけを対象にする。`listWatchlistItems` の社名補完のサブクエリ（`ticker_presets` / `holdings` を参照）も削除済みを除外する。
- **一意制約との両立**：`watchlist_items` と `ticker_presets` は `UNIQUE(symbol, market)`。論理削除済みの行がある銘柄を再び追加したときは、新しい行を INSERT せず、その削除済みの行を復活させる（`deleted_at = NULL` にして、入力値で上書き、`updated_at` 更新）。ID は既存のものを使う。API の戻り値は今と同じ形。
- `clearAllData()`（設定画面の全データ削除）は、同期対象テーブルについて全行を論理削除にする（相手PCにも削除が伝わるように）。キャッシュの `stock_prices` / `news_items` は今どおり物理削除。モック口座の再作成も今どおり。
- `importBackupData()`（バックアップ取込）は「このPCのデータを丸ごと置き換える」操作。既存の同期対象行はすべて論理削除にしてから、取込データを INSERT（同じIDがあれば復活・上書き）する。取込行の `updated_at` は取込時刻、`updated_by` は自分のデバイスID にする（取込を同期で相手に伝えるため）。
- 物理削除されなくなるので、論理削除から90日を過ぎた行を物理削除する `purgeDeletedRows(days = 90)` を用意する（呼び出しは T07 で同期の最後に行う。ここでは関数とテストだけ）。

### 4. 型
`src/types/index.ts` の同期対象の型に `deleted_at?: string | null` と `updated_by?: string | null` を追加し、`Transaction` に `updated_at` を追加する。画面側に影響が出ないこと（一覧には削除済みが来ないので表示は変わらない）。

## テスト（vitest、`src/lib/db/sync-schema.test.ts`）
一時DBで次を確認する。
1. 旧バージョンのDB（`user_version` が直前の番号）に対してマイグレーションが通り、既存行の `deleted_at` が NULL、`transactions.updated_at` が埋まる。
2. 削除→一覧に出ない→ `deleted_at` が入っている。
3. ウォッチリストで同じ銘柄を削除→再追加すると、同じIDで復活する。ティッカー候補も同様。
4. 作成・更新・並べ替えで `updated_at` と `updated_by` が更新される。
5. `clearAllData()` 後に一覧が空、行は論理削除で残る。
6. バックアップの書き出し→取込で件数が一致し、取込前の行は論理削除される。`sync_*` テーブルは書き出しに含まれない。
7. `purgeDeletedRows` が期限切れの削除行だけを物理削除する。

## 確認
`npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`。`data/portfolio.db` のコピーで `next start` を起動し、主要APIが 200 を返すこと。本物のDBには触れない。

## レポート
`docs/renovation/reports/T06.md` に AGENT_RULES.md の形式で書く。
