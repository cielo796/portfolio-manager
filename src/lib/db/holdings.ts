import 'server-only';

import { Holding } from '@/types';
import { resolveHoldingSector } from '@/lib/sectors';
import { getDb } from './connection';

export function listHoldings(): Holding[] {
  const db = getDb();
  return db.prepare('SELECT * FROM holdings ORDER BY sort_order ASC, created_at ASC').all() as Holding[];
}

type NewHoldingInput = Omit<Holding, 'id' | 'created_at' | 'updated_at' | 'name' | 'sort_order'> & {
  name?: string;
};

export function createHolding(input: NewHoldingInput): Holding {
  const db = getDb();
  const now = new Date().toISOString();
  const maxSortOrder = db
    .prepare('SELECT MAX(sort_order) as maxSortOrder FROM holdings')
    .get() as { maxSortOrder: number | null };
  const holding: Holding = {
    id: crypto.randomUUID(),
    portfolio_id: input.portfolio_id,
    symbol: input.symbol.toUpperCase().trim(),
    name: input.name?.trim() || undefined,
    market: input.market,
    shares: input.shares,
    avg_cost: input.avg_cost,
    sort_order: (maxSortOrder.maxSortOrder ?? -1) + 1,
    sector: resolveHoldingSector(input.symbol, input.market, input.sector) ?? undefined,
    memo: input.memo?.trim() || undefined,
    created_at: now,
    updated_at: now,
  };

  db.prepare(`
    INSERT INTO holdings (id, portfolio_id, symbol, name, market, shares, avg_cost, sort_order, sector, memo, created_at, updated_at)
    VALUES (@id, @portfolio_id, @symbol, @name, @market, @shares, @avg_cost, @sort_order, @sector, @memo, @created_at, @updated_at)
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
    sector: resolveHoldingSector(
      current.symbol,
      current.market,
      updates.sector !== undefined ? updates.sector : current.sector
    ) ?? undefined,
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

type HoldingOrderUpdate = {
  id: string;
  sort_order: number;
};

export function updateHoldingsOrder(updates: HoldingOrderUpdate[]): Holding[] {
  const db = getDb();
  const update = db.prepare(`
    UPDATE holdings
    SET sort_order = @sort_order,
        updated_at = @updated_at
    WHERE id = @id
  `);
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    for (const item of updates) {
      if (!Number.isInteger(item.sort_order) || item.sort_order < 0) {
        continue;
      }
      update.run({
        id: item.id,
        sort_order: item.sort_order,
        updated_at: now,
      });
    }
  });
  tx();

  return listHoldings();
}
