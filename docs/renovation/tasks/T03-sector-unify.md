# T03 保有銘柄のセクター定義を SectorKey に統一

まず `docs/renovation/AGENT_RULES.md` と `docs/renovation/PLAN.md` を読み、ルールに従うこと。
このタスクは T02（`src/lib/db/` への分割）の後に行う。DBアクセスは `@/lib/db` を使う。

## 背景
ウォッチリストは `src/lib/sectors.ts` の `SectorKey`（`technology` など）でセクターを持つが、保有銘柄（holdings）は英語の自由入力（`Technology`、`Finance`、`Consumer` など）で、色は `src/lib/utils.ts` の `SECTOR_COLORS` から引いている。保有に新しいキーで登録するとセクター配分で「その他」の灰色になる。これを `SectorKey` に統一する。

## 変更してよいファイル
- `src/lib/sectors.ts`（色の追加など、既存の公開関数の挙動は変えない）
- `src/lib/utils.ts`（`SECTOR_COLORS` の削除）
- `src/lib/db/migrations.ts`、`src/lib/db/holdings.ts`、`src/lib/db/backup.ts`、`src/lib/db/seed.ts`
- `src/lib/mock-data.ts`
- `src/app/api/holdings/route.ts`、`src/app/api/holdings/[id]/route.ts`
- `src/components/add-holding-modal.tsx`、`src/components/edit-holding-modal.tsx`、`src/components/sector-chart.tsx`、`src/components/holdings-table.tsx`（表示がある場合のみ）
- `src/hooks/use-portfolio.ts`
- `src/types/index.ts`（`SectorAllocation` の型変更が必要な場合のみ）
- `src/lib/db/connection.ts`（下記「T02レビューの指摘」のみ）
- `README.md`（プロジェクト構造の `sqlite.ts` の行を `db/` に直すだけ）
- `docs/renovation/reports/T03.md`（新規）

## 仕様
1. **保存値**：`holdings.sector` には `SectorKey` か `null` だけを保存する。
   - 株式は `normalizeSectorKey()` で正規化して保存する。未指定なら `resolveSectorForSymbol(symbol, market)` で自動判定する（ウォッチリストの作成処理と同じ考え方）。
   - **現金（symbol = 'CASH'）と FX（market = 'FX'）は `sector = null`** で保存する。現金・FXかどうかは symbol と market で判定し、セクター列に頼らない。
2. **マイグレーション**：`migrations.ts` に version 2 を追加し、既存の holdings 行を正規化する。`'Cash'` と `'FX'`、および現金・FXの行は `null` に、それ以外は `normalizeSectorKey()` の結果にする。`sectors.ts` の `normalizeSectorKey` が旧表記（`Technology`、`Finance`、`Consumer` など）を正しく変換できるか確認し、足りない旧表記があれば `sectors.ts` の対応表に追加する。
3. **API**：`POST /api/holdings` と `PATCH /api/holdings/[id]` は、受け取った sector を正規化して保存する。現金・FXに sector が送られても `null` にする。
4. **バックアップ取込**：`importBackupData` で holdings の sector も同じ規則で正規化する（ウォッチリストと同じ扱い）。
5. **モックデータ**：`mock-data.ts` の holdings の sector を `SectorKey` に直す（NVDA・AAPL・MSFT＝`technology`、7203・6758＝`consumer_discretionary`、8306＝`financials`、USDJPY＝なし）。
6. **画面**
   - 追加・編集モーダルのセクター選択肢は、ファイル内のローカル定数 `SECTORS` をやめ、`sectors.ts` の `SECTORS`（キーと日本語ラベル）から作る。現金・FXのときはセクター選択を出さない（今の挙動に合わせる）。
   - セクター配分（`use-portfolio.ts` の `sectorAllocation`）は、キーを「`SectorKey` ／ `'cash'` ／ `'fx'`」で集計し、表示名は `getSectorLabel()`（現金は「現金」、FXは「FX」）、色は新しく `sectors.ts` に追加する `SECTOR_CHART_COLORS: Record<SectorKey | 'cash' | 'fx', string>` から取る。色は、今の `SECTOR_COLORS` の色をできるだけ引き継ぎ、13セクター＋現金＋FXで互いに見分けられるようにする。
   - `sector-chart.tsx` の凡例・ツールチップは日本語ラベルを表示する。
   - `SECTOR_COLORS` は削除し、参照が残っていないことを確認する。

## T02レビューの指摘（このタスクで一緒に直す）
1. `connection.ts`：`journal_mode = WAL` と `foreign_keys = ON` の PRAGMA が `getDb()` の呼び出しごと（＝クエリごと）に実行されている。DBを開いた直後の1回だけにする。
2. `migrations.ts`：`runMigrations` の「外部キーを一時的に OFF にする」判定が `version === 1` に固定されている。マイグレーション定義に `disableForeignKeys?: boolean` を持たせ、未適用の中に1つでも `true` があれば OFF にする形に変える（version 1 は `true`、今回の version 2 は不要なので省略）。後続フェーズでテーブル再作成を伴うマイグレーションを足すための準備。
3. `README.md` のプロジェクト構造で `sqlite.ts  # SQLiteデータアクセス` の行を `db/  # SQLiteデータアクセス（モジュール分割・マイグレーション）` に直す。

## 確認
1. `npx tsc --noEmit`、`npm run lint`、`npm run build`
2. `data/portfolio.db` のコピーを `SQLITE_DB_PATH` に指定して起動し、`/api/portfolio-data` の holdings の sector がすべて `SectorKey` か `null` になっていること。`user_version` が 2 になっていること。
3. 新規DB（存在しないパス）でも同様。
4. `POST /api/holdings` に `{"sector":"Technology", ...}` と `{"symbol":"CASH", "sector":"Cash", ...}` を送り、それぞれ `technology` と `null` で保存されること（コピーDBで行う）。
5. 本物の `data/portfolio.db` には触れない。一時ファイルは最後に削除する。

## レポート
`docs/renovation/reports/T03.md` に AGENT_RULES.md の形式で書く。旧表記→新キーの対応表も載せる。
