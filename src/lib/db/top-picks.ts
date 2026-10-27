import 'server-only';

import type { FundamentalMetrics, TopPick, TopPickInput, TopPickView } from '@/types';
import { getDb } from './connection';
import { getDeviceId } from './device';

export class TopPickError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export const topPickToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const current = 'removed_at IS NULL AND deleted_at IS NULL';
const fields = { theme: 'theme', conviction: 'conviction', horizon: 'horizon', pickedAt: 'picked_at', pickedPrice: 'picked_price',
  targetPrice: 'target_price', reviewOn: 'review_on', thesis: 'thesis', catalysts: 'catalysts', risks: 'risks', exitRule: 'exit_rule' } as const;

export function validateTopPickInput(value: unknown, partial = false): Partial<TopPickInput> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TopPickError('入力が不正です。');
  const input = value as Record<string, unknown>;
  const allowed = partial ? Object.keys(fields) : ['symbol', 'market', ...Object.keys(fields)];
  if (!Object.keys(input).length || Object.keys(input).some((key) => !allowed.includes(key))) throw new TopPickError('変更できない項目が含まれています。');
  if (!partial && (typeof input.symbol !== 'string' || !/^[A-Z0-9][A-Z0-9.=-]{0,31}$/i.test(input.symbol.trim())
    || input.symbol.trim().toUpperCase() === 'CASH' || !['US', 'JP', 'FX'].includes(input.market as string))) throw new TopPickError('銘柄コードと市場を確認してください。');
  for (const key of ['theme', 'thesis', 'catalysts', 'risks', 'exitRule']) {
    if (input[key] !== undefined && input[key] !== null && (typeof input[key] !== 'string' || (input[key] as string).length > 20000)) throw new TopPickError('テキストは20,000文字以内で入力してください。');
  }
  for (const [key, values] of [['conviction', ['high', 'medium', 'low']], ['horizon', ['short', 'medium', 'long']]] as const) {
    if (input[key] !== undefined && input[key] !== null && !values.includes(input[key] as never)) throw new TopPickError('確信度または期間が不正です。');
  }
  for (const key of ['pickedAt', 'reviewOn']) {
    const value = input[key];
    if (value === undefined || (key === 'reviewOn' && value === null)) continue;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))
      || new Date(value).toISOString().slice(0, 10) !== value || (key === 'pickedAt' && value > topPickToday())) throw new TopPickError('日付を確認してください。選定日は今日以前にしてください。');
  }
  for (const key of ['pickedPrice', 'targetPrice']) {
    const value = input[key];
    if (value === undefined || (key === 'targetPrice' && value === null)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TopPickError('価格は0より大きい数値で入力してください。');
  }
  return input as Partial<TopPickInput>;
}

function benchmarkAt(date: string): number | null {
  const row = getDb().prepare(`SELECT close FROM price_history WHERE symbol = '^GSPC' AND market = 'INDEX'
    AND date <= ? AND close > 0 ORDER BY date DESC LIMIT 1`).get(date) as { close: number } | undefined;
  return row?.close ?? null;
}

function quoteFor(symbol: string, market: string) {
  return getDb().prepare('SELECT price, name FROM stock_prices WHERE symbol = ? AND market = ? AND price > 0').get(symbol, market) as { price: number; name: string } | undefined;
}

export function getTopPick(id: string): TopPick | null {
  return getDb().prepare('SELECT * FROM top_picks WHERE id = ? AND deleted_at IS NULL').get(id) as TopPick | undefined ?? null;
}

export function listTopPicks(status: 'current' | 'removed' = 'current'): TopPickView[] {
  const db = getDb();
  const benchmark = benchmarkAt(topPickToday());
  const rows = db.prepare(`SELECT * FROM top_picks WHERE deleted_at IS NULL AND removed_at IS ${status === 'removed' ? 'NOT ' : ''}NULL
    ORDER BY ${status === 'current' ? 'rank, updated_at, id' : 'removed_at DESC, id'}`).all() as TopPick[];
  return rows.map((pick) => {
    const owned = db.prepare('SELECT name FROM holdings WHERE symbol = ? AND market = ? AND deleted_at IS NULL LIMIT 1').get(pick.symbol, pick.market) as { name: string | null } | undefined;
    const watched = db.prepare('SELECT name FROM watchlist_items WHERE symbol = ? AND market = ? AND deleted_at IS NULL LIMIT 1').get(pick.symbol, pick.market) as { name: string | null } | undefined;
    const quote = quoteFor(pick.symbol, pick.market);
    const cache = db.prepare('SELECT data_json FROM fundamentals_cache WHERE symbol = ? AND market = ?').get(pick.symbol, pick.market) as { data_json: string } | undefined;
    let metrics: FundamentalMetrics | undefined;
    try { metrics = cache ? JSON.parse(cache.data_json) as FundamentalMetrics : undefined; } catch { /* 壊れたキャッシュは表示に使わない */ }
    return { ...pick, name: owned?.name || watched?.name || quote?.name || pick.symbol,
      state: owned ? '保有中' : watched ? '登録' : '未登録', current_price: quote?.price ?? null,
      current_benchmark: benchmark, next_earnings_date: metrics?.next_earnings_date ?? null };
  });
}

function renumber(now: string, device: string, ids?: string[]) {
  const db = getDb();
  const ordered = ids ?? (db.prepare(`SELECT id FROM top_picks WHERE ${current} ORDER BY rank, updated_at, id`).all() as { id: string }[]).map((row) => row.id);
  const update = db.prepare('UPDATE top_picks SET rank = ?, updated_at = ?, updated_by = ? WHERE id = ?');
  ordered.forEach((id, index) => update.run(index + 1, now, device, id));
}

export function createTopPick(value: TopPickInput): TopPick {
  const input = validateTopPickInput(value) as TopPickInput;
  const db = getDb();
  return db.transaction(() => {
    const count = (db.prepare(`SELECT COUNT(*) AS n FROM top_picks WHERE ${current}`).get() as { n: number }).n;
    if (count >= 10) throw new TopPickError('現在のピックは最大10件です。', 409);
    const symbol = input.symbol.trim().toUpperCase();
    const price = input.pickedPrice ?? quoteFor(symbol, input.market)?.price;
    if (price === undefined) throw new TopPickError('現在値がありません。選定時の価格を入力してください。');
    const now = new Date().toISOString();
    const pickedAt = input.pickedAt ?? topPickToday();
    const row: TopPick = { id: crypto.randomUUID(), symbol, market: input.market, rank: count + 1,
      theme: input.theme ?? null, conviction: input.conviction ?? null, horizon: input.horizon ?? null,
      picked_at: pickedAt, picked_price: price, benchmark_at_pick: benchmarkAt(pickedAt),
      target_price: input.targetPrice ?? null, review_on: input.reviewOn ?? null,
      thesis: input.thesis ?? null, catalysts: input.catalysts ?? null, risks: input.risks ?? null, exit_rule: input.exitRule ?? null,
      removed_at: null, removed_price: null, benchmark_at_remove: null, created_at: now, updated_at: now,
      deleted_at: null, updated_by: getDeviceId() };
    const columns = Object.keys(row);
    db.prepare(`INSERT INTO top_picks (${columns.join(',')}) VALUES (${columns.map((key) => `@${key}`).join(',')})`).run(row);
    renumber(now, row.updated_by!);
    return getTopPick(row.id)!;
  }).immediate();
}

export function updateTopPick(id: string, value: Partial<TopPickInput>): TopPick {
  const input = validateTopPickInput(value, true);
  const db = getDb();
  return db.transaction(() => {
    if (!getTopPick(id)) throw new TopPickError('ピックが見つかりません。', 404);
    const updates: Array<[string, string | number | null]> = [];
    for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
      const value = input[key];
      if (value !== undefined) updates.push([fields[key], value]);
    }
    if (!updates.length) throw new TopPickError('変更する項目を指定してください。');
    if (input.pickedAt !== undefined) updates.push(['benchmark_at_pick', benchmarkAt(input.pickedAt)]);
    db.prepare(`UPDATE top_picks SET ${updates.map(([column]) => `${column} = ?`).join(', ')}, updated_at = ?, updated_by = ? WHERE id = ?`)
      .run(...updates.map(([, value]) => value), new Date().toISOString(), getDeviceId(), id);
    return getTopPick(id)!;
  })();
}

export function deleteTopPick(id: string) {
  const db = getDb();
  db.transaction(() => {
    const pick = getTopPick(id);
    if (!pick) throw new TopPickError('ピックが見つかりません。', 404);
    const now = new Date().toISOString();
    const device = getDeviceId();
    db.prepare('UPDATE top_picks SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(now, now, device, id);
    if (!pick.removed_at) renumber(now, device);
  })();
}

export function removeTopPick(id: string): TopPick {
  const db = getDb();
  return db.transaction(() => {
    const pick = getTopPick(id);
    if (!pick) throw new TopPickError('ピックが見つかりません。', 404);
    if (pick.removed_at) throw new TopPickError('このピックはすでに外されています。', 409);
    const price = quoteFor(pick.symbol, pick.market)?.price;
    if (price === undefined) throw new TopPickError('現在値がありません。価格を更新してから外してください。');
    const now = new Date().toISOString();
    const device = getDeviceId();
    db.prepare(`UPDATE top_picks SET removed_at = ?, removed_price = ?, benchmark_at_remove = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
      .run(now, price, benchmarkAt(topPickToday()), now, device, id);
    renumber(now, device);
    return getTopPick(id)!;
  })();
}

export function reorderTopPicks(ids: string[]) {
  const db = getDb();
  db.transaction(() => {
    const rows = db.prepare(`SELECT id FROM top_picks WHERE ${current}`).all() as { id: string }[];
    const known = new Set(rows.map((row) => row.id));
    if (!Array.isArray(ids) || ids.length !== rows.length || new Set(ids).size !== rows.length || ids.some((id) => !known.has(id))) throw new TopPickError('現在のピック全件を重複なく指定してください。');
    renumber(new Date().toISOString(), getDeviceId(), ids);
  }).immediate();
  return listTopPicks();
}
