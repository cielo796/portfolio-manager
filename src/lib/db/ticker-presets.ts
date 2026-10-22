import 'server-only';

import { Holding, TickerPreset } from '@/types';
import { getDb } from './connection';

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
