import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Candle } from '@/types';

const now = '2026-10-23T12:00:00.000Z';
const candle = (date: string, close = 100): Candle => ({ date, open: close - 1, high: close + 1, low: close - 2, close, volume: 10 });
const chart = (timeZone = 'America/New_York', currency = 'USD') => ({
  chart: { result: [{
    meta: { exchangeTimezoneName: timeZone, currency },
    timestamp: [Date.parse('2026-10-22T12:00:00Z') / 1000, Date.parse('2026-10-23T12:00:00Z') / 1000],
    indicators: { quote: [{ open: [99, 100], high: [102, 103], low: [98, 99], close: [100, 101] as Array<number | null>, volume: [10, null] }] },
  }] },
});

describe('価格履歴キャッシュとAPI', () => {
  let directory: string;
  let db: Database.Database;
  let history: typeof import('./price-history');
  let connection: typeof import('./connection');
  let fetchStub: ReturnType<typeof vi.fn>;
  const globalDb = globalThis as typeof globalThis & { __portfolioDb?: Database.Database; __portfolioDbInitialized?: boolean };

  beforeAll(async () => {
    expect(globalDb.__portfolioDb).toBeUndefined();
    directory = mkdtempSync(join(tmpdir(), 'portfolio-manager-t12-'));
    vi.stubEnv('SQLITE_DB_PATH', join(directory, 'history.db'));
    vi.stubEnv('PM_FORBID_REAL_DB', '1');
    connection = await import('./connection');
    history = await import('./price-history');
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    fetchStub = vi.fn().mockImplementation(async () => Response.json(chart()));
    vi.stubGlobal('fetch', fetchStub);
    if (db) {
      expect(db.name).toBe(join(directory, 'history.db'));
      db.exec('DELETE FROM price_history');
    }
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  afterAll(() => {
    db?.close();
    if (globalDb.__portfolioDb === db) {
      delete globalDb.__portfolioDb;
      delete globalDb.__portfolioDbInitialized;
    }
    vi.unstubAllEnvs();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('最初に接続先が一時パスであることを確認する', () => {
    db = connection.getDb();
    expect(db.name).toBe(join(directory, 'history.db'));
    expect(process.env.PM_FORBID_REAL_DB).toBe('1');
  });

  it('バージョン3から既存データを維持して移行し、再実行も冪等になる', async () => {
    const { runMigrations } = await import('./migrations');
    const before = db.prepare('SELECT * FROM holdings').all();
    db.exec('DROP TABLE price_history; PRAGMA user_version = 3');
    runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(4);
    history.upsertPriceHistory('^N225', 'INDEX', [candle('2026-10-22')], now);
    runMigrations(db);
    expect(history.listPriceHistory('^N225', 'INDEX')).toEqual([candle('2026-10-22')]);
    expect(db.prepare('SELECT * FROM holdings').all()).toEqual(before);
  });

  it('複合キーで上書きし、期間を両端込みの日付順で取得する', () => {
    history.upsertPriceHistory(' nvda ', 'US', [candle('2026-10-23'), candle('2026-10-21'), candle('2026-10-22')], now);
    history.upsertPriceHistory('NVDA', 'US', [candle('2026-10-22', 200)], '2026-10-23T12:01:00Z');
    history.upsertPriceHistory('NVDA', 'JP', [candle('2026-10-22', 300)], now);
    expect(history.listPriceHistory('NVDA', 'US', '2026-10-22', '2026-10-23')).toEqual([candle('2026-10-22', 200), candle('2026-10-23')]);
    expect(history.listPriceHistory('NVDA', 'JP')).toEqual([candle('2026-10-22', 300)]);
    expect(db.prepare('SELECT updated_at FROM price_history WHERE market = ? AND date = ?').get('US', '2026-10-22'))
      .toEqual({ updated_at: '2026-10-23T12:01:00Z' });
  });

  it('初回は5年取得し、取引所の現地日付を使ってnull終値を除外する', async () => {
    const payload = chart();
    payload.chart.result[0].timestamp[0] = Date.parse('2026-10-23T01:00:00Z') / 1000;
    payload.chart.result[0].indicators.quote[0].close = [100, null];
    fetchStub.mockResolvedValue(Response.json(payload));
    const data = await history.readPriceHistory('NVDA', 'US');
    expect(data).toMatchObject({ symbol: 'NVDA', market: 'US', currency: 'USD', fetchedAt: now, stale: false });
    expect(data.candles).toEqual([{ date: '2026-10-22', open: 99, high: 102, low: 98, close: 100, volume: 10 }]);
    const url = fetchStub.mock.calls[0][0] as URL;
    expect(url.searchParams.get('range')).toBe('5y');
    expect(url.searchParams.get('interval')).toBe('1d');
  });

  it.each([
    ['7203', 'JP', 'Asia/Tokyo', 'JPY', '7203.T'],
    ['7203.JP', 'JP', 'Asia/Tokyo', 'JPY', '7203.T'],
    ['USDJPY', 'FX', 'Europe/London', 'JPY', 'USDJPY%3DX'],
    ['^N225', 'INDEX', 'Asia/Tokyo', 'JPY', '%5EN225'],
  ] as const)('%sをYahoo形式にし、現地日付で保存する', async (symbol, market, timeZone, currency, yahooSymbol) => {
    fetchStub.mockImplementation(async () => Response.json(chart(timeZone, currency)));
    const data = await history.readPriceHistory(symbol, market);
    expect(data.currency).toBe(currency);
    expect(data.candles.map((item) => item.date)).toEqual(['2026-10-22', '2026-10-23']);
    expect((fetchStub.mock.calls[0][0] as URL).pathname).toContain(yahooSymbol);
  });

  it('古い最新日付の現地0時から現在までを差分取得する（夏時間を含む）', async () => {
    history.upsertPriceHistory('NVDA', 'US', [candle('2026-10-19')], '2026-10-19T21:00:00Z');
    await history.readPriceHistory('NVDA', 'US');
    const url = fetchStub.mock.calls[0][0] as URL;
    expect(url.searchParams.get('period1')).toBe(String(Date.parse('2026-10-19T04:00:00Z') / 1000));
    expect(url.searchParams.get('period2')).toBe(String(Date.parse(now) / 1000));
    expect(url.searchParams.has('range')).toBe(false);
    expect(history.listPriceHistory('NVDA', 'US')[0].date).toBe('2026-10-19');
    expect(history.historyFetchParams({ date: '2026-01-02', updated_at: now }, new Date(now), 'America/New_York')?.period1)
      .toBe(String(Date.parse('2026-01-02T05:00:00Z') / 1000));
  });

  it('当日または前営業日の最新取得から15分未満なら通信せず、15分で5日再取得する', async () => {
    for (const date of ['2026-10-22', '2026-10-23']) {
      history.upsertPriceHistory('NVDA', 'US', [candle(date)], now);
      expect((await history.readPriceHistory('NVDA', 'US')).stale).toBe(false);
    }
    expect(fetchStub).not.toHaveBeenCalled();
    vi.setSystemTime('2026-10-23T12:15:00Z');
    await history.readPriceHistory('NVDA', 'US');
    expect((fetchStub.mock.calls[0][0] as URL).searchParams.get('range')).toBe('5d');
    expect(history.listPriceHistory('NVDA', 'US').at(-1)?.close).toBe(101);
    expect(history.historyFetchParams({ date: '2026-10-23', updated_at: '2026-10-26T11:59:00Z' }, new Date('2026-10-26T12:00:00Z'), 'America/New_York')).toBeNull();
  });

  it('失敗時は保存済みの値と取得時刻を返し、データなしなら失敗する', async () => {
    history.upsertPriceHistory('NVDA', 'US', [candle('2026-10-19')], '2026-10-19T21:00:00Z');
    fetchStub.mockRejectedValue(new Error('offline'));
    expect(await history.readPriceHistory('NVDA', 'US')).toMatchObject({ stale: true, fetchedAt: '2026-10-19T21:00:00Z', candles: [candle('2026-10-19')] });
    await expect(history.readPriceHistory('EMPTY', 'US')).rejects.toThrow('price_history_unavailable');
  });

  it.each([
    () => new Response(null, { status: 429 }),
    () => new Response('invalid json'),
    () => Response.json({ chart: { result: null, error: { code: 'Not Found' } } }),
    () => Response.json({ chart: { result: [{ meta: {}, timestamp: [] }] } }),
  ])('不正・空応答をキャッシュしない', async (response) => {
    fetchStub.mockImplementation(async () => response());
    await expect(history.readPriceHistory('BROKEN', 'US')).rejects.toThrow('price_history_unavailable');
    expect(history.listPriceHistory('BROKEN', 'US')).toEqual([]);
  });

  it('同一銘柄の同時取得をまとめ、market取得と共有するYahoo同時通信数を4以下にする', async () => {
    let active = 0;
    let maxActive = 0;
    fetchStub.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return Response.json({ chart: { result: [{ ...chart().chart.result[0], meta: {
        ...chart().chart.result[0].meta, regularMarketPrice: 101, chartPreviousClose: 99,
      } }] } });
    });
    const { createMarketReader, MARKET_SYMBOLS } = await import('@/lib/market');
    await Promise.all([
      history.readPriceHistory('SAME', 'US'), history.readPriceHistory('SAME', 'US'),
      ...Array.from({ length: 10 }, (_, index) => history.readPriceHistory(`TEST${index}`, 'US')),
      createMarketReader()(),
    ]);
    expect(maxActive).toBe(4);
    expect(fetchStub).toHaveBeenCalledTimes(11 + MARKET_SYMBOLS.length);
  });

  it('chart APIは日足・週足・月足、400、キャッシュ付き200、未取得502を返す', async () => {
    const { GET } = await import('@/app/api/chart/route');
    for (const interval of ['d', 'w', 'm']) {
      const response = await GET(new Request(`http://localhost/api/chart?symbol=NVDA&market=US&range=1y&interval=${interval}`));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ symbol: 'NVDA', market: 'US', stale: false, candles: expect.any(Array) });
    }
    for (const query of ['symbol=NVDA&market=BAD', 'symbol=NVDA&market=US&range=2y', 'symbol=NVDA&market=US&interval=h', 'market=US']) {
      expect((await GET(new Request(`http://localhost/api/chart?${query}`))).status).toBe(400);
    }
    fetchStub.mockRejectedValue(new Error('offline'));
    vi.setSystemTime('2026-10-23T12:16:00Z');
    const fallback = await GET(new Request('http://localhost/api/chart?symbol=NVDA&market=US'));
    expect(fallback.status).toBe(200);
    expect(await fallback.json()).toMatchObject({ stale: true, fetchedAt: now });
    expect((await GET(new Request('http://localhost/api/chart?symbol=EMPTY&market=US'))).status).toBe(502);
  });

  it('sparklines APIは末尾の取引日終値と1年高安を返し、部分失敗・空配列に対応する', async () => {
    const { POST } = await import('@/app/api/sparklines/route');
    history.upsertPriceHistory('NVDA', 'US', [candle('2025-10-22', 10000), candle('2026-10-21', 10), candle('2026-10-22', 20), candle('2026-10-23', 30)], now);
    fetchStub.mockRejectedValue(new Error('offline'));
    const request = (body: unknown) => new Request('http://localhost/api/sparklines', { method: 'POST', body: JSON.stringify(body) });
    const response = await POST(request({ items: [{ symbol: 'nvda', market: 'US' }, { symbol: 'EMPTY', market: 'JP' }], days: 2 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [
      { symbol: 'NVDA', market: 'US', closes: [20, 30], high52w: 31, low52w: 8 },
      { symbol: 'EMPTY', market: 'JP', closes: [] },
    ] });
    expect(await (await POST(request({ items: [] }))).json()).toEqual({ items: [] });
    const defaults = await POST(request({ items: [{ symbol: 'NVDA', market: 'US' }] }));
    expect((await defaults.json()).items[0].closes).toEqual([10000, 10, 20, 30]);
    for (const body of [null, {}, { items: 'x' }, { items: [null] }, { items: [{ symbol: 'NVDA', market: 'BAD' }] },
      { items: [], days: 0 }, { items: [], days: 1.5 }, { items: Array(101).fill({ symbol: 'NVDA', market: 'US' }) }]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect((await POST(new Request('http://localhost/api/sparklines', { method: 'POST', body: '{' }))).status).toBe(400);
  });
});
