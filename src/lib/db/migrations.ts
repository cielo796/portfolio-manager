import 'server-only';

import type Database from 'better-sqlite3';
import { getDeviceId, getDeviceName } from './device';
import { SYNC_TABLES } from './sync-tables';
import { normalizeSectorKey, resolveHoldingSector, resolveSectorForSymbol } from '@/lib/sectors';

const MIGRATIONS: Array<{
  version: number;
  name: string;
  disableForeignKeys?: boolean;
  up: (db: Database.Database) => void;
}> = [
  { version: 1, name: 'baseline-schema', disableForeignKeys: true, up: createBaselineSchema },
  { version: 2, name: 'normalize-holding-sectors', up: normalizeHoldingSectors },
  { version: 3, name: 'sync-schema', up: createSyncSchema },
];

function createSyncSchema(db: Database.Database) {
  db.exec(`
    ALTER TABLE transactions ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
    UPDATE transactions SET updated_at = created_at;
    CREATE TABLE sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE sync_peers (
      id TEXT PRIMARY KEY, device_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      base_url TEXT NOT NULL, secret TEXT NOT NULL, last_synced_at TEXT,
      last_pulled_until TEXT, last_pushed_until TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE sync_log (
      id TEXT PRIMARY KEY, peer_device_id TEXT NOT NULL, started_at TEXT NOT NULL,
      finished_at TEXT, status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
      received INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0,
      conflicts INTEGER NOT NULL DEFAULT 0, detail TEXT
    );
  `);
  for (const table of SYNC_TABLES) {
    db.exec(`
      ALTER TABLE ${table} ADD COLUMN deleted_at TEXT;
      ALTER TABLE ${table} ADD COLUMN updated_by TEXT;
      CREATE INDEX idx_${table}_updated_at ON ${table}(updated_at);
    `);
  }
  getDeviceId(db);
  getDeviceName(db);
}

export function runMigrations(db: Database.Database) {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  const pending = MIGRATIONS.filter((migration) => migration.version > currentVersion)
    .sort((a, b) => a.version - b.version);
  if (pending.length === 0) return;

  // FX対応のテーブル再作成に備え、トランザクションの外で切り替える
  const needsForeignKeysOff = pending.some((migration) => migration.disableForeignKeys);
  const foreignKeys = db.pragma('foreign_keys', { simple: true }) as number;
  if (needsForeignKeysOff) db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      for (const migration of pending) {
        migration.up(db);
        db.pragma(`user_version = ${migration.version}`);
      }
    })();
  } finally {
    if (needsForeignKeysOff) db.pragma(`foreign_keys = ${foreignKeys}`);
  }
}

function normalizeHoldingSectors(db: Database.Database) {
  const rows = db.prepare('SELECT id, symbol, market, sector FROM holdings').all() as Array<{
    id: string;
    symbol: string;
    market: string;
    sector: string | null;
  }>;
  const update = db.prepare('UPDATE holdings SET sector = ? WHERE id = ?');
  for (const row of rows) {
    const legacySector = row.sector?.trim().toLowerCase();
    const sector = legacySector === 'cash' || legacySector === 'fx'
      ? resolveHoldingSector(row.symbol, row.market, null)
      : resolveHoldingSector(row.symbol, row.market, row.sector);
    if (sector !== row.sector) update.run(sector, row.id);
  }
}

function createBaselineSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      broker TEXT NOT NULL DEFAULT '',
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS holdings (
      id TEXT PRIMARY KEY,
      portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      name TEXT,
      market TEXT NOT NULL CHECK (market IN ('US', 'JP', 'FX')),
      shares REAL NOT NULL CHECK (shares > 0),
      avg_cost REAL NOT NULL CHECK (avg_cost >= 0),
      sort_order INTEGER NOT NULL DEFAULT 0,
      sector TEXT,
      memo TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      market TEXT NOT NULL CHECK (market IN ('US', 'JP', 'FX')),
      type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'dividend')),
      shares REAL NOT NULL CHECK (shares >= 0),
      price REAL NOT NULL CHECK (price >= 0),
      total_amount REAL NOT NULL,
      fees REAL NOT NULL DEFAULT 0 CHECK (fees >= 0),
      transaction_date TEXT NOT NULL,
      memo TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trade_ideas (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      market TEXT NOT NULL CHECK (market IN ('US', 'JP', 'FX')),
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watchlist_items (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      name TEXT,
      market TEXT NOT NULL CHECK (market IN ('US', 'JP', 'FX')),
      list_key TEXT NOT NULL DEFAULT 'main' CHECK (list_key IN ('main', 'sub1', 'sub2', 'sub3', 'sub4')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      sector TEXT,
      target_price REAL CHECK (target_price IS NULL OR target_price > 0),
      memo TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(symbol, market)
    );

    CREATE TABLE IF NOT EXISTS stock_prices (
      symbol TEXT NOT NULL,
      market TEXT NOT NULL CHECK (market IN ('US', 'JP', 'FX')),
      name TEXT NOT NULL,
      price REAL NOT NULL,
      change REAL NOT NULL,
      change_percent REAL NOT NULL,
      currency TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (symbol, market)
    );

    CREATE TABLE IF NOT EXISTS news_items (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      source TEXT NOT NULL,
      url TEXT NOT NULL,
      image_url TEXT,
      published_at TEXT NOT NULL,
      sentiment TEXT CHECK (sentiment IS NULL OR sentiment IN ('positive', 'negative', 'neutral')),
      UNIQUE(symbol, url)
    );

    CREATE TABLE IF NOT EXISTS ticker_presets (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      market TEXT NOT NULL CHECK (market IN ('US', 'JP', 'FX')),
      name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(symbol, market)
    );
  `);

  ensureFxMarketSupport(db);
  ensureHoldingsOrderSupport(db);
  ensureWatchlistLayoutSupport(db);
  ensureWatchlistNameSupport(db);
  ensureWatchlistSectorSupport(db);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_holdings_portfolio ON holdings(portfolio_id);
    CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON holdings(symbol);
    CREATE INDEX IF NOT EXISTS idx_holdings_sort_order ON holdings(sort_order);
    CREATE INDEX IF NOT EXISTS idx_transactions_portfolio ON transactions(portfolio_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_symbol ON transactions(symbol);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_trade_ideas_symbol ON trade_ideas(symbol);
    CREATE INDEX IF NOT EXISTS idx_trade_ideas_created_at ON trade_ideas(created_at);
    CREATE INDEX IF NOT EXISTS idx_watchlist_symbol ON watchlist_items(symbol);
    CREATE INDEX IF NOT EXISTS idx_watchlist_layout ON watchlist_items(list_key, sort_order);
    CREATE INDEX IF NOT EXISTS idx_watchlist_sector ON watchlist_items(sector);
    CREATE INDEX IF NOT EXISTS idx_watchlist_created_at ON watchlist_items(created_at);
    CREATE INDEX IF NOT EXISTS idx_stock_prices_updated_at ON stock_prices(updated_at);
    CREATE INDEX IF NOT EXISTS idx_news_items_published_at ON news_items(published_at);
    CREATE INDEX IF NOT EXISTS idx_news_items_symbol ON news_items(symbol);
    CREATE INDEX IF NOT EXISTS idx_ticker_presets_symbol ON ticker_presets(symbol);
    CREATE INDEX IF NOT EXISTS idx_ticker_presets_created_at ON ticker_presets(created_at);
  `);
}

function tableNeedsFxMigration(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `)
    .get(tableName) as { sql?: string } | undefined;

  const sql = (row?.sql || '').toUpperCase();
  if (!sql || !sql.includes('MARKET')) return false;
  return sql.includes("'US'") && sql.includes("'JP'") && !sql.includes("'FX'");
}

function ensureFxMarketSupport(db: Database.Database) {
  const needsHoldingsMigration = tableNeedsFxMigration(db, 'holdings');
  const needsTransactionsMigration = tableNeedsFxMigration(db, 'transactions');
  const needsTradeIdeasMigration = tableNeedsFxMigration(db, 'trade_ideas');

  if (!needsHoldingsMigration && !needsTransactionsMigration && !needsTradeIdeasMigration) {
    return;
  }

  const migrate = db.transaction(() => {
    if (needsHoldingsMigration) {
      db.exec(`
        CREATE TABLE holdings_new (
          id TEXT PRIMARY KEY,
          portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
          symbol TEXT NOT NULL,
          name TEXT,
          market TEXT NOT NULL CHECK (market IN ('US', 'JP', 'FX')),
          shares REAL NOT NULL CHECK (shares > 0),
          avg_cost REAL NOT NULL CHECK (avg_cost >= 0),
          sector TEXT,
          memo TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO holdings_new (id, portfolio_id, symbol, name, market, shares, avg_cost, sector, memo, created_at, updated_at)
        SELECT id, portfolio_id, symbol, name, market, shares, avg_cost, sector, memo, created_at, updated_at
        FROM holdings;
        DROP TABLE holdings;
        ALTER TABLE holdings_new RENAME TO holdings;
      `);
    }

    if (needsTransactionsMigration) {
      db.exec(`
        CREATE TABLE transactions_new (
          id TEXT PRIMARY KEY,
          portfolio_id TEXT NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
          symbol TEXT NOT NULL,
          market TEXT NOT NULL CHECK (market IN ('US', 'JP', 'FX')),
          type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'dividend')),
          shares REAL NOT NULL CHECK (shares >= 0),
          price REAL NOT NULL CHECK (price >= 0),
          total_amount REAL NOT NULL,
          fees REAL NOT NULL DEFAULT 0 CHECK (fees >= 0),
          transaction_date TEXT NOT NULL,
          memo TEXT,
          created_at TEXT NOT NULL
        );
        INSERT INTO transactions_new (id, portfolio_id, symbol, market, type, shares, price, total_amount, fees, transaction_date, memo, created_at)
        SELECT id, portfolio_id, symbol, market, type, shares, price, total_amount, fees, transaction_date, memo, created_at
        FROM transactions;
        DROP TABLE transactions;
        ALTER TABLE transactions_new RENAME TO transactions;
      `);
    }

    if (needsTradeIdeasMigration) {
      db.exec(`
        CREATE TABLE trade_ideas_new (
          id TEXT PRIMARY KEY,
          symbol TEXT NOT NULL,
          market TEXT NOT NULL CHECK (market IN ('US', 'JP', 'FX')),
          note TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO trade_ideas_new (id, symbol, market, note, created_at, updated_at)
        SELECT id, symbol, market, note, created_at, updated_at
        FROM trade_ideas;
        DROP TABLE trade_ideas;
        ALTER TABLE trade_ideas_new RENAME TO trade_ideas;
      `);
    }
  });
  migrate();
}

function ensureHoldingsOrderSupport(db: Database.Database) {
  const columns = db.prepare('PRAGMA table_info(holdings)').all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('sort_order')) {
    db.exec('ALTER TABLE holdings ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
    const rows = db
      .prepare('SELECT id FROM holdings ORDER BY created_at ASC')
      .all() as Array<{ id: string }>;
    const update = db.prepare('UPDATE holdings SET sort_order = ? WHERE id = ?');
    const tx = db.transaction(() => {
      rows.forEach((row, index) => update.run(index, row.id));
    });
    tx();
  }
}

function ensureWatchlistLayoutSupport(db: Database.Database) {
  const columns = db.prepare('PRAGMA table_info(watchlist_items)').all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('list_key')) {
    db.exec("ALTER TABLE watchlist_items ADD COLUMN list_key TEXT NOT NULL DEFAULT 'main'");
  }

  if (!columnNames.has('sort_order')) {
    db.exec('ALTER TABLE watchlist_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
    const rows = db
      .prepare('SELECT id FROM watchlist_items ORDER BY created_at DESC')
      .all() as Array<{ id: string }>;
    const update = db.prepare('UPDATE watchlist_items SET sort_order = ? WHERE id = ?');
    const tx = db.transaction(() => {
      rows.forEach((row, index) => update.run(index, row.id));
    });
    tx();
  }

  db.prepare(
    `
      UPDATE watchlist_items
      SET list_key = 'main'
      WHERE list_key IS NULL OR list_key NOT IN ('main', 'sub1', 'sub2', 'sub3', 'sub4')
    `
  ).run();
}

function ensureWatchlistNameSupport(db: Database.Database) {
  const columns = db.prepare('PRAGMA table_info(watchlist_items)').all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('name')) {
    db.exec('ALTER TABLE watchlist_items ADD COLUMN name TEXT');
  }

  db.prepare(`
    UPDATE watchlist_items
    SET name = COALESCE(
      (
        SELECT NULLIF(TRIM(ticker_presets.name), '')
        FROM ticker_presets
        WHERE ticker_presets.symbol = watchlist_items.symbol
          AND ticker_presets.market = watchlist_items.market
        LIMIT 1
      ),
      (
        SELECT NULLIF(TRIM(holdings.name), '')
        FROM holdings
        WHERE holdings.symbol = watchlist_items.symbol
          AND holdings.market = watchlist_items.market
        LIMIT 1
      )
    )
    WHERE market = 'JP' AND (name IS NULL OR TRIM(name) = '')
  `).run();
}

function ensureWatchlistSectorSupport(db: Database.Database) {
  const columns = db.prepare('PRAGMA table_info(watchlist_items)').all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('sector')) {
    db.exec('ALTER TABLE watchlist_items ADD COLUMN sector TEXT');
  }

  // 既存行のセクター表記を正規化し、未設定の米国株はマスタから自動補完する
  const rows = db
    .prepare('SELECT id, symbol, market, sector FROM watchlist_items')
    .all() as Array<{ id: string; symbol: string; market: string; sector: string | null }>;
  const update = db.prepare('UPDATE watchlist_items SET sector = ? WHERE id = ?');

  const tx = db.transaction(() => {
    for (const row of rows) {
      const current = row.sector?.trim() ?? '';
      const next = current
        ? normalizeSectorKey(current)
        : resolveSectorForSymbol(row.symbol, row.market);
      if (next !== current) update.run(next, row.id);
    }
  });
  tx();
}
