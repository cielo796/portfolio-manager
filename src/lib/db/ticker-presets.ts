import 'server-only';

import { Holding, TickerPreset } from '@/types';
import { getDb } from './connection';
import { getDeviceId } from './device';

export function listTickerPresets(): TickerPreset[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT *
      FROM ticker_presets
      WHERE deleted_at IS NULL
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
    updated_by: getDeviceId(),
  };

  const deleted = db.prepare(`
    SELECT id FROM ticker_presets WHERE symbol = ? AND market = ? AND deleted_at IS NOT NULL
  `).get(preset.symbol, preset.market) as { id: string } | undefined;
  if (deleted) preset.id = deleted.id;

  const result = db.prepare(`
    INSERT INTO ticker_presets (id, symbol, market, name, created_at, updated_at, updated_by)
    VALUES (@id, @symbol, @market, @name, @created_at, @updated_at, @updated_by)
    ON CONFLICT(symbol, market) DO UPDATE SET
      name = excluded.name,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by,
      deleted_at = NULL
    WHERE ticker_presets.deleted_at IS NOT NULL
  `).run({
    ...preset,
    name: preset.name ?? null,
  });

  if (result.changes === 0) throw new Error('UNIQUE constraint failed: ticker_presets.symbol, ticker_presets.market');
  return preset;
}

export function deleteTickerPresetById(id: string): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(`
    UPDATE ticker_presets SET deleted_at = ?, updated_at = ?, updated_by = ?
    WHERE id = ? AND deleted_at IS NULL
  `).run(now, now, getDeviceId(), id);
  return result.changes > 0;
}
