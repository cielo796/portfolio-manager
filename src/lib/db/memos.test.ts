import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

describe('銘柄メモ・API・バックアップ（一時DB）', () => {
  let api: typeof import('./index');
  let routes: typeof import('@/app/api/memos/route');
  let itemRoutes: typeof import('@/app/api/memos/[id]/route');
  let db: Database.Database;
  let directory: string;
  let dbPath: string;
  const globals = globalThis as typeof globalThis & { __portfolioDb?: Database.Database; __portfolioDbInitialized?: boolean };
  const symbol = { symbol: 'NVDA', market: 'US' as const };
  const input = { title: '決算の確認', body: '成長率を確認\n次回も比較', tag: 'earnings' as const, symbols: [symbol] };
  const quote = { ...symbol, name: 'NVIDIA', price: 142.5, change: 1, change_percent: 1,
    currency: 'USD', updated_at: '2026-10-01T00:00:00.000Z' };
  const request = (method: string, body?: unknown) => new Request('http://localhost/api/memos', { method,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeAll(async () => {
    expect(globals.__portfolioDb).toBeUndefined();
    directory = mkdtempSync(join(tmpdir(), 'portfolio-t19-'));
    dbPath = join(directory, 'memos.db');
    vi.stubEnv('PM_FORBID_REAL_DB', '1');
    vi.stubEnv('SQLITE_DB_PATH', dbPath);
    api = await import('./index');
    db = api.getDb();
    expect(db.name).toBe(dbPath);
    routes = await import('@/app/api/memos/route');
    itemRoutes = await import('@/app/api/memos/[id]/route');
  });
  beforeEach(() => {
    expect(db.name).toBe(dbPath);
    db.exec('DELETE FROM memo_symbols; DELETE FROM stock_memos; DELETE FROM stock_prices;');
  });
  afterAll(() => {
    db?.close();
    delete globals.__portfolioDb;
    delete globals.__portfolioDbInitialized;
    vi.unstubAllEnvs();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('最初に一時DBへの接続を確認する', () => { expect(db.name).toBe(dbPath); });
  it('現在値を市場別のキーで記録し、価格のない銘柄を省く', () => {
    api.upsertStockPrices([quote, { ...quote, market: 'JP', price: 1805, currency: 'JPY' }]);
    const memo = api.createMemo({ ...input, transactionId: 'trade', symbols: [symbol, { ...symbol, market: 'JP' }, { symbol: 'MISSING', market: 'US' }] });
    expect(memo.price_snapshot).toEqual({ 'NVDA|US': { price: 142.5, currency: 'USD', at: quote.updated_at }, 'NVDA|JP': { price: 1805, currency: 'JPY', at: quote.updated_at } });
    expect(memo.transaction_id).toBe('trade');
    expect(memo.updated_by).toBe(api.getDeviceId());
    expect(memo.updated_pc).toBe(api.getDeviceName());
    expect(memo.symbols).toHaveLength(3);
  });
  it('銘柄の付け外し・再追加でも初回の価格と紐づけIDを維持する', () => {
    api.upsertStockPrices([quote]);
    const memo = api.createMemo(input);
    const original = db.prepare('SELECT id FROM memo_symbols WHERE memo_id = ?').get(memo.id);
    api.upsertStockPrices([{ ...quote, price: 999 }, { ...quote, symbol: 'AMD', price: 238.6 }]);
    const changed = api.updateMemoById(memo.id, { symbols: [{ symbol: 'AMD', market: 'US' }], body: '更新本文' })!;
    expect(changed.symbols).toEqual([{ symbol: 'AMD', market: 'US' }]);
    expect(changed.price_snapshot['NVDA|US'].price).toBe(142.5);
    expect(changed.price_snapshot['AMD|US'].price).toBe(238.6);
    expect(db.prepare("SELECT deleted_at FROM memo_symbols WHERE memo_id = ? AND symbol = 'NVDA'").get(memo.id)).toEqual({ deleted_at: expect.any(String) });
    api.updateMemoById(memo.id, { symbols: [symbol, symbol] });
    expect(db.prepare("SELECT id FROM memo_symbols WHERE memo_id = ? AND symbol = 'NVDA'").get(memo.id)).toEqual(original);
    expect(api.getMemoById(memo.id)?.symbols).toEqual([symbol]);
    expect(api.getMemoById(memo.id)?.price_snapshot['NVDA|US'].price).toBe(142.5);
  });
  it('編集だけでは、作成時に価格がなかった銘柄の価格を後付けしない', () => {
    const memo = api.createMemo(input);
    api.upsertStockPrices([quote]);
    expect(api.updateMemoById(memo.id, { title: '編集' })?.price_snapshot).toEqual({});
  });
  it('親と紐づけを論理削除し、遅れて到着した有効な紐づけも一覧に出さない', () => {
    const memo = api.createMemo(input);
    expect(api.deleteMemoById(memo.id)).toBe(true);
    expect(api.deleteMemoById(memo.id)).toBe(false);
    expect(api.updateMemoById(memo.id, { body: '削除後' })).toBeNull();
    expect(db.prepare('SELECT deleted_at, updated_by FROM memo_symbols WHERE memo_id = ?').get(memo.id)).toEqual({ deleted_at: expect.any(String), updated_by: api.getDeviceId() });
    db.prepare('UPDATE memo_symbols SET deleted_at = NULL WHERE memo_id = ?').run(memo.id);
    expect(api.listMemos({ symbol: 'NVDA', market: 'US' })).toEqual([]);
    expect(api.exportBackupData().memoSymbols).toBeUndefined();
  });
  it('銘柄・市場・タグ・タイトルと本文の部分一致・limitで絞り込む', () => {
    const memo = api.createMemo(input);
    api.createMemo({ title: '別のアイデア', body: '100%_を文字どおり検索', tag: 'idea', symbols: [{ symbol: 'NVDA', market: 'JP' }] });
    expect(api.listMemos({ symbol: 'nvda', market: 'US', tag: 'earnings', q: '成長率' }).map((item) => item.id)).toEqual([memo.id]);
    expect(api.listMemos({ q: '決算' })).toHaveLength(1);
    expect(api.listMemos({ q: '100%_' })).toHaveLength(1);
    expect(api.listMemos({ q: '見つからない' })).toEqual([]);
    expect(api.listMemos({ tag: 'review' })).toEqual([]);
    expect(api.listMemos({ limit: 1 })).toHaveLength(1);
  });
  it('新しい作成日時から並べ、本文の編集で順序を変えない', () => {
    const older = api.createMemo(input);
    const newer = api.createMemo({ ...input, title: '新しいメモ' });
    db.prepare('UPDATE stock_memos SET created_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', older.id);
    api.updateMemoById(older.id, { body: '直近の編集' });
    expect(api.listMemos().map((memo) => memo.id)).toEqual([newer.id, older.id]);
  });
  it('バックアップ往復で記録株価と紐づけを保持し、論理削除後も復元する', () => {
    api.upsertStockPrices([quote]);
    const memo = api.createMemo(input);
    const backup = api.exportBackupData();
    expect(backup.stockMemos).toHaveLength(1);
    expect(backup.memoSymbols).toHaveLength(1);
    expect(JSON.stringify(backup)).not.toContain('updated_by');
    api.deleteMemoById(memo.id);
    api.importBackupData(JSON.parse(JSON.stringify(backup)));
    expect(api.getMemoById(memo.id)).toMatchObject({ title: input.title, body: input.body, symbols: [symbol], price_snapshot: memo.price_snapshot, updated_by: api.getDeviceId() });
    api.importBackupData(JSON.parse(JSON.stringify(backup)));
    expect(api.listMemos()).toHaveLength(1);
    expect(db.prepare('SELECT * FROM memo_symbols WHERE deleted_at IS NULL').all()).toHaveLength(1);
    const before = api.listMemos();
    expect(() => api.importBackupData({ ...backup, memoSymbols: [backup.memoSymbols![0], backup.memoSymbols![0]] })).toThrow();
    expect(api.listMemos()).toEqual(before);
  });
  it('APIの作成→一覧→部分更新→削除と404が通る', async () => {
    const response = await routes.POST(request('POST', input));
    expect(response.status).toBe(201);
    const { memo } = await response.json();
    expect((await (await routes.GET(new Request('http://localhost/api/memos?symbol=NVDA&market=US&tag=earnings&q=成長率&limit=3'))).json()).memos).toHaveLength(1);
    const updated = await itemRoutes.PATCH(request('PATCH', { body: '更新', tag: null, symbols: [] }), context(memo.id));
    expect(updated.status).toBe(200);
    expect((await updated.json()).memo).toMatchObject({ title: input.title, body: '更新', tag: null, symbols: [] });
    expect((await itemRoutes.DELETE(request('DELETE'), context(memo.id))).status).toBe(200);
    expect((await itemRoutes.PATCH(request('PATCH', { title: '更新' }), context(memo.id))).status).toBe(404);
    expect((await itemRoutes.DELETE(request('DELETE'), context(memo.id))).status).toBe(404);
  });
  it.each([null, [], {}, { ...input, title: ' ' }, { ...input, body: 42 }, { ...input, tag: 'bad' }, { ...input, symbols: [{ symbol: 'NVDA', market: 'INDEX' }] }, { ...input, symbols: [{ symbol: 42, market: 'US' }] }, { ...input, price_snapshot: {} }])('APIは不正な入力を400にする (%j)', async (value) => {
    expect((await routes.POST(request('POST', value))).status).toBe(400);
    expect(api.listMemos()).toEqual([]);
  });
  it('不正JSON・空の更新・不正な絞り込みを400にする', async () => {
    expect((await routes.POST(new Request('http://localhost/api/memos', { method: 'POST', body: '{' }))).status).toBe(400);
    expect((await itemRoutes.PATCH(request('PATCH', {}), context('missing'))).status).toBe(400);
    for (const query of ['limit=0', 'limit=NaN', 'limit=1.5', 'tag=bad', 'market=INDEX']) expect((await routes.GET(new Request(`http://localhost/api/memos?${query}`))).status).toBe(400);
  });
  it('マイグレーション再実行はメモを変えず、紐づけは外部キーを持たない', async () => {
    api.createMemo(input);
    const before = api.listMemos();
    const { runMigrations } = await import('./migrations');
    runMigrations(db);
    expect(api.listMemos()).toEqual(before);
    expect(db.pragma('foreign_key_list(memo_symbols)')).toEqual([]);
    expect(db.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(8);
  });
  it('v7のDBからv8へ移行しても既存の保有を変更しない', async () => {
    const path = join(directory, 'legacy-v7.db');
    const legacy = api.openDatabase(path);
    try {
      expect(legacy.name).toBe(path);
      legacy.exec(`DROP TABLE memo_symbols; DROP TABLE stock_memos; PRAGMA user_version = 7;
        INSERT INTO portfolios (id, name, created_at, updated_at) VALUES ('legacy', '旧口座', '2026-01-01', '2026-01-01');
        INSERT INTO holdings (id, portfolio_id, symbol, market, shares, avg_cost, memo, created_at, updated_at)
          VALUES ('holding', 'legacy', 'NVDA', 'US', 10, 100, '元のひとこと', '2026-01-01', '2026-01-01');`);
      const before = legacy.prepare('SELECT * FROM holdings').all();
      const { runMigrations } = await import('./migrations');
      runMigrations(legacy);
      runMigrations(legacy);
      expect(legacy.prepare('SELECT * FROM holdings').all()).toEqual(before);
      expect(legacy.prepare('SELECT * FROM stock_memos').all()).toEqual([]);
      expect(legacy.prepare('SELECT * FROM memo_symbols').all()).toEqual([]);
    } finally { legacy.close(); }
  });
});
