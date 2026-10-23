import { mkdtempSync, rmSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNC_TABLES } from './sync-tables';
import type { BackupData } from './backup';

const initialTime = '2026-01-01T00:00:00.000Z';
const laterTime = '2026-01-02T00:00:00.000Z';
const fixture: BackupData = {
  portfolios: [{ id: 'account', name: '口座', broker: '', created_at: initialTime, updated_at: initialTime }],
  holdings: [{
    id: 'holding', portfolio_id: 'account', symbol: 'AAPL', market: 'US', name: 'Apple',
    shares: 1, avg_cost: 100, sort_order: 0, sector: 'technology',
    created_at: initialTime, updated_at: initialTime,
  }],
  transactions: [{
    id: 'transaction', portfolio_id: 'account', symbol: 'AAPL', market: 'US', type: 'buy',
    shares: 1, price: 100, total_amount: 100, fees: 0, transaction_date: '2026-01-01', created_at: initialTime,
  }],
  tradeIdeas: [{ id: 'idea', symbol: 'AAPL', market: 'US', note: '確認', created_at: initialTime, updated_at: initialTime }],
  watchlistItems: [{
    id: 'watch', symbol: 'MSFT', market: 'US', list_key: 'main', sort_order: 0,
    sector: 'technology', target_price: 100, memo: '古いメモ', created_at: initialTime, updated_at: initialTime,
  }],
  tickerPresets: [{ id: 'preset', symbol: 'NVDA', market: 'US', name: 'Nvidia', created_at: initialTime, updated_at: initialTime }],
};

describe('同期スキーマと論理削除', () => {
  let api: typeof import('@/lib/db');
  let db: Database.Database;
  let directory: string;
  let runMigrations: typeof import('./migrations').runMigrations;
  const dbGlobal = globalThis as typeof globalThis & {
    __portfolioDb?: Database.Database;
    __portfolioDbInitialized?: boolean;
  };

  function row(table: string, id: string) {
    return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  }

  beforeAll(async () => {
    expect(dbGlobal.__portfolioDb).toBeUndefined();
    directory = mkdtempSync(join(tmpdir(), 'portfolio-manager-t06-'));
    vi.stubEnv('SQLITE_DB_PATH', join(directory, 'test.db'));
    api = await import('@/lib/db');
    runMigrations = (await import('./migrations')).runMigrations;
    db = (await import('./connection')).getDb();
    expect(db.name).toBe(join(directory, 'test.db'));
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(initialTime);
    api.importBackupData(fixture);
  });

  afterAll(() => {
    vi.useRealTimers();
    db?.close();
    if (dbGlobal.__portfolioDb === db) {
      delete dbGlobal.__portfolioDb;
      delete dbGlobal.__portfolioDbInitialized;
    }
    vi.unstubAllEnvs();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('バージョン2の既存データを保持して移行し、再実行しても変わらない', () => {
    const legacy = new Database(join(directory, 'legacy.db'));
    try {
      // 現行スキーマから同期列を除き、直前のバージョンを再現する
      runMigrations(legacy);
      // v7で追加したトリガー・索引・列を先に取り除く
      legacy.exec(`
        DROP TRIGGER IF EXISTS keep_ledger_holding;
        DROP INDEX IF EXISTS idx_transactions_holding;
        ALTER TABLE transactions DROP COLUMN realized_pl;
        ALTER TABLE transactions DROP COLUMN fx_rate;
        ALTER TABLE transactions DROP COLUMN holding_id;
        ALTER TABLE holdings DROP COLUMN ledger_opening_shares;
        ALTER TABLE holdings DROP COLUMN ledger_opening_cost;
      `);
      for (const table of SYNC_TABLES) {
        legacy.exec(`
          DROP INDEX idx_${table}_updated_at;
          ALTER TABLE ${table} DROP COLUMN deleted_at;
          ALTER TABLE ${table} DROP COLUMN updated_by;
        `);
      }
      legacy.exec(`
        ALTER TABLE transactions DROP COLUMN updated_at;
        DROP TABLE sync_meta;
        DROP TABLE sync_peers;
        DROP TABLE sync_log;
        PRAGMA user_version = 2;
        INSERT INTO portfolios VALUES ('old-account', '旧口座', '', NULL, '${initialTime}', '${initialTime}');
        INSERT INTO holdings VALUES ('old-holding', 'old-account', 'AAPL', NULL, 'US', 1, 100, 0, 'technology', NULL, '${initialTime}', '${initialTime}');
        INSERT INTO transactions VALUES ('old-transaction', 'old-account', 'AAPL', 'US', 'buy', 1, 100, 100, 0, '2026-01-01', NULL, '${initialTime}');
        INSERT INTO trade_ideas VALUES ('old-idea', 'AAPL', 'US', '旧メモ', '${initialTime}', '${initialTime}');
        INSERT INTO watchlist_items VALUES ('old-watch', 'MSFT', NULL, 'US', 'main', 0, 'technology', NULL, NULL, '${initialTime}', '${initialTime}');
        INSERT INTO ticker_presets VALUES ('old-preset', 'NVDA', 'US', NULL, '${initialTime}', '${initialTime}');
      `);
      runMigrations(legacy);
      expect(legacy.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(3);
      expect(legacy.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name = 'keep_ledger_holding'").get())
        .toEqual({ name: 'keep_ledger_holding' });
      for (const table of SYNC_TABLES) {
        const rows = legacy.prepare(`SELECT deleted_at, updated_by FROM ${table}`).all();
        expect(rows).toEqual([{ deleted_at: null, updated_by: null }]);
        expect(legacy.prepare(`PRAGMA index_list(${table})`).all()).toEqual(expect.arrayContaining([
          expect.objectContaining({ name: `idx_${table}_updated_at` }),
        ]));
      }
      expect(legacy.prepare('SELECT updated_at FROM transactions').get()).toEqual({ updated_at: initialTime });
      expect(legacy.prepare('PRAGMA table_info(transactions)').all()).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'updated_at', type: 'TEXT', notnull: 1 }),
      ]));
      const identity = legacy.prepare('SELECT * FROM sync_meta ORDER BY key').all();
      runMigrations(legacy);
      expect(legacy.prepare('SELECT * FROM sync_meta ORDER BY key').all()).toEqual(identity);
      expect(legacy.pragma('foreign_key_check')).toEqual([]);
    } finally {
      legacy.close();
    }
  });

  it('デバイス情報は永続化され、不足したキーのみ再生成される', () => {
    const id = api.getDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    db.prepare("UPDATE sync_meta SET value = '作業PC' WHERE key = 'device_name'").run();
    expect(api.getDeviceName()).toBe('作業PC');
    db.prepare("DELETE FROM sync_meta WHERE key = 'device_name'").run();
    expect(api.getDeviceName()).toBe(hostname());
    expect(api.getDeviceId()).toBe(id);
    const reader = new Database(db.name, { readonly: true });
    try {
      expect(reader.prepare("SELECT value FROM sync_meta WHERE key = 'device_id'").get()).toEqual({ value: id });
    } finally {
      reader.close();
    }
  });

  it('新規DBの初期データも自分のデバイスによる現在時刻の更新になる', async () => {
    const fresh = new Database(join(directory, 'seed.db'));
    try {
      runMigrations(fresh);
      const { seedIfEmpty } = await import('./seed');
      seedIfEmpty(fresh);
      const identity = fresh.prepare("SELECT value FROM sync_meta WHERE key = 'device_id'").get() as { value: string };
      for (const table of ['portfolios', 'holdings', 'transactions']) {
        const rows = fresh.prepare(`SELECT updated_at, updated_by FROM ${table}`).all();
        expect(rows.length).toBeGreaterThan(0);
        for (const item of rows) expect(item).toEqual({ updated_at: initialTime, updated_by: identity.value });
      }
      const count = fresh.prepare('SELECT COUNT(*) AS count FROM holdings').get();
      seedIfEmpty(fresh);
      expect(fresh.prepare('SELECT COUNT(*) AS count FROM holdings').get()).toEqual(count);
    } finally {
      fresh.close();
    }
  });

  it('削除行は一覧・更新から除外され、繰り返し削除はfalseになる', () => {
    vi.setSystemTime(laterTime);
    const cases = [
      ['holdings', 'holding', api.deleteHoldingById, api.listHoldings],
      ['trade_ideas', 'idea', api.deleteTradeIdeaById, api.listTradeIdeas],
      ['watchlist_items', 'watch', api.deleteWatchlistItemById, api.listWatchlistItems],
      ['ticker_presets', 'preset', api.deleteTickerPresetById, api.listTickerPresets],
    ] as const;
    for (const [table, id, remove, list] of cases) {
      expect(remove(id)).toBe(true);
      expect(remove(id)).toBe(false);
      expect(remove('missing')).toBe(false);
      expect(list()).toEqual([]);
      expect(row(table, id)).toMatchObject({ deleted_at: laterTime, updated_at: laterTime, updated_by: api.getDeviceId() });
    }
    expect(api.updateHoldingById('holding', { shares: 99 })).toBeNull();
    expect(api.updateTradeIdeaById('idea', { note: '更新' })).toBeNull();
    expect(api.updateWatchlistItemById('watch', { memo: '更新' })).toBeNull();
    vi.setSystemTime('2026-01-03T00:00:00.000Z');
    api.updateHoldingsOrder([{ id: 'holding', sort_order: 99 }]);
    api.updateWatchlistItemsLayout([{ id: 'watch', list_key: 'sub1', sort_order: 99 }]);
    expect(row('holdings', 'holding')).toMatchObject({ sort_order: 0, updated_at: laterTime });
    expect(row('watchlist_items', 'watch')).toMatchObject({ sort_order: 0, updated_at: laterTime });
  });

  it('同じ銘柄の再追加はIDを維持して入力値で復活し、有効行の重複追加は失敗する', () => {
    api.deleteWatchlistItemById('watch');
    api.deleteTickerPresetById('preset');
    vi.setSystemTime(laterTime);
    expect(api.createWatchlistItem({ symbol: ' msft ', market: 'US', list_key: 'sub2', memo: '新しいメモ' }).id).toBe('watch');
    expect(api.createTickerPreset({ symbol: ' nvda ', market: 'US', name: '新社名' }).id).toBe('preset');
    expect(row('watchlist_items', 'watch')).toMatchObject({
      deleted_at: null, target_price: null, memo: '新しいメモ', list_key: 'sub2', updated_at: laterTime, updated_by: api.getDeviceId(),
    });
    expect(row('ticker_presets', 'preset')).toMatchObject({ deleted_at: null, name: '新社名', updated_at: laterTime, updated_by: api.getDeviceId() });
    expect(() => api.createWatchlistItem({ symbol: 'MSFT', market: 'US' })).toThrow('UNIQUE constraint failed');
    expect(() => api.createTickerPreset({ symbol: 'NVDA', market: 'US' })).toThrow('UNIQUE constraint failed');
  });

  it('作成・更新・並べ替えは全対象で現在時刻と自分のデバイスIDを記録する', () => {
    vi.setSystemTime(laterTime);
    const holding = api.createHolding({ portfolio_id: 'account', symbol: 'IBM', market: 'US', shares: 2, avg_cost: 10 });
    const transaction = api.createTransaction({ portfolio_id: 'account', symbol: 'IBM', market: 'US', type: 'buy', shares: 2, price: 10, transaction_date: '2026-01-02' });
    const idea = api.createTradeIdea({ symbol: 'IBM', market: 'US', note: '作成' });
    const watch = api.createWatchlistItem({ symbol: 'IBM', market: 'US' });
    const preset = api.createTickerPreset({ symbol: 'IBM', market: 'US' });
    for (const item of [holding, transaction, idea, watch, preset]) {
      expect(item).toMatchObject({ updated_at: laterTime, updated_by: api.getDeviceId() });
    }
    expect(api.updateHoldingById('holding', { shares: 3 })).toMatchObject({ updated_at: laterTime, updated_by: api.getDeviceId() });
    expect(api.updateTradeIdeaById('idea', { note: '変更' })).toMatchObject({ updated_at: laterTime, updated_by: api.getDeviceId() });
    expect(api.updateWatchlistItemById('watch', { memo: '変更' })).toMatchObject({ updated_at: laterTime, updated_by: api.getDeviceId() });
    const orderTime = '2026-01-03T00:00:00.000Z';
    vi.setSystemTime(orderTime);
    api.updateHoldingsOrder([{ id: 'holding', sort_order: 5 }]);
    api.updateWatchlistItemsLayout([{ id: 'watch', list_key: 'sub3', sort_order: 7 }]);
    expect(row('holdings', 'holding')).toMatchObject({ sort_order: 5, updated_at: orderTime, updated_by: api.getDeviceId() });
    expect(row('watchlist_items', 'watch')).toMatchObject({ list_key: 'sub3', sort_order: 7, updated_at: orderTime, updated_by: api.getDeviceId() });
  });

  it('社名補完で削除済みの候補・保有を参照しない', () => {
    const watch = api.createWatchlistItem({ symbol: 'AAPL', market: 'US' });
    const preset = api.createTickerPreset({ symbol: 'AAPL', market: 'US', name: '候補社名' });
    expect(api.listWatchlistItems().find((item) => item.id === watch.id)?.name).toBe('候補社名');
    api.deleteTickerPresetById(preset.id);
    expect(api.listWatchlistItems().find((item) => item.id === watch.id)?.name).toBe('Apple');
    api.deleteHoldingById('holding');
    expect(api.listWatchlistItems().find((item) => item.id === watch.id)?.name).toBeNull();
  });

  it('全データ削除でも行を保持し、キャッシュを消してモック口座を再作成する', () => {
    db.prepare(`INSERT INTO stock_prices (symbol, market, name, price, change, change_percent, currency, updated_at)
      VALUES ('ABC', 'US', 'ABC', 1, 0, 0, 'USD', ?)`).run(initialTime);
    db.prepare(`INSERT INTO news_items VALUES ('news', 'ABC', '記事', NULL, 'source', 'https://example.com', NULL, ?, NULL)`).run(initialTime);
    vi.setSystemTime(laterTime);
    api.clearAllData();
    expect(api.listPortfolios().map((item) => item.id)).not.toContain('account');
    for (const list of [api.listHoldings, api.listTransactions, api.listTradeIdeas, api.listWatchlistItems, api.listTickerPresets]) {
      expect(list()).toEqual([]);
    }
    for (const [table, id] of [['portfolios', 'account'], ['holdings', 'holding'], ['transactions', 'transaction'], ['trade_ideas', 'idea'], ['watchlist_items', 'watch'], ['ticker_presets', 'preset']]) {
      expect(row(table, id)).toMatchObject({ deleted_at: laterTime, updated_at: laterTime, updated_by: api.getDeviceId() });
    }
    expect(api.listPortfolios().length).toBeGreaterThan(0);
    expect(api.listPortfolios()).toEqual(expect.arrayContaining([expect.objectContaining({ updated_at: laterTime, updated_by: api.getDeviceId() })]));
    expect(api.listStockPrices()).toEqual({});
    expect(api.listNewsItems()).toEqual([]);
    const getDb = dbGlobal.__portfolioDb;
    dbGlobal.__portfolioDbInitialized = false;
    expect(api.listHoldings()).toEqual([]);
    expect(dbGlobal.__portfolioDb).toBe(getDb);
  });

  it('バックアップは同期情報を含まず、取込は旧行を論理削除して自分の更新として復活する', () => {
    db.prepare(`INSERT OR REPLACE INTO sync_peers (id, device_id, name, base_url, secret, created_at, updated_at)
      VALUES ('peer', 'remote', '相手', 'http://localhost:3000', 'secret-value', ?, ?)`).run(initialTime, initialTime);
    db.prepare(`INSERT OR REPLACE INTO sync_log (id, peer_device_id, started_at, status) VALUES ('log', 'remote', ?, 'running')`).run(initialTime);
    const backup = api.exportBackupData();
    expect(Object.keys(backup).sort()).toEqual(['holdings', 'portfolios', 'tickerPresets', 'tradeIdeas', 'transactions', 'watchlistItems']);
    expect(JSON.stringify(backup)).not.toContain('secret-value');
    expect(JSON.stringify(backup)).not.toContain('updated_by');
    api.createHolding({ portfolio_id: 'account', symbol: 'OLD', market: 'US', shares: 1, avg_cost: 1 });
    const extra = api.createWatchlistItem({ symbol: 'OLD', market: 'US' });
    vi.setSystemTime(laterTime);
    api.importBackupData(JSON.parse(JSON.stringify(backup)));
    const restored = api.exportBackupData();
    for (const key of Object.keys(backup) as Array<keyof BackupData>) expect(restored[key]).toHaveLength(backup[key].length);
    for (const table of SYNC_TABLES) {
      expect(db.prepare(`SELECT updated_at, updated_by FROM ${table} WHERE deleted_at IS NULL`).all())
        .toEqual([expect.objectContaining({ updated_at: laterTime, updated_by: api.getDeviceId() })]);
    }
    expect(row('watchlist_items', extra.id)).toMatchObject({ deleted_at: laterTime });
    expect(db.prepare('SELECT secret FROM sync_peers WHERE id = ?').get('peer')).toEqual({ secret: 'secret-value' });
    expect(row('sync_log', 'log')).toBeDefined();
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('取込元の同一銘柄が異なるIDでも一意制約を守って既存IDで復活する', () => {
    api.importBackupData({ ...fixture,
      watchlistItems: [{ ...fixture.watchlistItems[0], id: 'remote-watch', memo: '別PC' }],
      tickerPresets: [{ ...fixture.tickerPresets[0], id: 'remote-preset', name: '別PC' }],
    });
    expect(api.listWatchlistItems()).toEqual([expect.objectContaining({ id: 'watch', memo: '別PC' })]);
    expect(api.listTickerPresets()).toEqual([expect.objectContaining({ id: 'preset', name: '別PC' })]);
  });

  it('取込の途中で制約違反が起きても論理削除と復活をロールバックする', () => {
    const before = api.exportBackupData();
    vi.setSystemTime(laterTime);
    db.exec(`CREATE TEMP TRIGGER reject_holding BEFORE UPDATE ON holdings
      WHEN NEW.shares = 999 BEGIN SELECT RAISE(ABORT, '取込テスト'); END`);
    try {
      expect(() => api.importBackupData({ ...fixture, holdings: [{ ...fixture.holdings[0], shares: 999 }] })).toThrow('取込テスト');
    } finally {
      db.exec('DROP TRIGGER reject_holding');
    }
    expect(api.exportBackupData()).toEqual(before);
  });

  it('保持期限より古い削除行だけを消し、子行のある口座をCASCADEで消さない', () => {
    api.importBackupData({});
    const cutoff = '2026-01-02T00:00:00.000Z';
    db.prepare('UPDATE portfolios SET deleted_at = ? WHERE id = ?').run(initialTime, 'account');
    db.prepare('UPDATE holdings SET deleted_at = ? WHERE id = ?').run(cutoff, 'holding');
    db.prepare('UPDATE transactions SET deleted_at = NULL WHERE id = ?').run('transaction');
    db.prepare('UPDATE trade_ideas SET deleted_at = ? WHERE id = ?').run('2026-01-03T00:00:00.000Z', 'idea');
    vi.setSystemTime('2026-04-02T00:00:00.000Z');
    api.purgeDeletedRows();
    expect(row('watchlist_items', 'watch')).toBeUndefined();
    expect(row('ticker_presets', 'preset')).toBeUndefined();
    expect(row('holdings', 'holding')).toBeDefined();
    expect(row('transactions', 'transaction')).toBeDefined();
    expect(row('trade_ideas', 'idea')).toBeDefined();
    expect(row('portfolios', 'account')).toBeDefined();
    expect(api.listPortfolios().length).toBeGreaterThan(0);
    db.prepare('UPDATE holdings SET deleted_at = ? WHERE portfolio_id = ?').run(initialTime, 'account');
    db.prepare('UPDATE transactions SET deleted_at = ? WHERE portfolio_id = ?').run(initialTime, 'account');
    api.purgeDeletedRows();
    expect(row('portfolios', 'account')).toBeUndefined();
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(() => api.purgeDeletedRows(-1)).toThrow(RangeError);
  });

  it('削除APIは初回200・2回目404を維持し、再追加APIは同じIDを返す', async () => {
    const routes = [
      ['holding', await import('@/app/api/holdings/[id]/route')],
      ['idea', await import('@/app/api/trade-ideas/[id]/route')],
      ['watch', await import('@/app/api/watchlist/[id]/route')],
      ['preset', await import('@/app/api/tickers/[id]/route')],
    ] as const;
    for (const [id, route] of routes) {
      const context = { params: Promise.resolve({ id }) };
      expect((await route.DELETE(new Request('http://localhost'), context)).status).toBe(200);
      expect((await route.DELETE(new Request('http://localhost'), context)).status).toBe(404);
    }
    for (const [path, symbol, id, field] of [
      ['watchlist', 'MSFT', 'watch', 'watchlistItem'], ['tickers', 'NVDA', 'preset', 'tickerPreset'],
    ]) {
      const route = path === 'watchlist' ? await import('@/app/api/watchlist/route') : await import('@/app/api/tickers/route');
      const request = () => new Request(`http://localhost/api/${path}`, { method: 'POST', body: JSON.stringify({ symbol, market: 'US' }) });
      const response = await route.POST(request());
      expect(response.status).toBe(201);
      expect((await response.json())[field].id).toBe(id);
      expect((await route.POST(request())).status).toBe(409);
    }
  });
});
