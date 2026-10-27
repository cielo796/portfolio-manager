/**
 * 米国主要銘柄をウォッチリスト（サブ2〜4）へセクター別に登録するシードスクリプト。
 *
 *   node scripts/seed-us-watchlist.mjs [DBパス]
 *
 * DBパス省略時は SQLITE_DB_PATH → Electron の userData → data/portfolio.db の順に探索する。
 * 何度実行しても同じ結果になる（既存銘柄は重複登録せず、セクター情報のみ補完する）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { US_STOCK_MASTER, resolveSectorForSymbol } from '../src/lib/sectors.ts';

// セクター → 配置するウォッチリストページ
const SECTOR_TO_LIST = {
  technology: 'sub2',
  communication: 'sub2',
  consumer_discretionary: 'sub2',
  healthcare: 'sub3',
  financials: 'sub3',
  industrials: 'sub3',
  consumer_staples: 'sub4',
  energy: 'sub4',
  materials: 'sub4',
  utilities: 'sub4',
  real_estate: 'sub4',
  etf: 'sub4',
  other: 'sub4',
};

const SECTOR_ORDER = [
  'technology',
  'communication',
  'consumer_discretionary',
  'consumer_staples',
  'healthcare',
  'financials',
  'industrials',
  'energy',
  'materials',
  'utilities',
  'real_estate',
  'etf',
  'other',
];

const resolveDbPath = () => {
  const fromArg = process.argv[2];
  if (fromArg) return path.resolve(fromArg);
  if (process.env.SQLITE_DB_PATH) return path.resolve(process.env.SQLITE_DB_PATH);

  const userDataDb =
    process.platform === 'win32'
      ? path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'Portfolio Manager', 'portfolio.db')
      : path.join(os.homedir(), '.config', 'Portfolio Manager', 'portfolio.db');
  if (fs.existsSync(userDataDb)) return userDataDb;

  return path.resolve(process.cwd(), 'data', 'portfolio.db');
};

const dbPath = resolveDbPath();
if (!fs.existsSync(dbPath)) {
  console.error(`DBが見つかりません: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// --- sector 列を用意 -------------------------------------------------------
const columns = db.prepare('PRAGMA table_info(watchlist_items)').all().map((c) => c.name);
if (!columns.includes('sector')) {
  db.exec('ALTER TABLE watchlist_items ADD COLUMN sector TEXT');
  console.log('watchlist_items.sector 列を追加しました');
}
if (!columns.includes('name')) {
  db.exec('ALTER TABLE watchlist_items ADD COLUMN name TEXT');
  console.log('watchlist_items.name 列を追加しました');
}

const now = () => new Date().toISOString();
const masterBySymbol = new Map(US_STOCK_MASTER.map((stock) => [stock.symbol, stock]));

const existingItems = db
  .prepare('SELECT id, symbol, market, name, sector, list_key FROM watchlist_items')
  .all();
const existingKeys = new Set(existingItems.map((item) => `${item.symbol}|${item.market}`));

// --- 1) 既存銘柄のセクター・社名を補完 --------------------------------------
const updateExisting = db.prepare(
  'UPDATE watchlist_items SET sector = @sector, name = @name, updated_at = @updated_at WHERE id = @id'
);
let filled = 0;
db.transaction(() => {
  for (const item of existingItems) {
    const master = item.market === 'US' ? masterBySymbol.get(item.symbol) : undefined;
    const nextSector =
      item.sector?.trim() || master?.sector || resolveSectorForSymbol(item.symbol, item.market);
    const nextName = item.name?.trim() || master?.name || null;
    if (nextSector === item.sector && nextName === (item.name ?? null)) continue;
    updateExisting.run({
      id: item.id,
      sector: nextSector,
      name: nextName,
      updated_at: now(),
    });
    filled += 1;
  }
})();
console.log(`既存銘柄のセクター/社名を補完: ${filled}件`);

// --- 2) 新規銘柄をサブ2〜4へ登録 -------------------------------------------
const insertItem = db.prepare(`
  INSERT INTO watchlist_items (id, symbol, name, market, list_key, sort_order, sector, target_price, memo, created_at, updated_at)
  VALUES (@id, @symbol, @name, @market, @list_key, @sort_order, @sector, NULL, NULL, @created_at, @updated_at)
`);

const pending = US_STOCK_MASTER.filter((stock) => !existingKeys.has(`${stock.symbol}|US`)).sort(
  (a, b) => {
    const diff = SECTOR_ORDER.indexOf(a.sector) - SECTOR_ORDER.indexOf(b.sector);
    return diff !== 0 ? diff : a.symbol.localeCompare(b.symbol);
  }
);

const nextSortOrder = new Map();
for (const row of db
  .prepare('SELECT list_key, MAX(sort_order) AS maxOrder FROM watchlist_items GROUP BY list_key')
  .all()) {
  nextSortOrder.set(row.list_key, (row.maxOrder ?? -1) + 1);
}

let inserted = 0;
db.transaction(() => {
  for (const stock of pending) {
    const listKey = SECTOR_TO_LIST[stock.sector] ?? 'sub4';
    const sortOrder = nextSortOrder.get(listKey) ?? 0;
    const timestamp = now();
    insertItem.run({
      id: crypto.randomUUID(),
      symbol: stock.symbol,
      name: stock.name,
      market: 'US',
      list_key: listKey,
      sort_order: sortOrder,
      sector: stock.sector,
      created_at: timestamp,
      updated_at: timestamp,
    });
    nextSortOrder.set(listKey, sortOrder + 1);
    inserted += 1;
  }
})();
console.log(`ウォッチリストへ新規登録: ${inserted}件`);

// --- 3) 候補リスト（ticker_presets）にも登録 --------------------------------
const presetKeys = new Set(
  db.prepare('SELECT symbol, market FROM ticker_presets').all().map((row) => `${row.symbol}|${row.market}`)
);
const insertPreset = db.prepare(`
  INSERT INTO ticker_presets (id, symbol, market, name, created_at, updated_at)
  VALUES (@id, @symbol, @market, @name, @created_at, @updated_at)
`);
let presetsAdded = 0;
db.transaction(() => {
  for (const stock of US_STOCK_MASTER) {
    if (presetKeys.has(`${stock.symbol}|US`)) continue;
    const timestamp = now();
    insertPreset.run({
      id: crypto.randomUUID(),
      symbol: stock.symbol,
      market: 'US',
      name: stock.name,
      created_at: timestamp,
      updated_at: timestamp,
    });
    presetsAdded += 1;
  }
})();
console.log(`候補リストへ追加: ${presetsAdded}件`);

// --- 4) 各リストをセクター順に整列 -----------------------------------------
const reorder = db.prepare('UPDATE watchlist_items SET sort_order = ? WHERE id = ?');
db.transaction(() => {
  for (const listKey of ['main', 'sub1', 'sub2', 'sub3', 'sub4']) {
    const rows = db
      .prepare('SELECT id, symbol, sector FROM watchlist_items WHERE list_key = ?')
      .all(listKey)
      .sort((a, b) => {
        const diff =
          SECTOR_ORDER.indexOf(a.sector ?? 'other') - SECTOR_ORDER.indexOf(b.sector ?? 'other');
        return diff !== 0 ? diff : a.symbol.localeCompare(b.symbol);
      });
    rows.forEach((row, index) => reorder.run(index, row.id));
  }
})();

// --- 結果表示 ---------------------------------------------------------------
console.log(`\nDB: ${dbPath}`);
console.table(
  db
    .prepare(
      `SELECT list_key AS リスト, sector AS セクター, COUNT(*) AS 銘柄数
       FROM watchlist_items GROUP BY list_key, sector ORDER BY list_key, sector`
    )
    .all()
);
console.log(
  '合計:',
  db.prepare('SELECT COUNT(*) AS c FROM watchlist_items').get().c,
  '銘柄 / 候補リスト:',
  db.prepare('SELECT COUNT(*) AS c FROM ticker_presets').get().c,
  '件'
);

db.close();
