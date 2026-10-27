import 'server-only';

import type { Holding, Transaction } from '@/types';
import { replayTrades, TradeLedgerError } from '@/lib/trade-ledger';
import { normalizeSectorKey, resolveHoldingSector } from '@/lib/sectors';
import { getDb } from './connection';
import { getDeviceId } from './device';
import { createHolding } from './holdings';

export { TradeLedgerError } from '@/lib/trade-ledger';

export function listTransactions(): Transaction[] {
  return getDb().prepare(`SELECT * FROM transactions WHERE deleted_at IS NULL
    ORDER BY transaction_date DESC, created_at DESC, id DESC`).all() as Transaction[];
}

type TransactionInput = Pick<Transaction, 'portfolio_id' | 'symbol' | 'market' | 'type' | 'shares' | 'price' | 'transaction_date'> &
  Partial<Pick<Transaction, 'fees' | 'memo' | 'fx_rate'>> & { name?: string };
type LedgerHolding = Holding & { ledger_opening_shares: number | null; ledger_opening_cost: number | null };

function findSymbolProfile(symbol: string, market: string): { name: string | null; sector: string | null } {
  const db = getDb();
  const watch = db.prepare(`SELECT name, sector FROM watchlist_items WHERE symbol = ? AND market = ? AND deleted_at IS NULL
    ORDER BY (NULLIF(TRIM(name), '') IS NULL) ASC, created_at DESC LIMIT 1`).get(symbol, market) as
    { name: string | null; sector: string | null } | undefined;
  const holding = db.prepare(`SELECT name FROM holdings WHERE symbol = ? AND market = ? AND deleted_at IS NULL
    ORDER BY (NULLIF(TRIM(name), '') IS NULL) ASC, created_at DESC LIMIT 1`).get(symbol, market) as
    { name: string | null } | undefined;
  // 別口座の保有からは、未分類（'other'）と空を除いたセクターだけを引き継ぐ。
  const inherited = (db.prepare(`SELECT sector FROM holdings WHERE symbol = ? AND market = ? AND deleted_at IS NULL
    AND NULLIF(TRIM(sector), '') IS NOT NULL ORDER BY created_at DESC`).all(symbol, market) as { sector: string }[])
    .map((row) => row.sector.trim())
    .find((sector) => normalizeSectorKey(sector) !== 'other');
  return {
    name: watch?.name?.trim() || holding?.name?.trim() || null,
    sector: watch?.sector?.trim() || inherited || resolveHoldingSector(symbol, market, undefined),
  };
}

export function validateTransaction(input: TransactionInput): TransactionInput {
  if (!input || typeof input.portfolio_id !== 'string' || !input.portfolio_id.trim() ||
    typeof input.symbol !== 'string' || !input.symbol.trim() || !['US', 'JP', 'FX'].includes(input.market) ||
    !['buy', 'sell', 'dividend'].includes(input.type)) throw new TradeLedgerError('必須項目が不足しています。');
  if (input.name != null && typeof input.name !== 'string') throw new TradeLedgerError('銘柄名が不正です。');
  const symbol = input.symbol.trim().toUpperCase();
  if (input.market === 'FX' && !/^[A-Z]{3}(JPY|USD)$/.test(symbol)) {
    throw new TradeLedgerError('FX通貨ペアはJPY/USDクォートのみ対応しています。');
  }
  if (typeof input.transaction_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.transaction_date) ||
    !Number.isFinite(Date.parse(input.transaction_date)) || new Date(input.transaction_date).toISOString().slice(0, 10) !== input.transaction_date) {
    throw new TradeLedgerError('有効な取引日を指定してください。');
  }
  if (typeof input.shares !== 'number' || !Number.isFinite(input.shares) || input.shares <= 0 ||
    typeof input.price !== 'number' || !Number.isFinite(input.price) || input.price < 0 ||
    (input.fees !== undefined && (typeof input.fees !== 'number' || !Number.isFinite(input.fees) || input.fees < 0)) ||
    (input.fx_rate != null && (typeof input.fx_rate !== 'number' || !Number.isFinite(input.fx_rate) || input.fx_rate <= 0)) ||
    (input.memo !== undefined && input.memo !== null && typeof input.memo !== 'string') ||
    !Number.isFinite(input.shares * input.price)) {
    throw new TradeLedgerError('数量・単価・手数料・USD/JPYの値が不正です。');
  }
  if (!getDb().prepare('SELECT id FROM portfolios WHERE id = ? AND deleted_at IS NULL').get(input.portfolio_id)) {
    throw new TradeLedgerError('指定した口座がありません。');
  }
  return { ...input, symbol };
}

function attachHolding(entry: Transaction, name?: string): string | null {
  if (entry.symbol === 'CASH') return null;
  const db = getDb();
  const matches = db.prepare(`SELECT * FROM holdings WHERE portfolio_id = ? AND symbol = ? AND market = ?
    AND (deleted_at IS NULL OR ledger_opening_shares IS NOT NULL)
    ORDER BY (deleted_at IS NULL) DESC, created_at DESC`).all(entry.portfolio_id, entry.symbol, entry.market) as LedgerHolding[];
  const active = matches.filter((holding) => !holding.deleted_at);
  if (active.length > 1) throw new TradeLedgerError('同じ口座・銘柄・市場の保有が複数あります。保有を整理してください。');
  let holding = active[0] ?? matches[0];
  if (!holding) {
    if (entry.type === 'dividend') return null;
    if (entry.type === 'sell') throw new TradeLedgerError('売却する保有がありません。');
    const profile = findSymbolProfile(entry.symbol, entry.market);
    holding = { ...createHolding({ portfolio_id: entry.portfolio_id, symbol: entry.symbol, market: entry.market,
      shares: 1, avg_cost: 0, name: name?.trim() || profile.name || undefined, sector: profile.sector ?? undefined }),
      ledger_opening_shares: 0, ledger_opening_cost: 0 };
    db.prepare('UPDATE holdings SET ledger_opening_shares = 0, ledger_opening_cost = 0 WHERE id = ?').run(holding.id);
  } else if (holding.ledger_opening_shares === null) {
    db.prepare('UPDATE holdings SET ledger_opening_shares = shares, ledger_opening_cost = avg_cost WHERE id = ?').run(holding.id);
  }
  return holding.id;
}

function rebuildHolding(id: string, now: string) {
  const db = getDb();
  const holding = db.prepare('SELECT * FROM holdings WHERE id = ?').get(id) as LedgerHolding | undefined;
  if (!holding || holding.ledger_opening_shares === null || holding.ledger_opening_cost === null) {
    throw new TradeLedgerError('保有の開始残高がありません。');
  }
  const entries = db.prepare('SELECT * FROM transactions WHERE holding_id = ? AND deleted_at IS NULL').all(id) as Transaction[];
  const result = replayTrades(entries, { shares: holding.ledger_opening_shares, avg_cost: holding.ledger_opening_cost });
  const device = getDeviceId();
  for (const entry of result.transactions) {
    db.prepare(`UPDATE transactions SET realized_pl = ?, total_amount = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
      .run(entry.realized_pl, entry.total_amount, now, device, entry.id);
  }
  // 既存の shares > 0 制約を保ち、ゼロ残高は論理削除で表す。
  db.prepare(`UPDATE holdings SET shares = ?, avg_cost = ?, deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?`)
    .run(result.shares || holding.shares, result.avg_cost, result.shares === 0 ? now : null, now, device, id);
}

function prepareFullReplay(entry: Transaction, now: string): string | null {
  if (entry.symbol === 'CASH') return null;
  const db = getDb();
  const entries = db.prepare(`SELECT * FROM transactions WHERE portfolio_id = ? AND symbol = ? AND market = ?
    AND deleted_at IS NULL`).all(entry.portfolio_id, entry.symbol, entry.market) as Transaction[];
  const hasLegacyTrades = entries.some((item) => !item.holding_id && item.type !== 'dividend');
  const holdingId = entry.holding_id ?? attachHolding({ ...entry, type: hasLegacyTrades ? 'buy' : entry.type });
  if (!holdingId) return null;
  // 旧売買を編集・削除するときは、手入力残高ではなく全履歴から再構築する。
  if (hasLegacyTrades) db.prepare('UPDATE holdings SET ledger_opening_shares = 0, ledger_opening_cost = 0 WHERE id = ?').run(holdingId);
  db.prepare(`UPDATE transactions SET holding_id = ?, updated_at = ?, updated_by = ?
    WHERE portfolio_id = ? AND symbol = ? AND market = ? AND deleted_at IS NULL`)
    .run(holdingId, now, getDeviceId(), entry.portfolio_id, entry.symbol, entry.market);
  return holdingId;
}

export function createTransaction(input: TransactionInput): Transaction {
  const db = getDb();
  return db.transaction(() => {
    const { name, ...valid } = validateTransaction(input);
    const latest = db.prepare('SELECT MAX(created_at) AS value FROM transactions').get() as { value: string | null };
    const now = new Date(Math.max(Date.now(), Date.parse(latest.value ?? '') + 1 || 0)).toISOString();
    const entry: Transaction = { ...valid, id: crypto.randomUUID(), fees: valid.fees ?? 0,
      total_amount: valid.shares * valid.price, memo: valid.memo?.trim(), fx_rate: valid.fx_rate ?? null,
      realized_pl: null, holding_id: null, created_at: now, updated_at: now, updated_by: getDeviceId() };
    entry.holding_id = attachHolding(entry, name);
    db.prepare(`INSERT INTO transactions (id, portfolio_id, symbol, market, type, shares, price, total_amount, fees,
      transaction_date, memo, created_at, updated_at, updated_by, realized_pl, fx_rate, holding_id)
      VALUES (@id, @portfolio_id, @symbol, @market, @type, @shares, @price, @total_amount, @fees,
      @transaction_date, @memo, @created_at, @updated_at, @updated_by, @realized_pl, @fx_rate, @holding_id)`)
      .run({ ...entry, memo: entry.memo || null });
    if (entry.holding_id) rebuildHolding(entry.holding_id, now);
    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(entry.id) as Transaction;
  })();
}

export function updateTransactionById(id: string, updates: Partial<TransactionInput>): Transaction | null {
  const db = getDb();
  return db.transaction(() => {
    const current = db.prepare('SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL').get(id) as Transaction | undefined;
    if (!current) return null;
    for (const key of ['portfolio_id', 'symbol', 'market'] as const) {
      if (updates[key] !== undefined && updates[key] !== current[key]) throw new TradeLedgerError('口座・銘柄・市場の変更は削除して再登録してください。');
    }
    const next = validateTransaction({ ...current, ...updates });
    const now = new Date().toISOString();
    const holdingId = prepareFullReplay(current, now);
    db.prepare(`UPDATE transactions SET type = @type, shares = @shares, price = @price, fees = @fees,
      transaction_date = @transaction_date, memo = @memo, fx_rate = @fx_rate, holding_id = @holding_id,
      total_amount = @total_amount, realized_pl = NULL, updated_at = @updated_at, updated_by = @updated_by WHERE id = @id`)
      .run({ id, type: next.type, shares: next.shares, price: next.price, fees: next.fees ?? 0,
        transaction_date: next.transaction_date, memo: next.memo?.trim() || null, fx_rate: next.fx_rate ?? null,
        holding_id: holdingId, total_amount: next.shares * next.price, updated_at: now, updated_by: getDeviceId() });
    if (holdingId) rebuildHolding(holdingId, now);
    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id) as Transaction;
  })();
}

export function deleteTransactionById(id: string): boolean {
  const db = getDb();
  return db.transaction(() => {
    const entry = db.prepare('SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL').get(id) as Transaction | undefined;
    if (!entry) return false;
    const now = new Date().toISOString();
    const holdingId = prepareFullReplay(entry, now);
    db.prepare('UPDATE transactions SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(now, now, getDeviceId(), id);
    if (holdingId) rebuildHolding(holdingId, now);
    return true;
  })();
}
