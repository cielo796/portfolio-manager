import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

describe('一時DBでの記録と保有の連動', () => {
  let api: typeof import('./index');
  let routes: typeof import('@/app/api/transactions/route');
  let itemRoutes: typeof import('@/app/api/transactions/[id]/route');
  let db: Database.Database;
  let directory: string;
  let dbPath: string;
  const globals = globalThis as typeof globalThis & { __portfolioDb?: Database.Database; __portfolioDbInitialized?: boolean };
  const purchase = { portfolio_id: 'account', symbol: 'TEST', market: 'US' as const, type: 'buy' as const,
    shares: 10, price: 100, fees: 10, fx_rate: 150, transaction_date: '2026-01-01' };
  const request = (method: string, body: unknown) => new Request('http://localhost/api/transactions', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeAll(async () => {
    expect(globals.__portfolioDb).toBeUndefined();
    directory = mkdtempSync(join(tmpdir(), 'portfolio-t18-'));
    dbPath = join(directory, 'ledger.db');
    vi.stubEnv('PM_FORBID_REAL_DB', '1');
    vi.stubEnv('SQLITE_DB_PATH', dbPath);
    api = await import('./index');
    db = api.getDb();
    expect(db.name).toBe(dbPath);
    routes = await import('@/app/api/transactions/route');
    itemRoutes = await import('@/app/api/transactions/[id]/route');
  });
  beforeEach(() => {
    expect(db.name).toBe(dbPath);
    db.exec(`DELETE FROM transactions; DELETE FROM holdings; DELETE FROM portfolios;
      INSERT INTO portfolios (id, name, broker, created_at, updated_at) VALUES ('account', '口座', '', '2026-01-01', '2026-01-01');
      INSERT INTO portfolios (id, name, broker, created_at, updated_at) VALUES ('other', '別口座', '', '2026-01-01', '2026-01-01');`);
  });
  afterAll(() => {
    db?.close();
    delete globals.__portfolioDb;
    delete globals.__portfolioDbInitialized;
    vi.unstubAllEnvs();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('接続先が一時ファイルである', () => {
    expect(db.name).toBe(dbPath);
  });
  it('購入→売却→配当→編集→削除で保有と実現損益を更新する', () => {
    const buy = api.createTransaction(purchase);
    expect(api.listHoldings()[0]).toMatchObject({ shares: 10, avg_cost: 101, id: buy.holding_id });
    const sell = api.createTransaction({ ...purchase, type: 'sell', shares: 4, price: 130, fees: 2, transaction_date: '2026-02-01' });
    expect(sell.realized_pl).toBe(114);
    expect(api.listHoldings()[0]).toMatchObject({ shares: 6, avg_cost: 101 });
    api.createTransaction({ ...purchase, type: 'dividend', shares: 6, price: 2, fees: 0, transaction_date: '2026-03-01' });
    expect(api.listHoldings()[0].shares).toBe(6);
    api.updateTransactionById(buy.id, { price: 110 });
    expect(api.listHoldings()[0]).toMatchObject({ shares: 6, avg_cost: 111 });
    expect(api.listTransactions().find((entry) => entry.id === sell.id)?.realized_pl).toBe(74);
    expect(api.deleteTransactionById(sell.id)).toBe(true);
    expect(api.listHoldings()[0].shares).toBe(10);
    api.deleteTransactionById(buy.id);
    expect(api.listHoldings()).toHaveLength(0);
  });
  it('既存の手入力保有を開始残高にして、記録削除で元に戻す', () => {
    const holding = api.createHolding({ portfolio_id: 'account', symbol: 'TEST', market: 'US', shares: 20, avg_cost: 80, name: '銘柄名' });
    const buy = api.createTransaction(purchase);
    expect(api.listHoldings()[0]).toMatchObject({ id: holding.id, shares: 30, avg_cost: 87, name: '銘柄名' });
    api.deleteTransactionById(buy.id);
    expect(api.listHoldings()[0]).toMatchObject({ shares: 20, avg_cost: 80 });
  });
  it('超過売却、過去日への編集、購入削除を原子的に拒否する', () => {
    const buy = api.createTransaction(purchase);
    const sell = api.createTransaction({ ...purchase, type: 'sell', shares: 5, transaction_date: '2026-02-01' });
    const before = api.listTransactions();
    expect(() => api.createTransaction({ ...purchase, type: 'sell', shares: 6, transaction_date: '2026-03-01' })).toThrow();
    expect(() => api.updateTransactionById(sell.id, { transaction_date: '2025-01-01' })).toThrow();
    expect(() => api.deleteTransactionById(buy.id)).toThrow();
    expect(api.listTransactions()).toEqual(before);
    expect(api.listHoldings()[0].shares).toBe(5);
  });
  it('全数売却を論理削除し、編集・再購入で同じ保有IDを復元する', () => {
    const buy = api.createTransaction(purchase);
    const sell = api.createTransaction({ ...purchase, type: 'sell', transaction_date: '2026-02-01' });
    expect(api.listHoldings()).toHaveLength(0);
    expect(db.prepare('SELECT deleted_at FROM holdings WHERE id = ?').get(buy.holding_id)).toMatchObject({ deleted_at: expect.any(String) });
    api.updateTransactionById(sell.id, { shares: 5 });
    expect(api.listHoldings()[0]).toMatchObject({ shares: 5, id: buy.holding_id });
    api.updateTransactionById(sell.id, { shares: 10 });
    api.createTransaction({ ...purchase, price: 200, transaction_date: '2026-03-01' });
    expect(api.listHoldings()[0]).toMatchObject({ shares: 10, avg_cost: 201, id: buy.holding_id });
  });
  it('取引を日付順に再計算し、同日取引は登録順に扱う', () => {
    api.createTransaction(purchase);
    api.createTransaction({ ...purchase, type: 'sell', shares: 5, price: 150, transaction_date: '2026-03-01', fees: 0 });
    api.createTransaction({ ...purchase, price: 200, fees: 0, transaction_date: '2026-02-01' });
    expect(api.listHoldings()[0]).toMatchObject({ shares: 15, avg_cost: 150.5 });
    expect(api.listTransactions()[0].realized_pl).toBe(-2.5);
    api.createTransaction({ ...purchase, portfolio_id: 'other' });
    api.createTransaction({ ...purchase, portfolio_id: 'other', type: 'sell' });
    expect(api.listHoldings()).toHaveLength(1);
  });
  it('口座・市場を分け、CASHと単独配当では保有を変えない', () => {
    api.createTransaction(purchase);
    api.createTransaction({ ...purchase, portfolio_id: 'other' });
    api.createTransaction({ ...purchase, market: 'JP' });
    const before = api.listHoldings();
    expect(api.createTransaction({ ...purchase, symbol: 'CASH' }).holding_id).toBeNull();
    expect(api.createTransaction({ ...purchase, symbol: 'DIV', type: 'dividend' }).holding_id).toBeNull();
    expect(api.listHoldings()).toEqual(before);
    expect(() => api.createTransaction({ ...purchase, portfolio_id: 'missing' })).toThrow('口座');
  });
  it('旧履歴を二重計上せず、追加列は既存行でNULLのまま', () => {
    api.createHolding({ portfolio_id: 'account', symbol: 'TEST', market: 'US', shares: 10, avg_cost: 100 });
    db.prepare(`INSERT INTO transactions (id, portfolio_id, symbol, market, type, shares, price, total_amount, fees, transaction_date, created_at)
      VALUES ('legacy', 'account', 'TEST', 'US', 'buy', 10, 100, 1000, 0, '2025-01-01', '2025-01-01')`).run();
    api.createTransaction(purchase);
    expect(api.listHoldings()[0].shares).toBe(20);
    expect(api.listTransactions().find((entry) => entry.id === 'legacy')).toMatchObject({ holding_id: null, fx_rate: null, realized_pl: null });
  });
  it('未連動の旧売買がある銘柄は編集・削除時に全履歴から再構築する', () => {
    api.createHolding({ portfolio_id: 'account', symbol: 'TEST', market: 'US', shares: 99, avg_cost: 80 });
    db.exec(`INSERT INTO transactions (id, portfolio_id, symbol, market, type, shares, price, total_amount, fees, transaction_date, created_at)
      VALUES ('legacy-buy', 'account', 'TEST', 'US', 'buy', 10, 100, 1000, 0, '2025-01-01', '2025-01-01'),
      ('legacy-sell', 'account', 'TEST', 'US', 'sell', 4, 150, 600, 0, '2025-02-01', '2025-02-01');`);
    api.updateTransactionById('legacy-buy', { price: 110 });
    expect(api.listHoldings()[0]).toMatchObject({ shares: 6, avg_cost: 110 });
    expect(api.listTransactions().find((entry) => entry.id === 'legacy-sell')?.realized_pl).toBe(160);
    expect(() => api.deleteTransactionById('legacy-buy')).toThrow();
    api.deleteTransactionById('legacy-sell');
    expect(api.listHoldings()[0]).toMatchObject({ shares: 10, avg_cost: 110 });
  });
  it('90日経過の整理でも有効な記録が参照する開始残高を保持する', async () => {
    const buy = api.createTransaction(purchase);
    api.createTransaction({ ...purchase, type: 'sell', transaction_date: '2026-02-01' });
    db.prepare('UPDATE holdings SET deleted_at = ? WHERE id = ?').run('2000-01-01T00:00:00Z', buy.holding_id);
    const { purgeDeletedRows } = await import('./maintenance');
    purgeDeletedRows(90, db);
    expect(db.prepare('SELECT id FROM holdings WHERE id = ?').get(buy.holding_id)).toBeDefined();
    api.updateTransactionById(buy.id, { price: 120 });
    expect(api.listTransactions().find((entry) => entry.type === 'sell')?.realized_pl).toBe(-220);
  });
  it('マイグレーションを繰り返してもデータを変えない', async () => {
    api.createTransaction(purchase);
    const before = api.listTransactions();
    const { runMigrations } = await import('./migrations');
    runMigrations(db); runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(7);
    expect(api.listTransactions()).toEqual(before);
  });
  it('API経由で201/200/400/404を返し、残高も反映する', async () => {
    const created = await routes.POST(request('POST', purchase));
    expect(created.status).toBe(201);
    const { transaction } = await created.json();
    expect((await itemRoutes.PATCH(request('PATCH', { price: 120 }), context(transaction.id))).status).toBe(200);
    expect(api.listHoldings()[0].avg_cost).toBe(121);
    expect((await routes.POST(request('POST', { ...purchase, type: 'sell', shares: 11 }))).status).toBe(400);
    expect((await itemRoutes.DELETE(new Request('http://localhost', { method: 'DELETE' }), context(transaction.id))).status).toBe(200);
    expect(api.listHoldings()).toHaveLength(0);
    expect((await itemRoutes.PATCH(request('PATCH', { price: 1 }), context('missing'))).status).toBe(404);
    expect((await itemRoutes.DELETE(new Request('http://localhost', { method: 'DELETE' }), context('missing'))).status).toBe(404);
  });
  it('APIで不正JSON・型・日付・レートを400にする', async () => {
    expect((await routes.POST(new Request('http://localhost', { method: 'POST', body: '{' }))).status).toBe(400);
    for (const body of [null, [], { ...purchase, shares: '10' }, { ...purchase, transaction_date: '2026-02-30' }, { ...purchase, fx_rate: 0 }, { ...purchase, memo: 123 }]) {
      expect((await routes.POST(request('POST', body))).status).toBe(400);
    }
    const buy = api.createTransaction(purchase);
    expect((await itemRoutes.PATCH(request('PATCH', { portfolio_id: 'other' }), context(buy.id))).status).toBe(400);
  });
});
