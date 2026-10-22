import 'server-only';

import { Holding, TradeIdea } from '@/types';
import { getDb } from './connection';
import { getDeviceId } from './device';

export function listTradeIdeas(): TradeIdea[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT *
      FROM trade_ideas
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
    `)
    .all() as TradeIdea[];
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
    updated_by: getDeviceId(),
  };

  db.prepare(`
    INSERT INTO trade_ideas (id, symbol, market, note, created_at, updated_at, updated_by)
    VALUES (@id, @symbol, @market, @note, @created_at, @updated_at, @updated_by)
  `).run(idea);

  return idea;
}

type UpdateTradeIdeaInput = Partial<Pick<TradeIdea, 'symbol' | 'market' | 'note'>>;

export function updateTradeIdeaById(id: string, updates: UpdateTradeIdeaInput): TradeIdea | null {
  const db = getDb();
  const current = db.prepare('SELECT * FROM trade_ideas WHERE id = ? AND deleted_at IS NULL').get(id) as TradeIdea | undefined;
  if (!current) return null;

  const now = new Date().toISOString();
  const next: TradeIdea = {
    ...current,
    symbol: updates.symbol !== undefined ? updates.symbol.toUpperCase().trim() : current.symbol,
    market: updates.market !== undefined ? updates.market : current.market,
    note: updates.note !== undefined ? updates.note.trim() : current.note,
    updated_at: now,
    updated_by: getDeviceId(),
  };

  db.prepare(`
    UPDATE trade_ideas
    SET
      symbol = @symbol,
      market = @market,
      note = @note,
      updated_at = @updated_at,
      updated_by = @updated_by
    WHERE id = @id AND deleted_at IS NULL
  `).run(next);

  return next;
}

export function deleteTradeIdeaById(id: string): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE trade_ideas SET deleted_at = ?, updated_at = ?, updated_by = ?
    WHERE id = ? AND deleted_at IS NULL
  `).run(now, now, getDeviceId(), id);
  return result.changes > 0;
}
