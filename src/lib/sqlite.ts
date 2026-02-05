import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { mockHoldings, mockPortfolios, mockTransactions } from '@/lib/mock-data';
import { Holding, Portfolio, TickerPreset, TradeIdea, Transaction, TransactionType, WatchlistItem } from '@/types';

type PortfolioBackup = Pick<Portfolio, 'id' | 'name' | 'broker' | 'description' | 'created_at' | 'updated_at'>;
type HoldingBackup = Pick<
  Holding,
  'id' | 'portfolio_id' | 'symbol' | 'name' | 'market' | 'shares' | 'avg_cost' | 'sector' | 'memo' | 'created_at' | 'updated_at'
>;
type TransactionBackup = Pick<
  Transaction,
  | 'id'
  | 'portfolio_id'
  | 'symbol'
  | 'market'
  | 'type'
  | 'shares'
  | 'price'
  | 'total_amount'
  | 'fees'
  | 'transaction_date'
  | 'memo'
  | 'created_at'
>;
type TradeIdeaBackup = Pick<TradeIdea, 'id' | 'symbol' | 'market' | 'note' | 'created_at' | 'updated_at'>;
type WatchlistItemBackup = Pick<
  WatchlistItem,
  'id' | 'symbol' | 'market' | 'target_price' | 'memo' | 'created_at' | 'updated_at'
>;
type TickerPresetBackup = Pick<TickerPreset, 'id' | 'symbol' | 'market' | 'name' | 'created_at' | 'updated_at'>;

export interface BackupData {
  portfolios: PortfolioBackup[];
  holdings: HoldingBackup[];
  transactions: TransactionBackup[];
  tradeIdeas: TradeIdeaBackup[];
  watchlistItems: WatchlistItemBackup[];
  tickerPresets: TickerPresetBackup[];
}

const configuredDbPath = process.env.SQLITE_DB_PATH?.trim();
const defaultDbPath = path.join(process.cwd(), 'data', 'portfolio.db');
const DB_PATH = configuredDbPath ? path.resolve(process.cwd(), configuredDbPath) : defaultDbPath;
const DATA_DIR = path.dirname(DB_PATH);
const MARKET_VALUES = ['US', 'JP', 'FX'] as const;

type GlobalWithDb = typeof globalThis & {
  __portfolioDb?: Database.Database;
  __portfolioDbInitialized?: boolean;
};

const globalWithDb = globalThis as GlobalWithDb;

const isValidMarket = (market: string): market is Holding['market'] =>
  MARKET_VALUES.includes(market as (typeof MARKET_VALUES)[number]);

function getDb(): Database.Database {
  if (!globalWithDb.__portfolioDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    globalWithDb.__portfolioDb = new Database(DB_PATH);
  }
  if (!globalWithDb.__portfolioDbInitialized) {
    initialize(globalWithDb.__portfolioDb);
    globalWithDb.__portfolioDbInitialized = true;
  }
  return globalWithDb.__portfolioDb;
}

function initialize(db: Database.Database) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

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
      market TEXT NOT NULL CHECK (market IN ('US', 'JP', 'FX')),
      target_price REAL CHECK (target_price IS NULL OR target_price > 0),
      memo TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(symbol, market)
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

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_holdings_portfolio ON holdings(portfolio_id);
    CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON holdings(symbol);
    CREATE INDEX IF NOT EXISTS idx_transactions_portfolio ON transactions(portfolio_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_symbol ON transactions(symbol);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_trade_ideas_symbol ON trade_ideas(symbol);
    CREATE INDEX IF NOT EXISTS idx_trade_ideas_created_at ON trade_ideas(created_at);
    CREATE INDEX IF NOT EXISTS idx_watchlist_symbol ON watchlist_items(symbol);
    CREATE INDEX IF NOT EXISTS idx_watchlist_created_at ON watchlist_items(created_at);
    CREATE INDEX IF NOT EXISTS idx_ticker_presets_symbol ON ticker_presets(symbol);
    CREATE INDEX IF NOT EXISTS idx_ticker_presets_created_at ON ticker_presets(created_at);
  `);

  seedIfEmpty(db);
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

  db.pragma('foreign_keys = OFF');
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
  db.pragma('foreign_keys = ON');
}

function seedIfEmpty(db: Database.Database) {
  const portfolioCount = db.prepare('SELECT COUNT(*) as count FROM portfolios').get() as { count: number };
  if (portfolioCount.count > 0) return;

  const insertPortfolio = db.prepare(`
    INSERT INTO portfolios (id, name, broker, description, created_at, updated_at)
    VALUES (@id, @name, @broker, @description, @created_at, @updated_at)
  `);
  const insertHolding = db.prepare(`
    INSERT INTO holdings (id, portfolio_id, symbol, name, market, shares, avg_cost, sector, memo, created_at, updated_at)
    VALUES (@id, @portfolio_id, @symbol, @name, @market, @shares, @avg_cost, @sector, @memo, @created_at, @updated_at)
  `);
  const insertTransaction = db.prepare(`
    INSERT INTO transactions (id, portfolio_id, symbol, market, type, shares, price, total_amount, fees, transaction_date, memo, created_at)
    VALUES (@id, @portfolio_id, @symbol, @market, @type, @shares, @price, @total_amount, @fees, @transaction_date, @memo, @created_at)
  `);

  const tx = db.transaction(() => {
    for (const portfolio of mockPortfolios) {
      insertPortfolio.run({
        ...portfolio,
        broker: portfolio.broker ?? '',
        description: portfolio.description ?? null,
      });
    }
    for (const holding of mockHoldings) {
      insertHolding.run({
        ...holding,
        symbol: holding.symbol.toUpperCase().trim(),
        name: holding.name ?? null,
        sector: holding.sector ?? null,
        memo: holding.memo ?? null,
      });
    }
    for (const transaction of mockTransactions) {
      insertTransaction.run({
        ...transaction,
        symbol: transaction.symbol.toUpperCase().trim(),
        memo: transaction.memo ?? null,
      });
    }
  });

  tx();
}

export function listPortfolios(): Portfolio[] {
  const db = getDb();
  return db.prepare('SELECT * FROM portfolios ORDER BY created_at ASC').all() as Portfolio[];
}

export function listHoldings(): Holding[] {
  const db = getDb();
  return db.prepare('SELECT * FROM holdings ORDER BY created_at ASC').all() as Holding[];
}

export function listTransactions(): Transaction[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT *
      FROM transactions
      ORDER BY transaction_date DESC, created_at DESC
    `)
    .all() as Transaction[];
}

export function listTradeIdeas(): TradeIdea[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT *
      FROM trade_ideas
      ORDER BY created_at DESC
    `)
    .all() as TradeIdea[];
}

export function listWatchlistItems(): WatchlistItem[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT *
      FROM watchlist_items
      ORDER BY created_at DESC
    `)
    .all() as WatchlistItem[];
}

export function listTickerPresets(): TickerPreset[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT *
      FROM ticker_presets
      ORDER BY symbol ASC, market ASC
    `)
    .all() as TickerPreset[];
}

type NewHoldingInput = Omit<Holding, 'id' | 'created_at' | 'updated_at' | 'name'> & {
  name?: string;
};

export function createHolding(input: NewHoldingInput): Holding {
  const db = getDb();
  const now = new Date().toISOString();
  const holding: Holding = {
    id: crypto.randomUUID(),
    portfolio_id: input.portfolio_id,
    symbol: input.symbol.toUpperCase().trim(),
    name: input.name?.trim() || undefined,
    market: input.market,
    shares: input.shares,
    avg_cost: input.avg_cost,
    sector: input.sector?.trim() || undefined,
    memo: input.memo?.trim() || undefined,
    created_at: now,
    updated_at: now,
  };

  db.prepare(`
    INSERT INTO holdings (id, portfolio_id, symbol, name, market, shares, avg_cost, sector, memo, created_at, updated_at)
    VALUES (@id, @portfolio_id, @symbol, @name, @market, @shares, @avg_cost, @sector, @memo, @created_at, @updated_at)
  `).run({
    ...holding,
    name: holding.name ?? null,
    sector: holding.sector ?? null,
    memo: holding.memo ?? null,
  });

  return holding;
}

type UpdateHoldingInput = Partial<Pick<Holding, 'name' | 'shares' | 'avg_cost' | 'sector' | 'memo'>>;

export function updateHoldingById(id: string, updates: UpdateHoldingInput): Holding | null {
  const db = getDb();
  const current = db.prepare('SELECT * FROM holdings WHERE id = ?').get(id) as Holding | undefined;
  if (!current) return null;

  const now = new Date().toISOString();
  const next: Holding = {
    ...current,
    ...updates,
    name: updates.name !== undefined ? updates.name : current.name,
    shares: updates.shares !== undefined ? updates.shares : current.shares,
    avg_cost: updates.avg_cost !== undefined ? updates.avg_cost : current.avg_cost,
    sector: updates.sector !== undefined ? updates.sector : current.sector,
    memo: updates.memo !== undefined ? updates.memo : current.memo,
    updated_at: now,
  };

  db.prepare(`
    UPDATE holdings
    SET
      name = @name,
      shares = @shares,
      avg_cost = @avg_cost,
      sector = @sector,
      memo = @memo,
      updated_at = @updated_at
    WHERE id = @id
  `).run({
    id: next.id,
    name: next.name ?? null,
    shares: next.shares,
    avg_cost: next.avg_cost,
    sector: next.sector ?? null,
    memo: next.memo ?? null,
    updated_at: next.updated_at,
  });

  return next;
}

export function deleteHoldingById(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM holdings WHERE id = ?').run(id);
  return result.changes > 0;
}

type NewTransactionInput = {
  portfolio_id: string;
  symbol: string;
  market: Holding['market'];
  type: TransactionType;
  shares: number;
  price: number;
  fees?: number;
  transaction_date: string;
  memo?: string;
};

export function createTransaction(input: NewTransactionInput): Transaction {
  const db = getDb();
  const now = new Date().toISOString();
  const totalAmount = Number((input.shares * input.price).toFixed(4));
  const transaction: Transaction = {
    id: crypto.randomUUID(),
    portfolio_id: input.portfolio_id,
    symbol: input.symbol.toUpperCase().trim(),
    market: input.market,
    type: input.type,
    shares: input.shares,
    price: input.price,
    total_amount: totalAmount,
    fees: input.fees ?? 0,
    transaction_date: input.transaction_date,
    memo: input.memo?.trim() || undefined,
    created_at: now,
  };

  db.prepare(`
    INSERT INTO transactions (id, portfolio_id, symbol, market, type, shares, price, total_amount, fees, transaction_date, memo, created_at)
    VALUES (@id, @portfolio_id, @symbol, @market, @type, @shares, @price, @total_amount, @fees, @transaction_date, @memo, @created_at)
  `).run({
    ...transaction,
    memo: transaction.memo ?? null,
  });

  return transaction;
}

type NewTradeIdeaInput = {
  symbol: string;
  market: Holding['market'];
  note: string;
};

export function createTradeIdea(input: NewTradeIdeaInput): TradeIdea {
  const db = getDb();
  const now = new Date().toISOString();
  const idea: TradeIdea = {
    id: crypto.randomUUID(),
    symbol: input.symbol.toUpperCase().trim(),
    market: input.market,
    note: input.note.trim(),
    created_at: now,
    updated_at: now,
  };

  db.prepare(`
    INSERT INTO trade_ideas (id, symbol, market, note, created_at, updated_at)
    VALUES (@id, @symbol, @market, @note, @created_at, @updated_at)
  `).run(idea);

  return idea;
}

type NewWatchlistItemInput = {
  symbol: string;
  market: Holding['market'];
  target_price?: number;
  memo?: string;
};

export function createWatchlistItem(input: NewWatchlistItemInput): WatchlistItem {
  const db = getDb();
  const now = new Date().toISOString();
  const item: WatchlistItem = {
    id: crypto.randomUUID(),
    symbol: input.symbol.toUpperCase().trim(),
    market: input.market,
    target_price: input.target_price,
    memo: input.memo?.trim() || undefined,
    created_at: now,
    updated_at: now,
  };

  db.prepare(`
    INSERT INTO watchlist_items (id, symbol, market, target_price, memo, created_at, updated_at)
    VALUES (@id, @symbol, @market, @target_price, @memo, @created_at, @updated_at)
  `).run({
    ...item,
    target_price: item.target_price ?? null,
    memo: item.memo ?? null,
  });

  return item;
}

type NewTickerPresetInput = {
  symbol: string;
  market: Holding['market'];
  name?: string;
};

export function createTickerPreset(input: NewTickerPresetInput): TickerPreset {
  const db = getDb();
  const now = new Date().toISOString();
  const preset: TickerPreset = {
    id: crypto.randomUUID(),
    symbol: input.symbol.toUpperCase().trim(),
    market: input.market,
    name: input.name?.trim() || undefined,
    created_at: now,
    updated_at: now,
  };

  db.prepare(`
    INSERT INTO ticker_presets (id, symbol, market, name, created_at, updated_at)
    VALUES (@id, @symbol, @market, @name, @created_at, @updated_at)
  `).run({
    ...preset,
    name: preset.name ?? null,
  });

  return preset;
}

export function deleteTickerPresetById(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM ticker_presets WHERE id = ?').run(id);
  return result.changes > 0;
}

type UpdateWatchlistItemInput = {
  target_price?: number | null;
  memo?: string | null;
};

export function updateWatchlistItemById(id: string, updates: UpdateWatchlistItemInput): WatchlistItem | null {
  const db = getDb();
  const current = db.prepare('SELECT * FROM watchlist_items WHERE id = ?').get(id) as WatchlistItem | undefined;
  if (!current) return null;

  const now = new Date().toISOString();
  const next: WatchlistItem = {
    ...current,
    target_price: updates.target_price !== undefined ? updates.target_price ?? undefined : current.target_price,
    memo: updates.memo !== undefined ? updates.memo ?? undefined : current.memo,
    updated_at: now,
  };

  db.prepare(`
    UPDATE watchlist_items
    SET
      target_price = @target_price,
      memo = @memo,
      updated_at = @updated_at
    WHERE id = @id
  `).run({
    id: next.id,
    target_price: next.target_price ?? null,
    memo: next.memo ?? null,
    updated_at: next.updated_at,
  });

  return next;
}

export function deleteWatchlistItemById(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM watchlist_items WHERE id = ?').run(id);
  return result.changes > 0;
}

export function exportBackupData(): BackupData {
  return {
    portfolios: listPortfolios(),
    holdings: listHoldings(),
    transactions: listTransactions(),
    tradeIdeas: listTradeIdeas(),
    watchlistItems: listWatchlistItems(),
    tickerPresets: listTickerPresets(),
  };
}

export function importBackupData(data: Partial<BackupData>) {
  const db = getDb();

  const portfolios = (data.portfolios ?? [])
    .filter((item): item is PortfolioBackup => Boolean(item?.id && item?.name))
    .map((item) => ({
      id: item.id,
      name: item.name,
      broker: item.broker ?? '',
      description: item.description ?? null,
      created_at: item.created_at ?? new Date().toISOString(),
      updated_at: item.updated_at ?? new Date().toISOString(),
    }));

  const portfolioIds = new Set(portfolios.map((p) => p.id));

  const holdings = (data.holdings ?? [])
    .filter((item): item is HoldingBackup => Boolean(item?.id && item?.portfolio_id && item?.symbol && item?.market))
    .filter((item) => portfolioIds.has(item.portfolio_id))
    .map((item) => ({
      id: item.id,
      portfolio_id: item.portfolio_id,
      symbol: item.symbol.toUpperCase().trim(),
      name: item.name ?? null,
      market: item.market,
      shares: Number(item.shares ?? 0),
      avg_cost: Number(item.avg_cost ?? 0),
      sector: item.sector ?? null,
      memo: item.memo ?? null,
      created_at: item.created_at ?? new Date().toISOString(),
      updated_at: item.updated_at ?? new Date().toISOString(),
    }))
    .filter((item) => item.shares > 0 && item.avg_cost >= 0 && isValidMarket(item.market));

  const transactions = (data.transactions ?? [])
    .filter(
      (item): item is TransactionBackup =>
        Boolean(
          item?.id &&
            item?.portfolio_id &&
            item?.symbol &&
            item?.market &&
            item?.type &&
            item?.transaction_date
        )
    )
    .filter((item) => portfolioIds.has(item.portfolio_id))
    .map((item) => ({
      id: item.id,
      portfolio_id: item.portfolio_id,
      symbol: item.symbol.toUpperCase().trim(),
      market: item.market,
      type: item.type,
      shares: Number(item.shares ?? 0),
      price: Number(item.price ?? 0),
      total_amount: Number(item.total_amount ?? Number(item.shares ?? 0) * Number(item.price ?? 0)),
      fees: Number(item.fees ?? 0),
      transaction_date: item.transaction_date,
      memo: item.memo ?? null,
      created_at: item.created_at ?? new Date().toISOString(),
    }))
    .filter(
      (item) =>
        isValidMarket(item.market) &&
        (item.type === 'buy' || item.type === 'sell' || item.type === 'dividend') &&
        item.shares >= 0 &&
        item.price >= 0 &&
        item.fees >= 0
    );

  const tradeIdeas = (data.tradeIdeas ?? [])
    .filter(
      (item): item is TradeIdeaBackup =>
        Boolean(item?.id && item?.symbol && item?.market && item?.note)
    )
    .map((item) => ({
      id: item.id,
      symbol: item.symbol.toUpperCase().trim(),
      market: item.market,
      note: item.note,
      created_at: item.created_at ?? new Date().toISOString(),
      updated_at: item.updated_at ?? new Date().toISOString(),
    }))
    .filter((item) => isValidMarket(item.market) && item.note.trim() !== '');

  const watchlistItems = (() => {
    const uniqueBySymbolAndMarket = new Map<
      string,
      {
        id: string;
        symbol: string;
        market: Holding['market'];
        target_price: number | null;
        memo: string | null;
        created_at: string;
        updated_at: string;
      }
    >();

    for (const item of data.watchlistItems ?? []) {
      if (!item?.id || !item.symbol || !item.market || !isValidMarket(item.market)) continue;
      const targetPrice =
        item.target_price === null || item.target_price === undefined
          ? null
          : Number(item.target_price);
      if (targetPrice !== null && (!Number.isFinite(targetPrice) || targetPrice <= 0)) continue;

      const normalizedSymbol = item.symbol.toUpperCase().trim();
      const key = `${normalizedSymbol}|${item.market}`;
      if (uniqueBySymbolAndMarket.has(key)) continue;

      uniqueBySymbolAndMarket.set(key, {
        id: item.id,
        symbol: normalizedSymbol,
        market: item.market,
        target_price: targetPrice,
        memo: item.memo ?? null,
        created_at: item.created_at ?? new Date().toISOString(),
        updated_at: item.updated_at ?? new Date().toISOString(),
      });
    }

    return Array.from(uniqueBySymbolAndMarket.values());
  })();

  const tickerPresets = (() => {
    const uniqueBySymbolAndMarket = new Map<
      string,
      {
        id: string;
        symbol: string;
        market: Holding['market'];
        name: string | null;
        created_at: string;
        updated_at: string;
      }
    >();

    for (const item of data.tickerPresets ?? []) {
      if (!item?.id || !item.symbol || !item.market || !isValidMarket(item.market)) continue;
      const normalizedSymbol = item.symbol.toUpperCase().trim();
      const key = `${normalizedSymbol}|${item.market}`;
      if (uniqueBySymbolAndMarket.has(key)) continue;

      uniqueBySymbolAndMarket.set(key, {
        id: item.id,
        symbol: normalizedSymbol,
        market: item.market,
        name: item.name?.trim() || null,
        created_at: item.created_at ?? new Date().toISOString(),
        updated_at: item.updated_at ?? new Date().toISOString(),
      });
    }

    return Array.from(uniqueBySymbolAndMarket.values());
  })();

  const insertPortfolio = db.prepare(`
    INSERT INTO portfolios (id, name, broker, description, created_at, updated_at)
    VALUES (@id, @name, @broker, @description, @created_at, @updated_at)
  `);
  const insertHolding = db.prepare(`
    INSERT INTO holdings (id, portfolio_id, symbol, name, market, shares, avg_cost, sector, memo, created_at, updated_at)
    VALUES (@id, @portfolio_id, @symbol, @name, @market, @shares, @avg_cost, @sector, @memo, @created_at, @updated_at)
  `);
  const insertTransaction = db.prepare(`
    INSERT INTO transactions (id, portfolio_id, symbol, market, type, shares, price, total_amount, fees, transaction_date, memo, created_at)
    VALUES (@id, @portfolio_id, @symbol, @market, @type, @shares, @price, @total_amount, @fees, @transaction_date, @memo, @created_at)
  `);
  const insertTradeIdea = db.prepare(`
    INSERT INTO trade_ideas (id, symbol, market, note, created_at, updated_at)
    VALUES (@id, @symbol, @market, @note, @created_at, @updated_at)
  `);
  const insertWatchlistItem = db.prepare(`
    INSERT INTO watchlist_items (id, symbol, market, target_price, memo, created_at, updated_at)
    VALUES (@id, @symbol, @market, @target_price, @memo, @created_at, @updated_at)
  `);
  const insertTickerPreset = db.prepare(`
    INSERT INTO ticker_presets (id, symbol, market, name, created_at, updated_at)
    VALUES (@id, @symbol, @market, @name, @created_at, @updated_at)
  `);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM watchlist_items').run();
    db.prepare('DELETE FROM ticker_presets').run();
    db.prepare('DELETE FROM trade_ideas').run();
    db.prepare('DELETE FROM transactions').run();
    db.prepare('DELETE FROM holdings').run();
    db.prepare('DELETE FROM portfolios').run();

    if (portfolios.length === 0) {
      for (const portfolio of mockPortfolios) {
        insertPortfolio.run({
          ...portfolio,
          broker: portfolio.broker ?? '',
          description: portfolio.description ?? null,
        });
      }
      return;
    }

    for (const portfolio of portfolios) {
      insertPortfolio.run(portfolio);
    }
    for (const holding of holdings) {
      insertHolding.run(holding);
    }
    for (const transaction of transactions) {
      insertTransaction.run(transaction);
    }
    for (const idea of tradeIdeas) {
      insertTradeIdea.run(idea);
    }
    for (const item of watchlistItems) {
      insertWatchlistItem.run(item);
    }
    for (const preset of tickerPresets) {
      insertTickerPreset.run(preset);
    }
  });

  tx();
}

export function clearAllData() {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM watchlist_items').run();
    db.prepare('DELETE FROM ticker_presets').run();
    db.prepare('DELETE FROM trade_ideas').run();
    db.prepare('DELETE FROM transactions').run();
    db.prepare('DELETE FROM holdings').run();
    db.prepare('DELETE FROM portfolios').run();
    for (const portfolio of mockPortfolios) {
      db.prepare(`
        INSERT INTO portfolios (id, name, broker, description, created_at, updated_at)
        VALUES (@id, @name, @broker, @description, @created_at, @updated_at)
      `).run({
        ...portfolio,
        broker: portfolio.broker ?? '',
        description: portfolio.description ?? null,
      });
    }
  });
  tx();
}
