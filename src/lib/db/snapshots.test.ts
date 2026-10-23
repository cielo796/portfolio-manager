import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { Candle, Holding, Portfolio, SnapshotInput, StockPrice } from '@/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const time = '2026-10-23T03:00:00.000Z';
const portfolios: Portfolio[] = ['a', 'b'].map((id) => ({ id, name: id, broker: '', created_at: time, updated_at: time }));
const holding = (id: string, account: string, symbol: string, market: Holding['market'], shares: number, cost: number): Holding => ({
  id, portfolio_id: account, symbol, market, shares, avg_cost: cost, sort_order: 0, created_at: time, updated_at: time,
});
const holdings = [holding('us', 'a', 'AAPL', 'US', 2, 100), holding('jp', 'b', '7203', 'JP', 10, 2000),
  holding('cash', 'a', 'CASH', 'US', 100, 1), holding('fx', 'b', 'EURUSD', 'FX', 10, 1)];
const quote = (symbol: string, market: StockPrice['market'], price: number): StockPrice => ({
  symbol, market, price, name: symbol, change: 0, change_percent: 0, currency: market === 'JP' ? 'JPY' : 'USD', updated_at: time,
});
const prices = { 'AAPL|US': quote('AAPL', 'US', 120), '7203|JP': quote('7203', 'JP', 2100),
  'EURUSD|FX': quote('EURUSD', 'FX', 1.1), 'USDJPY|FX': quote('USDJPY', 'FX', 150) };
const input: SnapshotInput = { snapshot_date: '2026-10-23', portfolio_id: null,
  market_value_jpy: 100, cost_basis_jpy: 80, cash_jpy: 0, usd_jpy: 150, is_estimate: 0 };

describe('資産記録DB・API', () => {
  let directory: string;
  let db: Database.Database;
  let snapshots: typeof import('./snapshots');
  let api: typeof import('./index');
  let history: typeof import('./price-history');
  const dbGlobal = globalThis as typeof globalThis & { __portfolioDb?: Database.Database; __portfolioDbInitialized?: boolean };
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'portfolio-t26-'));
    vi.stubEnv('PM_FORBID_REAL_DB', '1');
    vi.stubEnv('SQLITE_DB_PATH', join(directory, 'snapshots.db'));
    snapshots = await import('./snapshots');
    api = await import('./index');
    history = await import('./price-history');
    db = api.getDb();
    expect(db.name).toBe(join(directory, 'snapshots.db'));
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(time);
    db.exec('DELETE FROM portfolio_snapshots; DELETE FROM price_history;');
    api.importBackupData({ portfolios, holdings });
    api.upsertStockPrices(Object.values(prices));
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  afterAll(() => {
    db?.close();
    delete dbGlobal.__portfolioDb;
    delete dbGlobal.__portfolioDbInitialized;
    vi.unstubAllEnvs();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  it('最初に一時DBへの接続を確認する', () => { expect(db.name).toBe(join(directory, 'snapshots.db')); });
  it('円換算・米ドル現金・FX・口座別の合計を画面と同じ計算で記録する', () => {
    const values = snapshots.calculateSnapshots(portfolios, holdings, prices, '2026-10-23');
    expect(values.map((value) => [value.portfolio_id, value.market_value_jpy, value.cost_basis_jpy, value.cash_jpy]))
      .toEqual([[null, 73650, 66500, 15000], ['a', 51000, 45000, 15000], ['b', 22650, 21500, 0]]);
    expect(snapshots.snapshotToday(new Date('2026-10-22T15:00:00Z'))).toBe('2026-10-23');
  });
  it('欠損価格のある口座と全口座合計を記録せず、円換算レートも必須にする', () => {
    const missing = { ...prices };
    delete (missing as Record<string, StockPrice>)['AAPL|US'];
    expect(snapshots.calculateSnapshots(portfolios, holdings, missing, input.snapshot_date).map((value) => value.portfolio_id)).toEqual(['b']);
    delete (missing as Record<string, StockPrice>)['USDJPY|FX'];
    expect(snapshots.calculateSnapshots(portfolios, holdings, missing, input.snapshot_date)).toEqual([]);
    const jp = [holding('yen', 'b', 'CASH', 'JP', 1000, 1)];
    expect(snapshots.calculateSnapshots(portfolios, jp, {}, input.snapshot_date)[0]).toMatchObject({ market_value_jpy: 1000, usd_jpy: null });
  });
  it('同日は値が変わった時だけ同じIDを更新し、実測は推計より優先する', () => {
    expect(snapshots.upsertSnapshot({ ...input, is_estimate: 1 })).toBe(true);
    expect(snapshots.listSnapshots()[0].id).toBe('2026-10-23|ALL');
    vi.setSystemTime('2026-10-23T04:00:00Z');
    expect(snapshots.upsertSnapshot(input)).toBe(true);
    const actual = snapshots.listSnapshots()[0];
    vi.setSystemTime('2026-10-23T05:00:00Z');
    expect(snapshots.upsertSnapshot(input)).toBe(false);
    expect(snapshots.upsertSnapshot({ ...input, is_estimate: 1, market_value_jpy: 999 })).toBe(false);
    expect(snapshots.listSnapshots()[0]).toEqual(actual);
    expect(snapshots.upsertSnapshot({ ...input, market_value_jpy: 200 })).toBe(true);
    expect(snapshots.listSnapshots()).toHaveLength(1);
    expect(snapshots.listSnapshots()[0].created_at).toBe(time);
  });
  it('v9からの移行を冪等に実行し、索引と実測を保持する', async () => {
    const connection = await import('./connection');
    const migrations = await import('./migrations');
    const path = join(directory, 'v9.db');
    const legacy = connection.openDatabase(path);
    try {
      expect(legacy.name).toBe(path);
      legacy.exec('DROP TABLE portfolio_snapshots; PRAGMA user_version = 9;');
      migrations.runMigrations(legacy);
      const schema = legacy.prepare("SELECT sql FROM sqlite_master WHERE tbl_name = 'portfolio_snapshots' ORDER BY name").all();
      migrations.runMigrations(legacy);
      expect(legacy.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(10);
      expect(legacy.prepare("SELECT sql FROM sqlite_master WHERE tbl_name = 'portfolio_snapshots' ORDER BY name").all()).toEqual(schema);
      expect(legacy.prepare('PRAGMA index_list(portfolio_snapshots)').all()).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'idx_portfolio_snapshots_updated_at' }), expect.objectContaining({ name: 'idx_portfolio_snapshots_date' }),
      ]));
    } finally { legacy.close(); }
  });
  it('過去最大1年をキャッシュで埋め、既存の実測と再生成時の更新日時を保持する', async () => {
    const candles: Candle[] = [];
    for (let date = Date.parse('2025-10-16'); date <= Date.parse('2026-10-22'); date += 86400000) {
      candles.push({ date: new Date(date).toISOString().slice(0, 10), open: null, high: null, low: null, close: 1, volume: null });
    }
    for (const quote of Object.values(prices)) history.upsertPriceHistory(quote.symbol, quote.market, candles.map((candle) => ({ ...candle, close: quote.price })), time);
    snapshots.upsertSnapshot({ ...input, snapshot_date: '2026-10-01', market_value_jpy: 999 });
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network should not be needed'));
    const result = await snapshots.generateEstimateSnapshots();
    expect(result).toMatchObject({ written: 1094, skippedDays: 0, warnings: [] });
    expect(fetch).not.toHaveBeenCalled();
    const rows = snapshots.listSnapshots();
    expect(rows).toHaveLength(365);
    expect(rows[0]).toMatchObject({ snapshot_date: '2025-10-23', is_estimate: 1, market_value_jpy: 73650 });
    expect(rows.find((row) => row.snapshot_date === '2026-10-01')).toMatchObject({ market_value_jpy: 999, is_estimate: 0 });
    vi.setSystemTime('2026-10-23T05:00:00Z');
    expect((await snapshots.generateEstimateSnapshots()).written).toBe(0);
    expect(snapshots.listSnapshots()).toEqual(rows);
  });
  it('参考推移の価格欠損を明示し、APIとバックアップで実測を往復する', async () => {
    vi.spyOn(history, 'readPriceHistory').mockRejectedValue(new Error('offline'));
    const result = await snapshots.generateEstimateSnapshots();
    expect(result.skippedDays).toBe(365);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(snapshots.listSnapshots()).toEqual([]);
    const portfolioRoute = await import('@/app/api/portfolio-data/route');
    expect((await portfolioRoute.GET()).status).toBe(200);
    expect(snapshots.listSnapshots()[0]).toMatchObject({ market_value_jpy: 73650, is_estimate: 0 });
    const route = await import('@/app/api/snapshots/route');
    expect((await (await route.GET(new Request('http://localhost/api/snapshots?portfolioId=a'))).json()).snapshots[0].market_value_jpy).toBe(51000);
    expect((await route.GET(new Request('http://localhost/api/snapshots?portfolioId=missing'))).status).toBe(400);
    const backup = api.exportBackupData();
    expect(backup.portfolioSnapshots).toHaveLength(3);
    expect(JSON.stringify(backup.portfolioSnapshots)).not.toContain('updated_by');
    api.importBackupData(backup);
    expect(snapshots.listSnapshots()[0].market_value_jpy).toBe(73650);
    expect(() => api.importBackupData({ ...backup, portfolioSnapshots: [{ ...backup.portfolioSnapshots![0], id: 'wrong' }] })).toThrow('バックアップ');
    api.clearAllData();
    expect(snapshots.listSnapshots()).toEqual([]);
  });

  it('価格更新成功で同日の記録を更新し、値が同じなら更新日時を保持する', async () => {
    const route = await import('@/app/api/prices/route');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ chart: { result: [{ meta: { regularMarketPrice: 130 } }] } }));
    const request = () => new Request('http://localhost/api/prices', { method: 'POST', body: JSON.stringify({ symbols: [{ symbol: 'AAPL', market: 'US' }] }) });
    expect((await route.POST(request())).status).toBe(200);
    expect(snapshots.listSnapshots()[0].market_value_jpy).toBe(76650);
    const saved = snapshots.listSnapshots()[0];
    vi.setSystemTime('2026-10-23T05:00:00Z');
    expect((await route.POST(request())).status).toBe(200);
    expect(snapshots.listSnapshots()[0]).toEqual(saved);
  });

  it('比較指標APIが取得エラーと保存済み履歴を明示する', async () => {
    vi.spyOn(history, 'readPriceHistory').mockImplementation(async (symbol, market) => {
      if (symbol === '^N225') throw new Error('offline');
      return { symbol, market, currency: 'USD', candles: [{ date: '2026-10-22', open: null, high: null, low: null, close: 100, volume: null }], fetchedAt: time, stale: true };
    });
    const route = await import('@/app/api/snapshots/benchmarks/route');
    const data = await (await route.GET()).json();
    expect(data.sp500).toEqual([{ date: '2026-10-22', value: 100 }]);
    expect(data.nikkei).toEqual([]);
    expect(data.warnings).toHaveLength(3);
  });
});
