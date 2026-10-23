import 'server-only';

import { Holding, MemoSymbolRow, Portfolio, PortfolioSnapshot, StockMemo, TickerPreset, TopPick, TradeIdea, Transaction, WatchlistItem, WatchlistKey } from '@/types';
import { mockPortfolios } from '@/lib/mock-data';
import { normalizeSectorKey, resolveHoldingSector, resolveSectorForSymbol } from '@/lib/sectors';
import { getDb } from './connection';
import { getDeviceId } from './device';
import { SYNC_TABLES } from './sync-tables';
import { isValidMarket, isValidWatchlistKey } from './validators';
import { listPortfolios } from './portfolios';
import { listHoldings } from './holdings';
import { listTransactions } from './transactions';
import { listTradeIdeas } from './trade-ideas';
import { listWatchlistItems } from './watchlist';
import { listTickerPresets } from './ticker-presets';
import { validateTopPickInput } from './top-picks';
import { snapshotId, validSnapshot } from '@/components/history/model';

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
  | 'ledger_opening_shares'
  | 'ledger_opening_cost'
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
  | 'realized_pl'
  | 'fx_rate'
  | 'holding_id'
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
type MemoBackup = Omit<StockMemo, 'symbols' | 'updated_pc' | 'deleted_at' | 'updated_by' | 'price_snapshot'> & { price_snapshot: string | null };
type SymbolBackup = Omit<MemoSymbolRow, 'deleted_at' | 'updated_by'>;

export interface BackupData {
  portfolios: PortfolioBackup[];
  holdings: HoldingBackup[];
  transactions: TransactionBackup[];
  tradeIdeas: TradeIdeaBackup[];
  watchlistItems: WatchlistItemBackup[];
  tickerPresets: TickerPresetBackup[];
}

export interface MemoBackupData extends BackupData {
  stockMemos?: MemoBackup[];
  memoSymbols?: SymbolBackup[];
  topPicks?: Omit<TopPick, 'deleted_at' | 'updated_by'>[];
  portfolioSnapshots?: Omit<PortfolioSnapshot, 'deleted_at' | 'updated_by'>[];
}

function backupRow<T extends { deleted_at?: string | null; updated_by?: string | null }>(row: T) {
  const copy = { ...row };
  delete copy.deleted_at;
  delete copy.updated_by;
  return copy;
}

export function exportBackupData(): MemoBackupData {
  const db = getDb();
  const snapshots = db.prepare('SELECT * FROM portfolio_snapshots WHERE deleted_at IS NULL ORDER BY snapshot_date, id').all() as PortfolioSnapshot[];
  const topPicks = db.prepare('SELECT * FROM top_picks WHERE deleted_at IS NULL ORDER BY rank, updated_at, id').all() as TopPick[];
  const stockMemos = db.prepare('SELECT * FROM stock_memos WHERE deleted_at IS NULL ORDER BY created_at, id').all() as Array<MemoBackup & { deleted_at?: string | null; updated_by?: string | null }>;
  const memoSymbols = db.prepare(`SELECT s.* FROM memo_symbols s JOIN stock_memos m ON m.id = s.memo_id
    WHERE s.deleted_at IS NULL AND m.deleted_at IS NULL ORDER BY s.created_at, s.id`).all() as Array<SymbolBackup & { deleted_at?: string | null; updated_by?: string | null }>;
  return {
    portfolios: listPortfolios().map(backupRow),
    holdings: listHoldings().map((row) => backupRow({ ...row,
      ledger_opening_shares: row.ledger_opening_shares ?? null,
      ledger_opening_cost: row.ledger_opening_cost ?? null,
    })),
    transactions: listTransactions().map((row) => backupRow({ ...row,
      realized_pl: row.realized_pl ?? null, fx_rate: row.fx_rate ?? null, holding_id: row.holding_id ?? null,
    })),
    tradeIdeas: listTradeIdeas().map(backupRow),
    watchlistItems: listWatchlistItems().map(backupRow),
    tickerPresets: listTickerPresets().map(backupRow),
    ...(stockMemos.length ? { stockMemos: stockMemos.map(backupRow), memoSymbols: memoSymbols.map(backupRow) } : {}),
    ...(topPicks.length ? { topPicks: topPicks.map(backupRow) } : {}),
    ...(snapshots.length ? { portfolioSnapshots: snapshots.map(backupRow) } : {}),
  };
}

function nullableLedgerNumber(value: unknown, column: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`バックアップの${column}は有限数またはnullで指定してください`);
  }
  return value;
}

export function importBackupData(data: Partial<MemoBackupData>) {
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
      ledger_opening_shares: nullableLedgerNumber(item.ledger_opening_shares, 'ledger_opening_shares'),
      ledger_opening_cost: nullableLedgerNumber(item.ledger_opening_cost, 'ledger_opening_cost'),
      sort_order: Number.isInteger(item.sort_order) && item.sort_order >= 0 ? item.sort_order : index,
      sector: resolveHoldingSector(item.symbol, item.market, item.sector),
      memo: item.memo ?? null,
      created_at: item.created_at ?? new Date().toISOString(),
      updated_at: item.updated_at ?? new Date().toISOString(),
    }))
    .filter((item) => item.shares > 0 && item.avg_cost >= 0 && isValidMarket(item.market));

  const holdingIds = new Set(holdings.map((item) => item.id));
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
    .map((item) => {
      if (item.holding_id != null && typeof item.holding_id !== 'string') {
        throw new Error('バックアップのholding_idは文字列またはnullで指定してください');
      }
      return {
        id: item.id,
        portfolio_id: item.portfolio_id,
        symbol: item.symbol.toUpperCase().trim(),
        market: item.market,
        type: item.type,
        shares: Number(item.shares ?? 0),
        price: Number(item.price ?? 0),
        total_amount: Number(item.total_amount ?? Number(item.shares ?? 0) * Number(item.price ?? 0)),
        fees: Number(item.fees ?? 0),
        realized_pl: nullableLedgerNumber(item.realized_pl, 'realized_pl'),
        fx_rate: nullableLedgerNumber(item.fx_rate, 'fx_rate'),
        // 取込で復活する保有だけを参照し、既存の論理削除行には紐づけない
        holding_id: item.holding_id != null && holdingIds.has(item.holding_id) ? item.holding_id : null,
        transaction_date: item.transaction_date,
        memo: item.memo ?? null,
        created_at: item.created_at ?? new Date().toISOString(),
      };
    })
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

  const stockMemos = (data.stockMemos ?? []).map((item) => {
    if (!item?.id || typeof item.title !== 'string' || !item.title.trim() || typeof item.body !== 'string'
      || (item.tag != null && !['earnings', 'idea', 'trade', 'news', 'review'].includes(item.tag))) {
      throw new Error('メモのバックアップが不正です');
    }
    const snapshot: unknown = JSON.parse(item.price_snapshot || '{}');
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
      || Object.values(snapshot).some((quote) => !quote || typeof quote.price !== 'number'
        || !Number.isFinite(quote.price) || typeof quote.currency !== 'string' || !Number.isFinite(Date.parse(quote.at)))) {
      throw new Error('メモの株価記録が不正です');
    }
    return { id: item.id, title: item.title, body: item.body, tag: item.tag ?? null,
      price_snapshot: JSON.stringify(snapshot), transaction_id: item.transaction_id ?? null,
      created_at: item.created_at ?? new Date().toISOString() };
  });
  const memoIds = new Set(stockMemos.map((item) => item.id));
  const symbolKeys = new Set<string>();
  const memoSymbols = (data.memoSymbols ?? []).map((item) => {
    if (!item?.id || !memoIds.has(item.memo_id) || !isValidMarket(item.market) || typeof item.symbol !== 'string' || !item.symbol.trim()) {
      throw new Error('メモの銘柄紐づけが不正です');
    }
    const symbol = item.symbol.toUpperCase().trim();
    const key = `${item.memo_id}|${symbol}|${item.market}`;
    if (symbolKeys.has(key)) throw new Error('メモの銘柄紐づけが重複しています');
    symbolKeys.add(key);
    return { id: item.id, memo_id: item.memo_id, symbol, market: item.market,
      created_at: item.created_at ?? new Date().toISOString() };
  });

  const topPicks = (data.topPicks ?? []).map((item) => {
    if (!item?.id || !Number.isInteger(item.rank) || item.rank < 1) throw new Error('ピックのバックアップが不正です');
    validateTopPickInput({ symbol: item.symbol, market: item.market, theme: item.theme, conviction: item.conviction,
      horizon: item.horizon, pickedAt: item.picked_at, pickedPrice: item.picked_price, targetPrice: item.target_price,
      reviewOn: item.review_on, thesis: item.thesis, catalysts: item.catalysts, risks: item.risks, exitRule: item.exit_rule });
    if (!Number.isFinite(Date.parse(item.created_at)) || (item.removed_at != null && !Number.isFinite(Date.parse(item.removed_at)))
      || [item.benchmark_at_pick, item.benchmark_at_remove, item.removed_price].some((price) => price != null && (!Number.isFinite(price) || price <= 0))
      || (item.removed_at != null && item.removed_price == null)) throw new Error('ピックの価格・日時が不正です');
    return { id: item.id, symbol: item.symbol.trim().toUpperCase(), market: item.market, rank: item.rank,
      theme: item.theme ?? null, conviction: item.conviction ?? null, horizon: item.horizon ?? null,
      picked_at: item.picked_at, picked_price: item.picked_price, benchmark_at_pick: item.benchmark_at_pick ?? null,
      target_price: item.target_price ?? null, review_on: item.review_on ?? null, thesis: item.thesis ?? null,
      catalysts: item.catalysts ?? null, risks: item.risks ?? null, exit_rule: item.exit_rule ?? null,
      removed_at: item.removed_at ?? null, removed_price: item.removed_price ?? null,
      benchmark_at_remove: item.benchmark_at_remove ?? null, created_at: item.created_at };
  });
  if (topPicks.filter((pick) => pick.removed_at === null).length > 10) throw new Error('現在のピックは最大10件です');

  const snapshots = (data.portfolioSnapshots ?? []).map((item) => {
    if (!item || !validSnapshot(item) || item.id !== snapshotId(item.snapshot_date, item.portfolio_id)
      || !Number.isFinite(Date.parse(item.created_at))) throw new Error('資産記録のバックアップが不正です。');
    return { id: item.id, snapshot_date: item.snapshot_date, portfolio_id: item.portfolio_id,
      market_value_jpy: item.market_value_jpy, cost_basis_jpy: item.cost_basis_jpy,
      cash_jpy: item.cash_jpy, usd_jpy: item.usd_jpy, is_estimate: item.is_estimate, created_at: item.created_at };
  });

  // 取込前にID重複を検出し、従来どおり全体を失敗させる
  const groups = [portfolios, holdings, transactions, tradeIdeas, watchlistItems, tickerPresets, stockMemos, memoSymbols, topPicks, snapshots];
  for (const rows of groups) {
    if (new Set(rows.map((row) => row.id)).size !== rows.length) {
      throw new Error('バックアップ内のIDが重複しています');
    }
  }

  const tx = db.transaction(() => {
    const now = new Date().toISOString();
    const updatedBy = getDeviceId();
    markAllDeleted(now, updatedBy);
    const portfolioRows = portfolios.length ? portfolios : mockPortfolios.map((portfolio) => ({
      ...portfolio,
      broker: portfolio.broker ?? '',
      description: portfolio.description ?? null,
    }));
    const entries = [
      ['portfolios', portfolioRows],
      ['holdings', holdings],
      ['transactions', transactions],
      ['trade_ideas', tradeIdeas],
      ['watchlist_items', watchlistItems],
      ['ticker_presets', tickerPresets],
      ['stock_memos', stockMemos],
      ['memo_symbols', memoSymbols],
      ['top_picks', topPicks],
      ['portfolio_snapshots', snapshots],
    ] as const;
    for (const [table, rows] of entries) {
      for (const row of rows) {
        const restored = {
          ...row, updated_at: now, updated_by: updatedBy, deleted_at: null,
        };
        // 銘柄の一意制約があるテーブルは、既存のIDを維持して復活させる
        if (table === 'watchlist_items' || table === 'ticker_presets') {
          const symbolRow = row as WatchlistItemBackup | TickerPresetBackup;
          const existing = db.prepare(`SELECT id FROM ${table} WHERE symbol = ? AND market = ?`)
            .get(symbolRow.symbol, symbolRow.market) as { id: string } | undefined;
          if (existing) restored.id = existing.id;
        }
        if (table === 'memo_symbols') {
          const symbolRow = row as typeof memoSymbols[number];
          const existing = db.prepare('SELECT id FROM memo_symbols WHERE memo_id = ? AND symbol = ? AND market = ?')
            .get(symbolRow.memo_id, symbolRow.symbol, symbolRow.market) as { id: string } | undefined;
          if (existing) restored.id = existing.id;
        }
        const columns = Object.keys(restored);
        db.prepare(`
          INSERT INTO ${table} (${columns.join(', ')})
          VALUES (${columns.map((column) => `@${column}`).join(', ')})
          ON CONFLICT(id) DO UPDATE SET
            ${columns.filter((column) => column !== 'id').map((column) => `${column} = excluded.${column}`).join(', ')}
        `).run(restored);
      }
    }
  });
  tx();
}

function markAllDeleted(now: string, updatedBy: string) {
  const db = getDb();
  db.prepare('DELETE FROM news_items').run();
  db.prepare('DELETE FROM stock_prices').run();
  for (const table of SYNC_TABLES) {
    db.prepare(`
      UPDATE ${table} SET deleted_at = ?, updated_at = ?, updated_by = ?
      WHERE deleted_at IS NULL
    `).run(now, now, updatedBy);
  }
}

export function clearAllData() {
  const db = getDb();
  db.transaction(() => {
    const now = new Date().toISOString();
    const updatedBy = getDeviceId();
    markAllDeleted(now, updatedBy);
    const insert = db.prepare(`
      INSERT INTO portfolios (id, name, broker, description, created_at, updated_at, updated_by)
      VALUES (@id, @name, @broker, @description, @created_at, @updated_at, @updated_by)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, broker = excluded.broker,
        description = excluded.description, created_at = excluded.created_at,
        updated_at = excluded.updated_at, updated_by = excluded.updated_by, deleted_at = NULL
    `);
    for (const portfolio of mockPortfolios) {
      insert.run({
        ...portfolio, broker: portfolio.broker ?? '', description: portfolio.description ?? null,
        updated_at: now, updated_by: updatedBy,
      });
    }
  })();
}
