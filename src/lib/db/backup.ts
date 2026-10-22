import 'server-only';

import { Holding, Portfolio, TickerPreset, TradeIdea, Transaction, WatchlistItem, WatchlistKey } from '@/types';
import { mockPortfolios } from '@/lib/mock-data';
import { normalizeSectorKey, resolveHoldingSector, resolveSectorForSymbol } from '@/lib/sectors';
import { getDb } from './connection';
import { isValidMarket, isValidWatchlistKey } from './validators';
import { listPortfolios } from './portfolios';
import { listHoldings } from './holdings';
import { listTransactions } from './transactions';
import { listTradeIdeas } from './trade-ideas';
import { listWatchlistItems } from './watchlist';
import { listTickerPresets } from './ticker-presets';

type PortfolioBackup = Pick<Portfolio, 'id' | 'name' | 'broker' | 'description' | 'created_at' | 'updated_at'>;
type HoldingBackup = Pick<
  Holding,
  | 'id'
  | 'portfolio_id'
  | 'symbol'
  | 'name'
  | 'market'
  | 'shares'
  | 'avg_cost'
  | 'sort_order'
  | 'sector'
  | 'memo'
  | 'created_at'
  | 'updated_at'
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
  | 'id'
  | 'symbol'
  | 'name'
  | 'market'
  | 'list_key'
  | 'sort_order'
  | 'sector'
  | 'target_price'
  | 'memo'
  | 'created_at'
  | 'updated_at'
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
    .map((item, index) => ({
      id: item.id,
      portfolio_id: item.portfolio_id,
      symbol: item.symbol.toUpperCase().trim(),
      name: item.name ?? null,
      market: item.market,
      shares: Number(item.shares ?? 0),
      avg_cost: Number(item.avg_cost ?? 0),
      sort_order: Number.isInteger(item.sort_order) && item.sort_order >= 0 ? item.sort_order : index,
      sector: resolveHoldingSector(item.symbol, item.market, item.sector),
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
        name: string | null;
        market: Holding['market'];
        list_key: WatchlistKey;
        sort_order: number;
        sector: string | null;
        target_price: number | null;
        memo: string | null;
        created_at: string;
        updated_at: string;
      }
    >();

    for (const [index, item] of (data.watchlistItems ?? []).entries()) {
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
        name: item.name?.trim() || null,
        market: item.market,
        list_key: item.list_key && isValidWatchlistKey(item.list_key) ? item.list_key : 'main',
        sort_order: Number.isInteger(item.sort_order) && item.sort_order >= 0 ? item.sort_order : index,
        sector: item.sector
          ? normalizeSectorKey(item.sector)
          : resolveSectorForSymbol(normalizedSymbol, item.market),
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
    INSERT INTO holdings (id, portfolio_id, symbol, name, market, shares, avg_cost, sort_order, sector, memo, created_at, updated_at)
    VALUES (@id, @portfolio_id, @symbol, @name, @market, @shares, @avg_cost, @sort_order, @sector, @memo, @created_at, @updated_at)
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
    INSERT INTO watchlist_items (id, symbol, name, market, list_key, sort_order, sector, target_price, memo, created_at, updated_at)
    VALUES (@id, @symbol, @name, @market, @list_key, @sort_order, @sector, @target_price, @memo, @created_at, @updated_at)
  `);
  const insertTickerPreset = db.prepare(`
    INSERT INTO ticker_presets (id, symbol, market, name, created_at, updated_at)
    VALUES (@id, @symbol, @market, @name, @created_at, @updated_at)
  `);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM news_items').run();
    db.prepare('DELETE FROM stock_prices').run();
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
    db.prepare('DELETE FROM news_items').run();
    db.prepare('DELETE FROM stock_prices').run();
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
