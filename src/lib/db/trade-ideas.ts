import 'server-only';

import { Holding, TradeIdea } from '@/types';
import { getDb } from './connection';

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

type UpdateTradeIdeaInput = Partial<Pick<TradeIdea, 'symbol' | 'market' | 'note'>>;

export function updateTradeIdeaById(id: string, updates: UpdateTradeIdeaInput): TradeIdea | null {
  const db = getDb();
  const current = db.prepare('SELECT * FROM trade_ideas WHERE id = ?').get(id) as TradeIdea | undefined;
  if (!current) return null;

  const now = new Date().toISOString();
  const next: TradeIdea = {
    ...current,
    symbol: updates.symbol !== undefined ? updates.symbol.toUpperCase().trim() : current.symbol,
    market: updates.market !== undefined ? updates.market : current.market,
    note: updates.note !== undefined ? updates.note.trim() : current.note,
    updated_at: now,
  };

  db.prepare(`
    UPDATE trade_ideas
    SET
      symbol = @symbol,
      market = @market,
      note = @note,
      updated_at = @updated_at
    WHERE id = @id
  `).run(next);

  return next;
}

export function deleteTradeIdeaById(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM trade_ideas WHERE id = ?').run(id);
  return result.changes > 0;
}
