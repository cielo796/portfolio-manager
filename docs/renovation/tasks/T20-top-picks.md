# T20 トップピック（DB・API・画面）

まず `docs/renovation/AGENT_RULES.md`、`docs/renovation/PLAN.md`、`docs/renovation/design/README.md` を読むこと。T19（銘柄メモ）の後に行う。
見た目の基準は `docs/renovation/design/TopPicks.dc.html`。

## 目的
保有・ウォッチリストとは別に、確信度の高い銘柄を最大10件に絞って順位を付け、選定後の成績（S&P500比）を追う。外したピックも成績ごと残す。LAN同期の対象にする。

## 変更してよいファイル
- `src/lib/db/migrations.ts`、`src/lib/db/top-picks.ts`（新規）、`src/lib/db/index.ts`、`src/lib/db/sync-tables.ts`、`src/lib/db/backup.ts`
- `src/lib/sync/changes.ts`
- `src/app/api/top-picks/**`（新規）
- `src/app/top-picks/page.tsx`（新規）、`src/components/top-picks/**`（新規）
- `src/components/shell/side-nav.tsx`
- `src/components/holdings/**`、`src/components/detail/**`、`src/components/memos/**`（「トップピック #N」バッジの表示のみ）
- `src/lib/top-picks-calc.ts`（新規、成績計算の純粋関数）
- `src/types/index.ts`
- テスト：`src/lib/top-picks-calc.test.ts`、`src/lib/db/top-picks.test.ts`、`src/lib/sync/sync.test.ts`（追加分）
- `docs/renovation/reports/T20.md`（新規）

## DB（次の番号のマイグレーション）
```
top_picks(id TEXT PRIMARY KEY, symbol TEXT NOT NULL, market TEXT NOT NULL, rank INTEGER NOT NULL,
  theme TEXT, conviction TEXT CHECK (conviction IN ('high','medium','low')),
  horizon TEXT CHECK (horizon IN ('short','medium','long')),
  picked_at TEXT NOT NULL /* YYYY-MM-DD */, picked_price REAL NOT NULL, benchmark_at_pick REAL /* その日のS&P500終値 */,
  target_price REAL, review_on TEXT /* YYYY-MM-DD */,
  thesis TEXT, catalysts TEXT, risks TEXT, exit_rule TEXT,
  removed_at TEXT, removed_price REAL, benchmark_at_remove REAL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, updated_by TEXT)
```
- 同期対象（T06 の規則）。一意制約は付けない（同じ銘柄を外した後にもう一度ピックできる）。
- 現在のピック（`removed_at IS NULL AND deleted_at IS NULL`）は最大10件。11件目の追加は 409。
- `rank` は現在のピックの中で 1 から連番。並べ替えAPIで振り直す。同期で順位が重なった場合の表示は `rank, updated_at` 順で、次に並べ替えたときに振り直す。

## API
- `GET /api/top-picks?status=current|removed`
- `POST /api/top-picks`：`{ symbol, market, theme?, conviction?, horizon?, pickedAt?, pickedPrice?, targetPrice?, reviewOn?, thesis?, catalysts?, risks?, exitRule? }`。`pickedAt` の既定は今日、`pickedPrice` の既定は `stock_prices` の現在値（無ければ 400）。`benchmark_at_pick` は `price_history` の `^GSPC`（`market='INDEX'`）のその日以前で直近の終値（T12 のテーブル）。無ければ NULL。
- `PATCH /api/top-picks/[id]`、`DELETE /api/top-picks/[id]`（論理削除）
- `POST /api/top-picks/[id]/remove`：外す。`removed_at`、`removed_price`（現在値）、`benchmark_at_remove` を記録。
- `PATCH /api/top-picks/reorder`：`{ ids: string[] }`

## 成績の計算（`top-picks-calc.ts`）
- 選定来の騰落率 = （現在値または外した時の値 − 選定時の値）÷ 選定時の値
- S&P500比 = 選定来の騰落率 − 同期間の S&P500 の騰落率（どちらかの S&P500 の値が無ければ「—」）
- 目標まで = （目標価格 − 現在値）÷ 現在値
- サマリー：ピック数、平均騰落率、S&P500比の平均、プラスの銘柄数／件数、次の見直し日（`review_on` と次回決算日のうち近いもの）
- 状態（保有中／登録／未登録）は保有とウォッチリストから判定し、DBには持たない。

## 画面 `/top-picks`
- 上部：成績のサマリー帯。
- 左：タブ「現在のピック」「外したピック」、「＋ ピックを追加」（銘柄の検索と項目の入力ダイアログ）。テーブル：つまみ（ドラッグで順位変更）・順位・コード・銘柄名・状態バッジ・テーマ・確信度（●●●）・期間・選定日・選定時・現在値・選定来・S&P比・目標・目標まで・見直し。外したピックは順位の代わりに外した日と外した時の値。
- 右ペイン：選択中のピックの詳細。順位・名称・バッジ、選定日からの価格チャート（`/api/chart` の終値の折れ線に、選定時の値と目標価格の点線）、選定理由・カタリスト・リスク・外す条件（その場で編集・自動保存）、関連メモ（T19 の `/api/memos?symbol=` の3件と「メモを書く」）、ボタン「銘柄詳細」「ピックから外す」（2回押す方式）。
- 左ナビに「トップピック」（`/top-picks`）を「登録銘柄」の次に追加。
- 保有銘柄・銘柄詳細・銘柄メモの各画面で、トップピックの銘柄に「トップピック #N」バッジを出す。

## テスト
- 成績計算（S&P500 の値が欠ける場合を含む）、最大10件、順位の振り直し、外す処理、同期で2台に反映されること。

## 確認
`npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`。一時DBのコピーで `next start` を起動し、`/top-picks` が 200、API の追加→並べ替え→外す→一覧が通ること。

## レポート
`docs/renovation/reports/T20.md` に AGENT_RULES.md の形式で書く。
