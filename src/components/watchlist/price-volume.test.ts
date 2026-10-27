import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-t14-volume-'));
const dbPath = path.join(directory, 'test.db');
const previousPath = process.env.SQLITE_DB_PATH;
let connection: typeof import('@/lib/db/connection');
let prices: typeof import('@/lib/db/prices');
let route: typeof import('@/app/api/prices/route');

beforeAll(async () => {
  process.env.SQLITE_DB_PATH = dbPath;
  vi.stubEnv('PM_FORBID_REAL_DB', '1');
  connection = await import('@/lib/db/connection');
  prices = await import('@/lib/db/prices');
  route = await import('@/app/api/prices/route');
});

afterEach(() => vi.unstubAllGlobals());
afterAll(() => {
  connection.getDb().close();
  if (previousPath === undefined) delete process.env.SQLITE_DB_PATH;
  else process.env.SQLITE_DB_PATH = previousPath;
  const globalDb = globalThis as typeof globalThis & { __portfolioDb?: unknown; __portfolioDbInitialized?: boolean };
  delete globalDb.__portfolioDb;
  delete globalDb.__portfolioDbInitialized;
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('出来高の取得と保存', () => {
  it('接続先が一時DBであることを最初に確認する', () => {
    expect(path.resolve(connection.getDb().name)).toBe(dbPath);
  });

  it('既存版からの列追加はデータを保ち、再適用しても壊れない', async () => {
    const db = connection.getDb();
    const { runMigrations } = await import('@/lib/db/migrations');
    prices.upsertStockPrices([{ symbol: 'KEEP', market: 'US', name: 'Keep', price: 42, change: 1, change_percent: 2.4, currency: 'USD', updated_at: '2026-10-23T00:00:00Z' }]);
    const before = db.prepare('SELECT symbol, price, updated_at FROM stock_prices ORDER BY symbol').all();
    db.exec('ALTER TABLE stock_prices DROP COLUMN volume');
    db.pragma('user_version = 5');
    runMigrations(db);
    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(6);
    expect(db.prepare('PRAGMA table_info(stock_prices)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'volume' })]));
    expect(db.prepare('SELECT symbol, price, updated_at FROM stock_prices ORDER BY symbol').all()).toEqual(before);
    expect(db.prepare('SELECT volume FROM stock_prices WHERE volume IS NOT NULL').all()).toEqual([]);
  });

  it('Yahooの出来高を保存し、欠損時は日足へフォールバックする。0も保持する', async () => {
    const request = () => new Request('http://localhost/api/prices', {
      method: 'POST', body: JSON.stringify({ symbols: [{ symbol: 'T14', market: 'US' }] }),
    });
    for (const [metaVolume, dailyVolumes, expected] of [
      [52400000, [10, 20], 52400000],
      [undefined, [10, 6800000], 6800000],
      [0, [10, 20], 0],
      [undefined, [null, null], null],
    ] as const) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ chart: { result: [{
        meta: { regularMarketPrice: 100, regularMarketVolume: metaVolume },
        indicators: { quote: [{ close: [98, 100], volume: dailyVolumes }] },
      }] } })));
      const response = await route.POST(request());
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.prices['T14|US'].price).toBe(100);
      expect(data.prices['T14|US'].change).toBe(2);
      expect(prices.listStockPrices()['T14|US'].volume).toBe(expected);
    }
    const saved = await (await route.GET()).json();
    expect(saved.prices['T14|US'].volume).toBeNull();
  });
});
