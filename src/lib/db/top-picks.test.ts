import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockPrice, TopPickInput } from '@/types';

describe('トップピック DB・API・バックアップ（一時DB）', () => {
  let directory: string;
  let dbPath: string;
  let db: Database.Database;
  let api: typeof import('./index');
  let routes: typeof import('@/app/api/top-picks/route');
  let items: typeof import('@/app/api/top-picks/[id]/route');
  let remove: typeof import('@/app/api/top-picks/[id]/remove/route');
  let reorder: typeof import('@/app/api/top-picks/reorder/route');
  let migrations: typeof import('./migrations');
  const globals = globalThis as typeof globalThis & { __portfolioDb?: Database.Database; __portfolioDbInitialized?: boolean };
  const input: TopPickInput = { symbol: 'NVDA', market: 'US', pickedAt: '2026-10-01' };
  const quote: StockPrice = { symbol: 'NVDA', market: 'US', name: 'NVIDIA', price: 100, change: 1, change_percent: 1,
    currency: 'USD', updated_at: '2026-10-22T00:00:00.000Z' };
  const request = (method: string, body?: unknown, query = '') => new Request(`http://localhost/api/top-picks${query}`, {
    method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  const benchmark = (date: string, close: number) => db.prepare(`INSERT OR REPLACE INTO price_history
    (symbol, market, date, close, updated_at) VALUES ('^GSPC', 'INDEX', ?, ?, ?)`).run(date, close, quote.updated_at);

  beforeAll(async () => {
    expect(globals.__portfolioDb).toBeUndefined();
    directory = mkdtempSync(join(tmpdir(), 'portfolio-t20-'));
    dbPath = join(directory, 'top-picks.db');
    vi.stubEnv('PM_FORBID_REAL_DB', '1'); vi.stubEnv('SQLITE_DB_PATH', dbPath);
    api = await import('./index');
    db = api.getDb(); expect(db.name).toBe(dbPath);
    routes = await import('@/app/api/top-picks/route');
    items = await import('@/app/api/top-picks/[id]/route');
    remove = await import('@/app/api/top-picks/[id]/remove/route');
    reorder = await import('@/app/api/top-picks/reorder/route');
    migrations = await import('./migrations');
  });
  beforeEach(() => {
    expect(db.name).toBe(dbPath);
    db.exec('DELETE FROM top_picks; DELETE FROM stock_prices; DELETE FROM price_history; DELETE FROM fundamentals_cache; DELETE FROM memo_symbols; DELETE FROM stock_memos;');
    api.upsertStockPrices([quote]);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime('2026-10-23T03:00:00.000Z');
  });
  afterAll(() => {
    vi.useRealTimers(); db?.close(); delete globals.__portfolioDb; delete globals.__portfolioDbInitialized;
    vi.unstubAllEnvs(); if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('最初に接続先が一時パスであることを確認する', () => { expect(db.name).toBe(dbPath); });
  it('既存DBからのマイグレーションは冪等で既存データを維持する', () => {
    const pick = api.createTopPick(input);
    const holdings = db.prepare('SELECT COUNT(*) AS n FROM holdings').get();
    const version = db.pragma('user_version', { simple: true });
    db.exec('PRAGMA user_version = 8');
    migrations.runMigrations(db); migrations.runMigrations(db);
    expect(db.pragma('user_version', { simple: true })).toBe(version);
    expect(api.getTopPick(pick.id)).toEqual(pick);
    expect(db.prepare('SELECT COUNT(*) AS n FROM holdings').get()).toEqual(holdings);
  });
  it('トップピックを持たないv8のDBを既存行を保ったまま移行する', () => {
    const legacyPath = join(directory, 'legacy.db');
    const legacy = api.openDatabase(legacyPath);
    expect(legacy.name).toBe(legacyPath);
    try {
      legacy.exec("DROP TABLE top_picks; PRAGMA user_version = 8; INSERT INTO trade_ideas (id, symbol, market, note, created_at, updated_at) VALUES ('legacy', 'NVDA', 'US', '移行前', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')");
      migrations.runMigrations(legacy); migrations.runMigrations(legacy);
      expect(legacy.prepare('SELECT * FROM top_picks').all()).toEqual([]);
      expect(legacy.prepare('SELECT note FROM trade_ideas WHERE id = ?').get('legacy')).toEqual({ note: '移行前' });
      expect(legacy.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(9);
    } finally { legacy.close(); }
  });
  it('価格・日付の既定値と選定日以前の直近S&P終値を記録する', () => {
    benchmark('2026-09-30', 5000); benchmark('2026-10-02', 5500);
    const pick = api.createTopPick({ ...input, symbol: ' nvda ' });
    expect(pick).toMatchObject({ symbol: 'NVDA', rank: 1, picked_price: 100, benchmark_at_pick: 5000, updated_by: api.getDeviceId() });
    expect(api.createTopPick({ symbol: 'AMD', market: 'US', pickedPrice: 120 })).toMatchObject({ picked_at: '2026-10-23', benchmark_at_pick: 5500 });
    expect(() => api.createTopPick({ symbol: 'MISSING', market: 'US' })).toThrow('現在値');
    expect(api.createTopPick({ ...input, pickedAt: '2026-09-01' }).benchmark_at_pick).toBeNull();
  });
  it('11件目は409で拒否し、完全なID集合の並べ替えで連番を振る', async () => {
    const picks = Array.from({ length: 10 }, () => api.createTopPick(input));
    expect((await routes.POST(request('POST', input))).status).toBe(409);
    db.prepare('UPDATE top_picks SET rank = 5').run();
    const ordered = api.reorderTopPicks(picks.map((pick) => pick.id).reverse());
    expect(ordered.map((pick) => pick.id)).toEqual(picks.map((pick) => pick.id).reverse());
    expect(ordered.map((pick) => pick.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(() => api.reorderTopPicks([picks[0].id])).toThrow('全件');
    expect(() => api.reorderTopPicks(Array(10).fill(picks[0].id))).toThrow('全件');
    expect(api.listTopPicks().map((pick) => pick.id)).toEqual(ordered.map((pick) => pick.id));
  });
  it('順位が重複した場合はrank・updated_at順に表示する', () => {
    const first = api.createTopPick(input), second = api.createTopPick(input);
    db.prepare('UPDATE top_picks SET rank = 1, updated_at = ? WHERE id = ?').run('2026-10-23T00:00:00.000Z', second.id);
    expect(api.listTopPicks().map((pick) => pick.id)).toEqual([second.id, first.id]);
  });
  it('外した価格・指数は固定し、順位を詰め、同じ銘柄を再選定できる', () => {
    benchmark('2026-10-01', 5000);
    const first = api.createTopPick(input), second = api.createTopPick(input);
    benchmark('2026-10-23', 5500); api.upsertStockPrices([{ ...quote, price: 130 }]);
    expect(api.removeTopPick(first.id)).toMatchObject({ removed_price: 130, benchmark_at_remove: 5500, removed_at: '2026-10-23T03:00:00.000Z' });
    api.upsertStockPrices([{ ...quote, price: 200 }]);
    expect(api.listTopPicks('removed')[0]).toMatchObject({ removed_price: 130, benchmark_at_remove: 5500 });
    expect(api.listTopPicks()[0]).toMatchObject({ id: second.id, rank: 1 });
    expect(api.createTopPick(input)).toMatchObject({ rank: 2 });
    expect(() => api.removeTopPick(first.id)).toThrow('すでに');
  });
  it('価格未取得で外すことを拒否し、既存ピックを維持する', () => {
    const pick = api.createTopPick({ ...input, symbol: 'AMD', pickedPrice: 100 });
    expect(() => api.removeTopPick(pick.id)).toThrow('現在値');
    expect(api.getTopPick(pick.id)?.removed_at).toBeNull();
  });
  it('保有・登録状態と価格はsymbol|marketで判定し、DBに状態を持たない', () => {
    api.createTopPick({ symbol: 'NVDA', market: 'US', pickedPrice: 100 });
    api.createTopPick({ symbol: 'NVDA', market: 'JP', pickedPrice: 100 });
    db.prepare("INSERT INTO fundamentals_cache VALUES ('NVDA', 'US', ?, ?)").run(JSON.stringify({ next_earnings_date: '2026-10-28' }), quote.updated_at);
    expect(api.listTopPicks().find((pick) => pick.market === 'JP')).toMatchObject({ current_price: null });
    expect(api.listTopPicks().find((pick) => pick.market === 'US')).toMatchObject({ name: expect.any(String), next_earnings_date: '2026-10-28' });
    const columns = db.prepare('PRAGMA table_info(top_picks)').all() as { name: string }[];
    expect(columns.some((column) => column.name === 'state')).toBe(false);
    const symbol = 'T20STATE';
    api.createTopPick({ symbol, market: 'US', pickedPrice: 100 });
    const jpPick = api.createTopPick({ symbol, market: 'JP', pickedPrice: 100 });
    const watch = api.createWatchlistItem({ symbol, market: 'US', name: '登録テスト' });
    expect(api.listTopPicks().find((pick) => pick.symbol === symbol && pick.market === 'US')?.state).toBe('登録');
    expect(api.listTopPicks().find((pick) => pick.id === jpPick.id)?.state).toBe('未登録');
    const holding = api.createHolding({ portfolio_id: api.listPortfolios()[0].id, symbol, market: 'US', shares: 1, avg_cost: 100 });
    expect(api.listTopPicks().find((pick) => pick.symbol === symbol && pick.market === 'US')?.state).toBe('保有中');
    api.deleteHoldingById(holding.id); api.deleteWatchlistItemById(watch.id);
    expect(api.listTopPicks().find((pick) => pick.symbol === symbol && pick.market === 'US')?.state).toBe('未登録');
  });
  it('APIの追加→編集→並べ替え→外す→一覧→論理削除を完了する', async () => {
    const created = await routes.POST(request('POST', { ...input, thesis: '理由' }));
    expect(created.status).toBe(201);
    const { topPick } = await created.json();
    expect((await items.PATCH(request('PATCH', { thesis: '更新', targetPrice: 150 }), context(topPick.id))).status).toBe(200);
    expect((await reorder.PATCH(request('PATCH', { ids: [topPick.id] }))).status).toBe(200);
    expect((await remove.POST(request('POST'), context(topPick.id))).status).toBe(200);
    expect((await (await routes.GET(request('GET', undefined, '?status=removed'))).json()).topPicks).toHaveLength(1);
    expect((await items.DELETE(request('DELETE'), context(topPick.id))).status).toBe(200);
    expect(api.getTopPick(topPick.id)).toBeNull();
    expect(db.prepare('SELECT deleted_at, updated_by FROM top_picks WHERE id = ?').get(topPick.id)).toMatchObject({ deleted_at: expect.any(String), updated_by: api.getDeviceId() });
    expect((await items.PATCH(request('PATCH', { thesis: '復活しない' }), context(topPick.id))).status).toBe(404);
  });
  it.each([{ pickedPrice: -1 }, { pickedPrice: null }, { pickedAt: '2026-02-30' }, { pickedAt: '2099-01-01' }, { conviction: 'invalid' }, { targetPrice: 0 }, { market: 'INDEX' }, { reviewOn: 'invalid' }])('不正な入力を400にする: %j', async (patch) => {
    expect((await routes.POST(request('POST', { ...input, ...patch }))).status).toBe(400);
  });
  it('APIは不正JSON・状態・順位集合・読み取り専用列を拒否する', async () => {
    expect((await routes.POST(new Request('http://localhost', { method: 'POST', body: '{' }))).status).toBe(400);
    expect((await routes.GET(request('GET', undefined, '?status=other'))).status).toBe(400);
    expect((await reorder.PATCH(request('PATCH', { ids: ['unknown'] }))).status).toBe(400);
    const pick = api.createTopPick(input);
    expect((await items.PATCH(request('PATCH', { rank: 99 }), context(pick.id))).status).toBe(400);
    expect((await items.PATCH(request('PATCH', { pickedAt: '2026-09-30', pickedPrice: 80 }), context(pick.id))).status).toBe(200);
    expect(api.getTopPick(pick.id)).toMatchObject({ picked_at: '2026-09-30', picked_price: 80, benchmark_at_pick: null });
  });
  it('現在のピックの論理削除後も残りの順位を連番にする', () => {
    const first = api.createTopPick(input), second = api.createTopPick(input);
    api.deleteTopPick(first.id);
    expect(api.listTopPicks()).toHaveLength(1);
    expect(api.listTopPicks()[0]).toMatchObject({ id: second.id, rank: 1 });
  });
  it('バックアップは現在・外したピックを往復し、削除済みを除外する', () => {
    const active = api.createTopPick({ ...input, thesis: '理由', targetPrice: 180 });
    const removed = api.createTopPick(input); api.removeTopPick(removed.id);
    const deleted = api.createTopPick(input); api.deleteTopPick(deleted.id);
    const backup = api.exportBackupData();
    expect(backup.topPicks).toHaveLength(2);
    api.importBackupData(backup);
    expect(api.getTopPick(active.id)).toMatchObject({ thesis: '理由', target_price: 180 });
    expect(api.listTopPicks('removed')[0]).toMatchObject({ id: removed.id, removed_price: 100 });
    expect(api.getTopPick(deleted.id)).toBeNull();
    expect(() => api.importBackupData({ ...backup, topPicks: [{ ...backup.topPicks![0], picked_price: -1 }] })).toThrow();
    expect(api.listTopPicks()).toHaveLength(1);
    expect(() => api.importBackupData({ ...backup, topPicks: Array.from({ length: 11 }, (_, index) => ({ ...backup.topPicks!.find((pick) => pick.removed_at === null)!, id: `overflow-${index}` })) })).toThrow('10件');
    expect(api.listTopPicks()).toHaveLength(1);
    api.clearAllData(); expect(api.listTopPicks()).toEqual([]); expect(api.listTopPicks('removed')).toEqual([]);
  });
});
