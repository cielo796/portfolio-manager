# T19 銘柄メモ（DB・API・画面）

まず `docs/renovation/AGENT_RULES.md`、`docs/renovation/PLAN.md`、`docs/renovation/design/README.md` を読むこと。
見た目の基準は `docs/renovation/design/Memos.dc.html`。

## 目的
銘柄に紐づくメモを書き溜め、後から判断を振り返れるようにする。1件のメモに複数の銘柄を紐づけられる。LAN同期の対象にする。

## 変更してよいファイル
- `src/lib/db/migrations.ts`、`src/lib/db/memos.ts`（新規）、`src/lib/db/index.ts`、`src/lib/db/sync-tables.ts`、`src/lib/db/backup.ts`
- `src/lib/sync/changes.ts`（同期対象テーブルの追加）
- `src/app/api/memos/**`（新規）
- `src/app/memos/page.tsx`（新規）、`src/components/memos/**`（新規）
- `src/components/shell/side-nav.tsx`（ナビ項目の追加）
- `src/components/holdings/**`、`src/components/detail/**`（その銘柄の最新メモの表示と「メモを書く」リンク）
- `src/types/index.ts`
- テスト：`src/lib/db/memos.test.ts`、`src/lib/sync/sync.test.ts`（追加分）
- `docs/renovation/reports/T19.md`（新規）

## DB（次の番号のマイグレーション）
```
stock_memos(id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
  tag TEXT /* 'earnings'|'idea'|'trade'|'news'|'review'|NULL */,
  price_snapshot TEXT /* {"NVDA|US": {"price":142.5,"currency":"USD","at":"..."}} の JSON */,
  transaction_id TEXT /* 売買記録に添付したとき */,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, updated_by TEXT)
memo_symbols(id TEXT PRIMARY KEY, memo_id TEXT NOT NULL, symbol TEXT NOT NULL, market TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, updated_by TEXT,
  UNIQUE(memo_id, symbol, market))
```
- `memo_symbols` は外部キーを付けない（同期で親子の到着順が前後しても入るように）。一覧取得では親が削除済みの行を除外する。
- 2テーブルとも同期対象（T06 の規則：`updated_at`・`updated_by`・論理削除）。`sync-tables.ts` と同期エンジンの `tables` に追加し、反映順は `stock_memos` → `memo_symbols`。`memo_symbols` は `UNIQUE(memo_id, symbol, market)` なので、T07 のウォッチリストと同じ「小さいIDに収束」の扱いを適用する。
- バックアップの書き出し・取込にも含める。
- 既存の `holdings.memo` と `watchlist_items.memo` は残す（画面上は「ひとこと」として今のまま）。移行はしない。

## API
- `GET /api/memos?symbol=&market=&tag=&q=&limit=`：新しい順。各メモに紐づく銘柄の配列を含める。`q` はタイトル・本文の部分一致。
- `POST /api/memos`：`{ title, body, tag?, symbols: [{symbol, market}], transactionId? }`。保存時に、紐づく各銘柄の現在値を `stock_prices` から取って `price_snapshot` に入れる（無ければその銘柄は入れない）。
- `PATCH /api/memos/[id]`：タイトル・本文・タグ・銘柄の付け外し（`price_snapshot` は作成時のまま、銘柄を追加したときだけその銘柄の値を足す）。
- `DELETE /api/memos/[id]`：論理削除（紐づけも論理削除）。

## 画面 `/memos`（3ペイン、900px 未満は縦）
1. **左：一覧**：検索、タグのチップ（すべて・決算・アイデア・売買理由・ニュース・振り返り）、銘柄の絞り込み（すべて・保有銘柄のみ・指定銘柄）、「＋ 新規」。各行：日付・銘柄チップ・タグ・タイトル・本文1行目。選択行を強調。URL クエリ `?symbol=&market=` があればその銘柄で絞り込んだ状態で開く。
2. **中央：編集**：タイトル（大きめの入力欄）、紐づく銘柄（チップ＋「＋ 銘柄を紐づけ」：保有・ウォッチリスト・ティッカー候補から検索して選ぶ）、タグ（1つ選択）、記録時の株価（自動・読み取り専用）、作成・更新日時と更新したPC名、本文（`textarea`。Markdown のプレビューは不要）。入力は1秒止まったら自動保存し、「自動保存済み」「保存中…」「保存に失敗しました（再試行）」を表示。下部に「削除」（2回押す方式）。
3. **右：銘柄の状況**：選択中のメモの最初の銘柄について、現在値と前日比、保有数量（保有中なら）、登録リスト名、その銘柄のメモの時系列（日付・記録時の株価・タイトル）。

## 他画面との連携
- 左ナビに「銘柄メモ」（`/memos`）を「ニュース」の次に追加。
- 保有銘柄画面の右ペインと銘柄詳細画面の下段に、その銘柄の最新メモ3件と「＋ メモを書く」（`/memos?new=1&symbol=…&market=…` で新規作成を開いた状態）を出す。

## テスト
- `memos.test.ts`：作成時の株価スナップショット、銘柄の付け外し、論理削除、絞り込み（銘柄・タグ・q）。DB テストのきまりを守る。
- `sync.test.ts`：メモと紐づけが2台間で同期され、同じ (memo_id, symbol, market) を別々に足しても1行に収束すること。

## 確認
`npx tsc --noEmit`、`npm run lint`、`npm test`、`npm run build`。一時DBのコピーで `next start` を起動し、`/memos` が 200、API の作成→一覧→更新→削除が通ること。

## レポート
`docs/renovation/reports/T19.md` に AGENT_RULES.md の形式で書く。
