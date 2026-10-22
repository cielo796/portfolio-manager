import 'server-only';

import type { FundamentalMetrics, Market } from '@/types';
import { getDb } from './connection';

const TTL_MS = 24 * 60 * 60 * 1000;

export function readFundamentalsCache(symbol: string, market: Market): FundamentalMetrics | undefined {
  const row = getDb().prepare('SELECT data_json, fetched_at FROM fundamentals_cache WHERE symbol = ? AND market = ?')
    .get(symbol.trim().toUpperCase(), market) as { data_json: string; fetched_at: string } | undefined;
  if (!row) return undefined;
  const age = Date.now() - Date.parse(row.fetched_at);
  if (!Number.isFinite(age) || age < 0 || age >= TTL_MS) return undefined;
  try {
    const data = JSON.parse(row.data_json) as FundamentalMetrics | null;
    if (data?.symbol === symbol.trim().toUpperCase() && data.market === market) return data;
  } catch {
    // 壊れたキャッシュは再取得する。
  }
  return undefined;
}

export function writeFundamentalsCache(data: FundamentalMetrics): void {
  getDb().prepare(`
    INSERT INTO fundamentals_cache (symbol, market, data_json, fetched_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(symbol, market) DO UPDATE SET data_json = excluded.data_json, fetched_at = excluded.fetched_at
  `).run(data.symbol.trim().toUpperCase(), data.market, JSON.stringify(data), new Date().toISOString());
}
