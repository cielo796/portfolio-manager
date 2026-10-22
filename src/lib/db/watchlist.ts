import 'server-only';

import { Holding, WatchlistItem, WatchlistKey } from '@/types';
import { normalizeSectorKey, resolveSectorForSymbol } from '@/lib/sectors';
import { isValidWatchlistKey } from './validators';
import { getDb } from './connection';

export function listWatchlistItems(): WatchlistItem[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT
        watchlist_items.*,
        COALESCE(
          NULLIF(TRIM(watchlist_items.name), ''),
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
        ) AS name
      FROM watchlist_items
      ORDER BY
        CASE list_key
          WHEN 'main' THEN 0
          WHEN 'sub1' THEN 1
          WHEN 'sub2' THEN 2
          WHEN 'sub3' THEN 3
          WHEN 'sub4' THEN 4
          ELSE 5
        END,
        sort_order ASC,
        created_at DESC
    `)
    .all() as WatchlistItem[];
}

type NewWatchlistItemInput = {
  symbol: string;
  name?: string;
  market: Holding['market'];
  list_key?: WatchlistKey;
  sort_order?: number;
  sector?: string;
  target_price?: number;
  memo?: string;
};

export function createWatchlistItem(input: NewWatchlistItemInput): WatchlistItem {
  const db = getDb();
  const now = new Date().toISOString();
  const listKey = input.list_key && isValidWatchlistKey(input.list_key) ? input.list_key : 'main';
  const maxSortOrder = db
    .prepare('SELECT MAX(sort_order) as maxSortOrder FROM watchlist_items WHERE list_key = ?')
    .get(listKey) as { maxSortOrder: number | null };
  const item: WatchlistItem = {
    id: crypto.randomUUID(),
    symbol: input.symbol.toUpperCase().trim(),
    name: input.name?.trim() || undefined,
    market: input.market,
    list_key: listKey,
    sort_order: input.sort_order ?? ((maxSortOrder.maxSortOrder ?? -1) + 1),
    sector: input.sector
      ? normalizeSectorKey(input.sector)
      : resolveSectorForSymbol(input.symbol, input.market),
    target_price: input.target_price,
    memo: input.memo?.trim() || undefined,
    created_at: now,
    updated_at: now,
  };

  db.prepare(`
    INSERT INTO watchlist_items (id, symbol, name, market, list_key, sort_order, sector, target_price, memo, created_at, updated_at)
    VALUES (@id, @symbol, @name, @market, @list_key, @sort_order, @sector, @target_price, @memo, @created_at, @updated_at)
  `).run({
    ...item,
    name: item.name ?? null,
    sector: item.sector ?? null,
    target_price: item.target_price ?? null,
    memo: item.memo ?? null,
  });

  return item;
}

type UpdateWatchlistItemInput = {
  name?: string | null;
  list_key?: WatchlistKey | null;
  sort_order?: number | null;
  sector?: string | null;
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
    name: updates.name !== undefined ? updates.name ?? undefined : current.name,
    list_key:
      updates.list_key !== undefined && updates.list_key !== null
        ? updates.list_key
        : current.list_key,
    sort_order:
      updates.sort_order !== undefined && updates.sort_order !== null
        ? updates.sort_order
        : current.sort_order,
    sector:
      updates.sector !== undefined
        ? normalizeSectorKey(updates.sector)
        : normalizeSectorKey(current.sector),
    target_price: updates.target_price !== undefined ? updates.target_price ?? undefined : current.target_price,
    memo: updates.memo !== undefined ? updates.memo ?? undefined : current.memo,
    updated_at: now,
  };

  db.prepare(`
    UPDATE watchlist_items
    SET
      name = @name,
      list_key = @list_key,
      sort_order = @sort_order,
      sector = @sector,
      target_price = @target_price,
      memo = @memo,
      updated_at = @updated_at
    WHERE id = @id
  `).run({
    id: next.id,
    name: next.name ?? null,
    list_key: next.list_key,
    sort_order: next.sort_order,
    sector: next.sector ?? null,
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

type WatchlistLayoutUpdate = {
  id: string;
  list_key: WatchlistKey;
  sort_order: number;
};

export function updateWatchlistItemsLayout(updates: WatchlistLayoutUpdate[]): WatchlistItem[] {
  const db = getDb();
  const update = db.prepare(`
    UPDATE watchlist_items
    SET list_key = @list_key,
        sort_order = @sort_order,
        updated_at = @updated_at
    WHERE id = @id
  `);
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    for (const item of updates) {
      if (!isValidWatchlistKey(item.list_key) || !Number.isInteger(item.sort_order) || item.sort_order < 0) {
        continue;
      }
      update.run({
        id: item.id,
        list_key: item.list_key,
        sort_order: item.sort_order,
        updated_at: now,
      });
    }
  });
  tx();

  return listWatchlistItems();
}
