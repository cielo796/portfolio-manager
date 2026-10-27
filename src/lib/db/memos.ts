import 'server-only';

import type { MemoInput, MemoPriceSnapshot, MemoSymbol, MemoSymbolRow, MemoTag, StockMemo } from '@/types';
import { priceKey } from '@/lib/price-key';
import { getDb } from './connection';
import { getDeviceId, getDeviceName } from './device';

type MemoRow = Omit<StockMemo, 'symbols' | 'price_snapshot'> & { price_snapshot: string | null };
export type MemoFilter = { symbol?: string; market?: string; tag?: MemoTag; q?: string; limit?: number };

function hydrate(row: MemoRow): StockMemo {
  const db = getDb();
  const symbols = db.prepare(`SELECT symbol, market FROM memo_symbols
    WHERE memo_id = ? AND deleted_at IS NULL ORDER BY created_at, id`).all(row.id) as MemoSymbol[];
  const peer = db.prepare('SELECT name FROM sync_peers WHERE device_id = ?').get(row.updated_by ?? '') as { name: string } | undefined;
  return { ...row, price_snapshot: JSON.parse(row.price_snapshot || '{}'), symbols,
    updated_pc: row.updated_by === getDeviceId() ? getDeviceName() : peer?.name ?? row.updated_by ?? '不明' };
}

export function getMemoById(id: string): StockMemo | null {
  const row = getDb().prepare('SELECT * FROM stock_memos WHERE id = ? AND deleted_at IS NULL').get(id) as MemoRow | undefined;
  return row ? hydrate(row) : null;
}

export function listMemos(filter: MemoFilter = {}): StockMemo[] {
  const conditions = ['m.deleted_at IS NULL'];
  const values: (string | number)[] = [];
  if (filter.symbol || filter.market) {
    const symbols = ['s.memo_id = m.id', 's.deleted_at IS NULL'];
    if (filter.symbol) { symbols.push('s.symbol = ?'); values.push(filter.symbol.trim().toUpperCase()); }
    if (filter.market) { symbols.push('s.market = ?'); values.push(filter.market); }
    conditions.push(`EXISTS (SELECT 1 FROM memo_symbols s WHERE ${symbols.join(' AND ')})`);
  }
  if (filter.tag) { conditions.push('m.tag = ?'); values.push(filter.tag); }
  if (filter.q) {
    conditions.push('(instr(lower(m.title), lower(?)) > 0 OR instr(lower(m.body), lower(?)) > 0)');
    values.push(filter.q, filter.q);
  }
  const limit = filter.limit === undefined ? -1 : Math.max(1, Math.min(1000, Math.floor(filter.limit)));
  const rows = getDb().prepare(`SELECT m.* FROM stock_memos m WHERE ${conditions.join(' AND ')}
    ORDER BY m.created_at DESC, m.id DESC LIMIT ?`).all(...values, limit) as MemoRow[];
  return rows.map(hydrate);
}

function snapshotFor(symbols: MemoSymbol[], snapshot: MemoPriceSnapshot) {
  const query = getDb().prepare('SELECT price, currency, updated_at AS at FROM stock_prices WHERE symbol = ? AND market = ?');
  for (const item of symbols) {
    const key = priceKey(item.symbol, item.market);
    if (snapshot[key]) continue;
    const quote = query.get(item.symbol, item.market) as MemoPriceSnapshot[string] | undefined;
    if (quote) snapshot[key] = quote;
  }
  return snapshot;
}

function attachSymbols(id: string, symbols: MemoSymbol[], now: string, updatedBy: string) {
  const db = getDb();
  const desired = new Set(symbols.map((item) => priceKey(item.symbol, item.market)));
  const current = db.prepare('SELECT * FROM memo_symbols WHERE memo_id = ?').all(id) as MemoSymbolRow[];
  for (const row of current) {
    if (!row.deleted_at && !desired.has(priceKey(row.symbol, row.market))) {
      db.prepare('UPDATE memo_symbols SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(now, now, updatedBy, row.id);
    }
  }
  const insert = db.prepare(`INSERT INTO memo_symbols (id, memo_id, symbol, market, created_at, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(memo_id, symbol, market) DO UPDATE SET
    deleted_at = NULL, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    WHERE memo_symbols.deleted_at IS NOT NULL`);
  for (const [index, item] of symbols.entries()) {
    // 同時追加した銘柄も指定順で表示できるよう、作成時刻に順序を持たせる
    const created = new Date(Date.parse(now) + index).toISOString();
    insert.run(crypto.randomUUID(), id, item.symbol, item.market, created, now, updatedBy);
  }
}

function normalizeSymbols(symbols: MemoSymbol[]): MemoSymbol[] {
  return [...new Map(symbols.map((item) => {
    const normalized = { symbol: item.symbol.trim().toUpperCase(), market: item.market };
    return [priceKey(normalized.symbol, normalized.market), normalized] as const;
  })).values()];
}

export function createMemo(input: MemoInput): StockMemo {
  const db = getDb();
  const id = crypto.randomUUID();
  db.transaction(() => {
    const now = new Date().toISOString();
    const updatedBy = getDeviceId();
    const symbols = normalizeSymbols(input.symbols);
    db.prepare(`INSERT INTO stock_memos (id, title, body, tag, price_snapshot, transaction_id, created_at, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.title.trim(), input.body, input.tag ?? null,
      JSON.stringify(snapshotFor(symbols, {})), input.transactionId ?? null, now, now, updatedBy);
    attachSymbols(id, symbols, now, updatedBy);
  })();
  return getMemoById(id)!;
}

export function updateMemoById(id: string, input: Partial<MemoInput>): StockMemo | null {
  const db = getDb();
  return db.transaction(() => {
    const current = getMemoById(id);
    if (!current) return null;
    const now = new Date().toISOString();
    const updatedBy = getDeviceId();
    const symbols = input.symbols === undefined ? current.symbols : normalizeSymbols(input.symbols);
    const added = symbols.filter((item) => !current.symbols.some((old) => priceKey(old.symbol, old.market) === priceKey(item.symbol, item.market)));
    const snapshot = snapshotFor(added, { ...current.price_snapshot });
    db.prepare(`UPDATE stock_memos SET title = ?, body = ?, tag = ?, price_snapshot = ?, updated_at = ?, updated_by = ?
      WHERE id = ?`).run(input.title?.trim() ?? current.title, input.body ?? current.body,
      input.tag === undefined ? current.tag : input.tag, JSON.stringify(snapshot), now, updatedBy, id);
    if (input.symbols !== undefined) attachSymbols(id, symbols, now, updatedBy);
    return getMemoById(id);
  })();
}

export function deleteMemoById(id: string): boolean {
  const db = getDb();
  return db.transaction(() => {
    const now = new Date().toISOString();
    const updatedBy = getDeviceId();
    const result = db.prepare(`UPDATE stock_memos SET deleted_at = ?, updated_at = ?, updated_by = ?
      WHERE id = ? AND deleted_at IS NULL`).run(now, now, updatedBy, id);
    if (result.changes) db.prepare(`UPDATE memo_symbols SET deleted_at = ?, updated_at = ?, updated_by = ?
      WHERE memo_id = ? AND deleted_at IS NULL`).run(now, now, updatedBy, id);
    return result.changes > 0;
  })();
}
