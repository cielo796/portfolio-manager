import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupData } from '@/lib/db/backup';
import type { StockPrice } from '@/types';
import { mockHoldings, mockPortfolios, mockTransactions } from '@/lib/mock-data';
import { priceKey } from '@/lib/price-key';

const timestamp = '2026-01-01T00:00:00Z';
const fixture: BackupData = {
  portfolios: mockPortfolios,
  holdings: mockHoldings,
  transactions: mockTransactions,
  watchlistItems: [{
    id: 'watchlist', symbol: 'AAPL', market: 'US', name: 'Apple', list_key: 'sub1',
    sort_order: 0, sector: 'technology', target_price: 100, memo: '監視メモ',
    created_at: timestamp, updated_at: timestamp,
  }],
  tickerPresets: [{
    id: 'preset', symbol: 'MSFT', market: 'US', name: 'Microsoft',
    created_at: timestamp, updated_at: timestamp,
  }],
  tradeIdeas: [{
    id: 'idea', symbol: 'NVDA', market: 'US', note: '決算を確認',
    created_at: timestamp, updated_at: timestamp,
  }],
};
const counts = (data: BackupData) => Object.fromEntries(
  Object.entries(data).map(([key, rows]) => [key, rows.length])
);

describe('一時DBでのバックアップと価格マップ', () => {
  let dbApi: typeof import('@/lib/db');
  let testDb: Database.Database | undefined;
  let directory: string | undefined;
  const dbGlobal = globalThis as typeof globalThis & {
    __portfolioDb?: Database.Database;
    __portfolioDbInitialized?: boolean;
  };

  beforeAll(async () => {
    expect(dbGlobal.__portfolioDb).toBeUndefined();
    directory = mkdtempSync(join(tmpdir(), 'portfolio-manager-t04-'));
    const dbPath = join(directory, 'test.db');
    vi.stubEnv('SQLITE_DB_PATH', dbPath);
    dbApi = await import('@/lib/db');
    const { getDb } = await import('@/lib/db/connection');
    testDb = getDb();
    expect(testDb.name).toBe(dbPath);
  });

  beforeEach(() => {
    dbApi.importBackupData(fixture);
  });

  afterAll(() => {
    testDb?.close();
    if (dbGlobal.__portfolioDb === testDb) {
      delete dbGlobal.__portfolioDb;
      delete dbGlobal.__portfolioDbInitialized;
    }
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('通常の書き出し→JSON→取込で全種類の件数と内容が一致する', () => {
    const exported = dbApi.exportBackupData();
    expect(counts(exported)).toEqual(counts(fixture));
    dbApi.clearAllData();
    dbApi.importBackupData(JSON.parse(JSON.stringify(exported)));
    const restored = dbApi.exportBackupData();
    expect(counts(restored)).toEqual(counts(exported));
    expect(restored).toEqual(exported);
  });

  it('口座が空でもウォッチリスト・候補・アイデアを取り込み、保有・取引は取り込まない', () => {
    dbApi.importBackupData({ ...fixture, portfolios: [] });
    const restored = dbApi.exportBackupData();
    expect(restored.portfolios.map((item) => item.id)).toEqual(mockPortfolios.map((item) => item.id));
    expect(restored.holdings).toEqual([]);
    expect(restored.transactions).toEqual([]);
    expect(restored.watchlistItems).toEqual(fixture.watchlistItems);
    expect(restored.tickerPresets).toEqual(fixture.tickerPresets);
    expect(restored.tradeIdeas).toEqual(fixture.tradeIdeas);
  });

  it('口座省略時も独立データを取り込む', () => {
    dbApi.importBackupData({ watchlistItems: fixture.watchlistItems, tickerPresets: fixture.tickerPresets });
    const restored = dbApi.exportBackupData();
    expect(restored.portfolios).toHaveLength(mockPortfolios.length);
    expect(restored.watchlistItems).toHaveLength(1);
    expect(restored.tickerPresets).toHaveLength(1);
    expect(restored.holdings).toEqual([]);
    expect(restored.transactions).toEqual([]);
  });

  it('口座が空の取込中に失敗しても全データをロールバックする', () => {
    const original = dbApi.exportBackupData();
    expect(() => dbApi.importBackupData({
      ...fixture, portfolios: [], tradeIdeas: [fixture.tradeIdeas[0], fixture.tradeIdeas[0]],
    })).toThrow();
    expect(dbApi.exportBackupData()).toEqual(original);
  });

  it('保存価格とGET APIで同じシンボルの市場別価格が共存する', async () => {
    const us: StockPrice = {
      symbol: 'abc', market: 'US', name: 'US ABC', price: 120, change: 1,
      change_percent: 1, currency: 'USD', updated_at: timestamp,
    };
    const jp: StockPrice = { ...us, symbol: 'ABC', market: 'JP', price: 500, currency: 'JPY' };
    dbApi.upsertStockPrices([us, jp]);
    const prices = dbApi.listStockPrices();
    expect(Object.keys(prices).sort()).toEqual(['ABC|JP', 'ABC|US']);
    expect(prices[priceKey('ABC', 'US')].price).toBe(120);
    expect(prices[priceKey('ABC', 'JP')].price).toBe(500);
    const priceRoute = await import('@/app/api/prices/route');
    expect((await (await priceRoute.GET()).json()).prices).toEqual(prices);
    const portfolioRoute = await import('@/app/api/portfolio-data/route');
    expect((await (await portfolioRoute.GET()).json()).stockPrices).toEqual(prices);
  });

  it('POST APIは市場を区別したキーで価格を返し保存する', async () => {
    const fetchQuote = vi.fn(async (input: string | URL | Request) => {
      const isJp = String(input).includes('ABC.T');
      return Response.json({ chart: { result: [{ meta: {
        regularMarketPrice: isJp ? 500 : 120, chartPreviousClose: isJp ? 490 : 119,
      } }] } });
    });
    vi.stubGlobal('fetch', fetchQuote);
    try {
      const { POST } = await import('@/app/api/prices/route');
      const response = await POST(new Request('http://localhost/api/prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [
          { symbol: ' abc ', market: 'US' }, { symbol: 'ABC', market: 'JP' },
          { symbol: 'ABC', market: 'US' },
        ] }),
      }));
      const { prices } = await response.json();
      expect(response.status).toBe(200);
      expect(fetchQuote).toHaveBeenCalledTimes(2);
      expect(Object.keys(prices).sort()).toEqual(['ABC|JP', 'ABC|US']);
      expect(prices['ABC|US'].price).toBe(120);
      expect(prices['ABC|JP'].price).toBe(500);
      expect(dbApi.listStockPrices()).toEqual(prices);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
