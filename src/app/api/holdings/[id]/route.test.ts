import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

describe('保有削除APIの連動チェック', () => {
  let api: typeof import('@/lib/db');
  let route: typeof import('./route');
  let db: Database.Database;
  let directory: string;
  let dbPath: string;
  const globals = globalThis as typeof globalThis & { __portfolioDb?: Database.Database; __portfolioDbInitialized?: boolean };
  const purchase = { portfolio_id: 'account', symbol: 'TEST', market: 'US' as const, type: 'buy' as const,
    shares: 10, price: 100, fees: 0, transaction_date: '2026-01-01' };
  const remove = (id: string) => route.DELETE(new Request('http://localhost/api/holdings/' + id, { method: 'DELETE' }), { params: Promise.resolve({ id }) });

  beforeAll(async () => {
    expect(globals.__portfolioDb).toBeUndefined();
    directory = mkdtempSync(join(tmpdir(), 'portfolio-t35-'));
    dbPath = join(directory, 'holdings.db');
    vi.stubEnv('PM_FORBID_REAL_DB', '1');
    vi.stubEnv('SQLITE_DB_PATH', dbPath);
    api = await import('@/lib/db');
    db = api.getDb();
    expect(db.name).toBe(dbPath);
    route = await import('./route');
  });
  beforeEach(() => {
    expect(db.name).toBe(dbPath);
    db.exec(`DELETE FROM transactions; DELETE FROM holdings; DELETE FROM portfolios;
      INSERT INTO portfolios (id, name, broker, created_at, updated_at) VALUES ('account', '口座', '', '2026-01-01', '2026-01-01');`);
  });
  afterAll(() => {
    db?.close();
    delete globals.__portfolioDb;
    delete globals.__portfolioDbInitialized;
    vi.unstubAllEnvs();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('接続先が一時ファイルである', () => { expect(db.name).toBe(dbPath); });
  it('連動しない保有を論理削除し、再削除は404にする', async () => {
    const holding = api.createHolding({ portfolio_id: 'account', symbol: 'AAPL', market: 'US', shares: 5, avg_cost: 100 });
    expect((await remove(holding.id)).status).toBe(200);
    expect(api.listHoldings()).toHaveLength(0);
    expect(db.prepare('SELECT deleted_at FROM holdings WHERE id = ?').get(holding.id)).toMatchObject({ deleted_at: expect.any(String) });
    expect((await remove(holding.id)).status).toBe(404);
  });
  it('未削除の売買記録に連動する保有は409で拒否し、数量を維持する', async () => {
    const buy = api.createTransaction(purchase);
    const result = await remove(buy.holding_id!);
    expect(result.status).toBe(409);
    expect((await result.json()).error).toContain('売買記録と連動');
    expect(api.listHoldings()[0]).toMatchObject({ id: buy.holding_id, shares: 10 });
    expect(api.listTransactions()).toHaveLength(1);
  });
  it('配当の連動でも削除を拒否する', async () => {
    const holding = api.createHolding({ portfolio_id: 'account', symbol: 'TEST', market: 'US', shares: 5, avg_cost: 100 });
    const dividend = api.createTransaction({ ...purchase, type: 'dividend', shares: 5, price: 2 });
    expect(dividend.holding_id).toBe(holding.id);
    expect((await remove(holding.id)).status).toBe(409);
  });
  it('連動する記録を削除して手入力の開始残高に戻した後は保有を削除できる', async () => {
    const holding = api.createHolding({ portfolio_id: 'account', symbol: 'TEST', market: 'US', shares: 5, avg_cost: 100 });
    const buy = api.createTransaction(purchase);
    api.deleteTransactionById(buy.id);
    expect(api.listHoldings()[0].shares).toBe(5);
    expect((await remove(holding.id)).status).toBe(200);
  });
});
