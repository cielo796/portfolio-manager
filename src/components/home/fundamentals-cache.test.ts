import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FundamentalMetrics } from '@/types';

describe('T13 財務キャッシュとAPI', () => {
  let directory: string;
  let db: Database.Database;
  let connection: typeof import('@/lib/db/connection');
  let cache: typeof import('@/lib/db/fundamentals-cache');
  let route: typeof import('@/app/api/fundamentals/route');
  const globalDb = globalThis as typeof globalThis & { __portfolioDb?: Database.Database; __portfolioDbInitialized?: boolean };
  const metrics: FundamentalMetrics = { symbol: 'AAPL', market: 'US', source: 'yahoo_finance', updated_at: '2026-10-23T00:00:00Z', next_earnings_date: '2026-10-30' };
  const request = (refresh = false) => new Request('http://localhost/api/fundamentals', { method: 'POST', body: JSON.stringify({ symbols: [{ symbol: ' aapl ', market: 'US' }, { symbol: 'AAPL', market: 'US' }], refresh }) });

  beforeAll(async () => {
    expect(globalDb.__portfolioDb).toBeUndefined();
    directory = mkdtempSync(join(tmpdir(), 'portfolio-manager-t13-'));
    vi.stubEnv('SQLITE_DB_PATH', join(directory, 'fundamentals.db'));
    vi.stubEnv('PM_FORBID_REAL_DB', '1');
    connection = await import('@/lib/db/connection');
    cache = await import('@/lib/db/fundamentals-cache');
    route = await import('@/app/api/fundamentals/route');
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  afterAll(() => {
    db?.close();
    if (globalDb.__portfolioDb === db) { delete globalDb.__portfolioDb; delete globalDb.__portfolioDbInitialized; }
    vi.unstubAllEnvs();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('最初にSQLite接続先が一時パスであることを確認する', () => {
    db = connection.getDb();
    expect(db.name).toBe(join(directory, 'fundamentals.db'));
    expect(process.env.PM_FORBID_REAL_DB).toBe('1');
  });

  it('v4からv5へ既存の保有を維持して移行し、再実行も冪等になる', async () => {
    const before = db.prepare('SELECT * FROM holdings').all();
    db.exec('DROP TABLE fundamentals_cache; PRAGMA user_version = 4');
    const { runMigrations } = await import('@/lib/db/migrations');
    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(5);
    cache.writeFundamentalsCache(metrics);
    runMigrations(db);
    expect(cache.readFundamentalsCache('AAPL', 'US')).toEqual(metrics);
    expect(db.prepare('SELECT * FROM holdings').all()).toEqual(before);
  });

  it('24時間の直前まで返し、ちょうど24時間で失効する', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime('2026-10-23T00:00:00Z');
    cache.writeFundamentalsCache(metrics);
    vi.setSystemTime('2026-10-23T23:59:59.999Z');
    expect(cache.readFundamentalsCache(' aapl ', 'US')).toEqual(metrics);
    expect(cache.readFundamentalsCache('AAPL', 'JP')).toBeUndefined();
    vi.setSystemTime('2026-10-24T00:00:00Z');
    expect(cache.readFundamentalsCache('AAPL', 'US')).toBeUndefined();
  });

  it('壊れたJSONや未来時刻は利用せず再取得に回す', () => {
    cache.writeFundamentalsCache(metrics);
    db.prepare("UPDATE fundamentals_cache SET data_json = '{' WHERE symbol = 'AAPL'").run();
    expect(cache.readFundamentalsCache('AAPL', 'US')).toBeUndefined();
    cache.writeFundamentalsCache(metrics);
    db.prepare("UPDATE fundamentals_cache SET fetched_at = '9999-01-01' WHERE symbol = 'AAPL'").run();
    expect(cache.readFundamentalsCache('AAPL', 'US')).toBeUndefined();
  });

  it('キャッシュ命中時は外部通信せず、refresh:trueで取得して上書きする', async () => {
    cache.writeFundamentalsCache(metrics);
    const fetchStub = vi.fn().mockResolvedValue(Response.json({ timeseries: { result: [] } }));
    vi.stubGlobal('fetch', fetchStub);
    expect((await (await route.POST(request())).json()).fundamentals['AAPL|US']).toEqual(metrics);
    expect(fetchStub).not.toHaveBeenCalled();
    const result = await (await route.POST(request(true))).json();
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(result.fundamentals['AAPL|US'].next_earnings_date).toBeUndefined();
    expect(cache.readFundamentalsCache('AAPL', 'US')).toEqual(result.fundamentals['AAPL|US']);
    await route.POST(request());
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('失効後は再取得し、取得失敗を成功としてキャッシュしない', async () => {
    db.prepare("UPDATE fundamentals_cache SET fetched_at = '2000-01-01'").run();
    const fetchStub = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchStub);
    expect((await (await route.POST(request())).json()).fundamentals).toEqual({});
    expect(cache.readFundamentalsCache('AAPL', 'US')).toBeUndefined();
    await route.POST(request());
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('強制更新ではNasdaqのメモリーキャッシュも使わず決算日を取り直す', async () => {
    const fetchStub = vi.fn().mockImplementation(async (url: URL) => {
      if (url.hostname === 'api.nasdaq.com') return Response.json({ data: { rows: [{ symbol: 'AAPL' }] } });
      return Response.json({ timeseries: { result: [{
        meta: { type: ['quarterlyTotalRevenue'] },
        quarterlyTotalRevenue: [{ asOfDate: '2026-06-30', reportedValue: { raw: 10 } }],
      }] } });
    });
    vi.stubGlobal('fetch', fetchStub);
    const first = await (await route.POST(request(true))).json();
    expect(first.fundamentals['AAPL|US'].next_earnings_date).toBe('2026-10-30');
    expect(fetchStub).toHaveBeenCalledTimes(16);
    await route.POST(request(true));
    expect(fetchStub).toHaveBeenCalledTimes(32);
    await route.POST(request());
    expect(fetchStub).toHaveBeenCalledTimes(32);
  });

  it('キャッシュを同期・バックアップの対象に含めない', async () => {
    const { SYNC_TABLES } = await import('@/lib/db/sync-tables');
    const { exportBackupData } = await import('@/lib/db/backup');
    expect(SYNC_TABLES).not.toContain('fundamentals_cache');
    expect(Object.keys(exportBackupData())).not.toContain('fundamentals_cache');
    expect(Object.keys(exportBackupData())).not.toContain('fundamentalsCache');
  });
});
