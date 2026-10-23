import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncChanges, SyncPeer, SyncPing, SyncRow, SyncTable, SyncTransport } from '@/types';

const initial = '2026-10-22T00:00:00.000Z';
const edited = '2026-10-22T00:01:00.000Z';
const latest = '2026-10-22T00:02:00.000Z';
const now = '2026-10-22T00:03:00.000Z';

describe('LAN同期エンジン・API', () => {
  let directory: string;
  let sequence = 0;
  let a: Database.Database;
  let b: Database.Database;
  let peer: SyncPeer;
  let sync: typeof import('./changes');
  let engine: typeof import('./engine');
  let auth: typeof import('./auth');
  let pairing: typeof import('./pairing');
  let api: typeof import('./api');
  let connection: typeof import('@/lib/db/connection');
  let transportModule: typeof import('./transport');

  function identity(db: Database.Database): string {
    return (db.prepare("SELECT value FROM sync_meta WHERE key = 'device_id'").get() as { value: string }).value;
  }
  function row(db: Database.Database, table: SyncTable, id: string) {
    return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as SyncRow | undefined;
  }
  function put(db: Database.Database, table: SyncTable, values: Record<string, string | number | null>) {
    const data = { created_at: initial, updated_at: initial, updated_by: identity(db), ...values };
    const columns = Object.keys(data);
    db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(data));
  }
  function idea(db: Database.Database, note = '初期') {
    put(db, 'trade_ideas', { id: 'idea', symbol: 'AAPL', market: 'US', note });
  }
  function update(db: Database.Database, note: string, time: string) {
    db.prepare('UPDATE trade_ideas SET note = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(note, time, identity(db), 'idea');
  }
  function direct(): SyncTransport {
    return {
      ping: async () => ({ deviceId: identity(b), deviceName: 'B', serverTime: new Date().toISOString(), schemaVersion: b.pragma('user_version', { simple: true }) as number }),
      changes: async (since) => ({ changes: sync.collectChanges(b, since, identity(a)), serverTime: new Date().toISOString() }),
      apply: async (changes, lastSyncedAt) => sync.applyChanges(b, changes, { lastSyncedAt }),
    };
  }
  function request(action: import('./api').SyncAction, method = 'POST', body?: unknown, db = a, headers?: HeadersInit) {
    return api.handleSync(new Request(`http://127.0.0.1/api/sync/${action}`, {
      method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), action, undefined, db);
  }

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'portfolio-t07-'));
    vi.stubEnv('SQLITE_DB_PATH', join(directory, 'guard.db'));
    // DB関連は一時パスを設定してから動的に読む
    connection = await import('@/lib/db/connection');
    sync = await import('./changes');
    engine = await import('./engine');
    auth = await import('./auth');
    pairing = await import('./pairing');
    api = await import('./api');
    transportModule = await import('./transport');
  });
  beforeEach(() => {
    const aPath = join(directory, `${sequence++}-a.db`);
    const bPath = join(directory, `${sequence++}-b.db`);
    a = connection.openDatabase(aPath);
    b = connection.openDatabase(bPath);
    // 操作前に必ず接続先を検証する
    expect(a.name).toBe(aPath);
    expect(b.name).toBe(bPath);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    peer = pairing.savePeer(a, identity(b), 'B', 'http://127.0.0.1:3102', 'ab'.repeat(32));
    pairing.savePeer(b, identity(a), 'A', 'http://127.0.0.1:3101', peer.secret);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    a?.close();
    b?.close();
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('最初に接続先が一時DBであることを確認する', () => {
    expect(a.name.startsWith(directory)).toBe(true);
    expect(b.name.startsWith(directory)).toBe(true);
    expect(a.name).not.toBe(b.name);
    expect(a.prepare('SELECT COUNT(*) AS n FROM holdings').get()).toEqual({ n: 0 });
  });

  it('トップピックの追加・並べ替え・編集・外す・再選定・削除を2台に反映する', async () => {
    put(a, 'top_picks', { id: 'pick-one', symbol: 'NVDA', market: 'US', rank: 1, picked_at: '2026-10-01', picked_price: 100, benchmark_at_pick: 5000 });
    put(a, 'top_picks', { id: 'pick-two', symbol: 'AMD', market: 'US', rank: 2, picked_at: '2026-10-01', picked_price: 80 });
    await engine.runSync(a, peer, direct());
    expect(row(b, 'top_picks', 'pick-one')).toEqual(row(a, 'top_picks', 'pick-one'));
    vi.setSystemTime('2026-10-22T00:04:00.000Z');
    const reorderedAt = new Date().toISOString();
    b.prepare('UPDATE top_picks SET rank = 3 - rank, thesis = ?, updated_at = ?, updated_by = ?').run('Bで確認', reorderedAt, identity(b));
    await engine.runSync(a, peer, direct());
    expect(row(a, 'top_picks', 'pick-two')).toMatchObject({ rank: 1, thesis: 'Bで確認' });
    expect(sync.collectChanges(a, null).top_picks).toEqual(sync.collectChanges(b, null).top_picks);
    vi.setSystemTime('2026-10-22T00:05:00.000Z');
    const removedAt = new Date().toISOString();
    a.prepare('UPDATE top_picks SET removed_at = ?, removed_price = 130, benchmark_at_remove = 5500, updated_at = ?, updated_by = ? WHERE id = ?')
      .run(removedAt, removedAt, identity(a), 'pick-one');
    put(a, 'top_picks', { id: 'pick-again', symbol: 'NVDA', market: 'US', rank: 2, picked_at: '2026-10-22', picked_price: 130, updated_at: removedAt });
    await engine.runSync(a, peer, direct());
    expect(row(b, 'top_picks', 'pick-one')).toMatchObject({ removed_at: removedAt, removed_price: 130, benchmark_at_remove: 5500 });
    expect(b.prepare("SELECT id FROM top_picks WHERE symbol = 'NVDA'").all()).toHaveLength(2);
    vi.setSystemTime('2026-10-22T00:06:00.000Z');
    b.prepare('UPDATE top_picks SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?').run(new Date().toISOString(), new Date().toISOString(), identity(b), 'pick-again');
    await engine.runSync(a, peer, direct());
    expect(row(a, 'top_picks', 'pick-again')?.deleted_at).toBe(new Date().toISOString());
    expect(sync.collectChanges(a, null).top_picks).toEqual(sync.collectChanges(b, null).top_picks);
  });

  it('トップピックは両PCで順位が重複しても行を統合せず、同時編集は後勝ちになる', async () => {
    put(a, 'top_picks', { id: 'a-pick', symbol: 'NVDA', market: 'US', rank: 1, picked_at: '2026-10-01', picked_price: 100 });
    put(b, 'top_picks', { id: 'b-pick', symbol: 'NVDA', market: 'US', rank: 1, picked_at: '2026-10-01', picked_price: 100 });
    await engine.runSync(a, peer, direct());
    expect(a.prepare('SELECT rank FROM top_picks').all()).toEqual([{ rank: 1 }, { rank: 1 }]);
    vi.setSystemTime('2026-10-22T00:06:00.000Z');
    a.prepare('UPDATE top_picks SET thesis = ?, updated_at = ?, updated_by = ? WHERE id = ?').run('A編集', '2026-10-22T00:04:00.000Z', identity(a), 'a-pick');
    b.prepare('UPDATE top_picks SET thesis = ?, updated_at = ?, updated_by = ? WHERE id = ?').run('B編集', '2026-10-22T00:05:00.000Z', identity(b), 'a-pick');
    const result = await engine.runSync(a, peer, direct());
    expect(result.conflicts).toBe(1);
    expect(row(a, 'top_picks', 'a-pick')?.thesis).toBe('B編集');
    expect(sync.collectChanges(a, null).top_picks).toEqual(sync.collectChanges(b, null).top_picks);
  });

  it('両PCの独立追加が同期後に10件を超える場合は全体を取り消し、両PCの行を保つ', () => {
    for (let i = 0; i < 6; i++) {
      put(a, 'top_picks', { id: `a-${i}`, symbol: 'NVDA', market: 'US', rank: i + 1, picked_at: '2026-10-01', picked_price: 100 });
      put(b, 'top_picks', { id: `b-${i}`, symbol: 'AMD', market: 'US', rank: i + 1, picked_at: '2026-10-01', picked_price: 80 });
    }
    idea(b);
    expect(() => sync.applyChanges(a, sync.collectChanges(b, null), { lastSyncedAt: null })).toThrow('10件');
    expect(sync.collectChanges(a, null).top_picks).toHaveLength(6);
    expect(sync.collectChanges(b, null).top_picks).toHaveLength(6);
    expect(row(a, 'trade_ideas', 'idea')).toBeUndefined();
    b.prepare("UPDATE top_picks SET removed_at = ?, removed_price = 80 WHERE id IN ('b-0', 'b-1')").run(edited);
    sync.applyChanges(a, sync.collectChanges(b, null), { lastSyncedAt: null });
    expect(a.prepare('SELECT COUNT(*) AS n FROM top_picks WHERE removed_at IS NULL AND deleted_at IS NULL').get()).toEqual({ n: 10 });
    expect(sync.collectChanges(a, null).top_picks).toHaveLength(12);
  });

  it('全6テーブルを外部キー順に送信し、Bの編集をAへ反映する', async () => {
    put(a, 'portfolios', { id: 'account', name: '口座' });
    put(a, 'holdings', { id: 'holding', portfolio_id: 'account', symbol: 'AAPL', market: 'US', shares: 1, avg_cost: 100 });
    put(a, 'transactions', { id: 'transaction', portfolio_id: 'account', symbol: 'AAPL', market: 'US', type: 'buy', shares: 1, price: 100, total_amount: 100, transaction_date: '2026-10-22' });
    idea(a);
    put(a, 'ticker_presets', { id: 'preset', symbol: 'AAPL', market: 'US' });
    put(a, 'watchlist_items', { id: 'watch', symbol: 'AAPL', market: 'US' });
    const first = await engine.runSync(a, peer, direct());
    expect(first.sent).toBe(6);
    expect(sync.collectChanges(a, null)).toEqual(sync.collectChanges(b, null));
    expect(b.pragma('foreign_key_check')).toEqual([]);
    vi.setSystemTime('2026-10-22T00:04:00.000Z');
    update(b, 'Bから編集', new Date().toISOString());
    const second = await engine.runSync(a, peer, direct());
    expect(second.received).toBe(1);
    expect(row(a, 'trade_ideas', 'idea')).toEqual(row(b, 'trade_ideas', 'idea'));
    expect(row(a, 'trade_ideas', 'idea')?.note).toBe('Bから編集');
  });

  it('論理削除を伝え、2回目の同期は受信・送信とも0件になる', async () => {
    idea(a);
    await engine.runSync(a, peer, direct());
    a.prepare('UPDATE trade_ideas SET deleted_at = ?, updated_at = ? WHERE id = ?').run(edited, edited, 'idea');
    await engine.runSync(a, peer, direct());
    expect(b.prepare('SELECT * FROM trade_ideas WHERE deleted_at IS NULL').all()).toEqual([]);
    expect(row(b, 'trade_ideas', 'idea')?.deleted_at).toBe(edited);
    expect(await engine.runSync(a, peer, direct())).toMatchObject({ received: 0, sent: 0, conflicts: 0 });
  });

  it.each([false, true])('両PCの競合は新しい編集が残り、競合は1件（受信勝ち=%s）', async (remoteWins) => {
    idea(a);
    sync.applyChanges(b, sync.collectChanges(a, null), { lastSyncedAt: null });
    a.prepare('UPDATE sync_peers SET last_synced_at = ?').run(initial);
    update(a, 'A編集', remoteWins ? edited : latest);
    update(b, 'B編集', remoteWins ? latest : edited);
    const result = await engine.runSync(a, peer, direct());
    expect(result.conflicts).toBe(1);
    expect(result.conflictDetails[0].winner).toBe(remoteWins ? 'remote' : 'local');
    expect(row(a, 'trade_ideas', 'idea')?.note).toBe(remoteWins ? 'B編集' : 'A編集');
    expect(row(a, 'trade_ideas', 'idea')).toEqual(row(b, 'trade_ideas', 'idea'));
  });

  it('同時刻の競合はデバイスIDが大きい側が勝つ', async () => {
    idea(a);
    sync.applyChanges(b, sync.collectChanges(a, null), { lastSyncedAt: null });
    update(a, 'A編集', latest);
    update(b, 'B編集', latest);
    const winner = identity(a) > identity(b) ? 'A編集' : 'B編集';
    await engine.runSync(a, peer, direct());
    expect(row(a, 'trade_ideas', 'idea')?.note).toBe(winner);
    expect(row(b, 'trade_ideas', 'idea')?.note).toBe(winner);
  });

  it.each(['watchlist_items', 'ticker_presets'] as const)('%sの同一銘柄は小さいIDへ統合し、新しい内容を維持する', async (table) => {
    put(a, table, { id: 'a-id', symbol: 'AAPL', market: 'US', name: '古い内容' });
    put(b, table, { id: 'z-id', symbol: 'AAPL', market: 'US', name: '新しい内容', updated_at: latest });
    await engine.runSync(a, peer, direct());
    const second = await engine.runSync(a, peer, direct());
    expect(second).toMatchObject({ received: 0, sent: 0 });
    expect(a.prepare(`SELECT * FROM ${table}`).all()).toEqual(b.prepare(`SELECT * FROM ${table}`).all());
    expect(a.prepare(`SELECT id, name FROM ${table}`).all()).toEqual([{ id: 'a-id', name: '新しい内容' }]);
  });

  it('相手側applyで判明したID統合を応答から反映する', async () => {
    put(a, 'watchlist_items', { id: 'z-id', symbol: 'AAPL', market: 'US', memo: '新しい', updated_at: latest });
    put(b, 'watchlist_items', { id: 'a-id', symbol: 'AAPL', market: 'US', memo: '古い' });
    // 過去の変更として今回のpullには含まれない相手行を再現する
    a.prepare('UPDATE sync_peers SET last_pulled_until = ?').run('2026-10-22T00:10:00.000Z');
    await engine.runSync(a, peer, direct());
    expect(a.prepare('SELECT id, memo FROM watchlist_items').all()).toEqual([{ id: 'a-id', memo: '新しい' }]);
    expect(sync.collectChanges(a, null)).toEqual(sync.collectChanges(b, null));
  });

  it('メモと複数の紐づけが2台間で同期され、編集と論理削除も伝わる', async () => {
    put(a, 'stock_memos', { id: 'memo', title: 'GPU比較', body: '初回', tag: 'idea', price_snapshot: '{"NVDA|US":{"price":142.5,"currency":"USD","at":"2026-10-22T00:00:00.000Z"}}' });
    put(a, 'memo_symbols', { id: 'nvda', memo_id: 'memo', symbol: 'NVDA', market: 'US' });
    put(a, 'memo_symbols', { id: 'amd', memo_id: 'memo', symbol: 'AMD', market: 'US' });
    await engine.runSync(a, peer, direct());
    expect(sync.collectChanges(a, null)).toEqual(sync.collectChanges(b, null));
    vi.setSystemTime('2026-10-22T00:04:00.000Z');
    b.prepare('UPDATE stock_memos SET body = ?, updated_at = ?, updated_by = ? WHERE id = ?').run('Bから更新', new Date().toISOString(), identity(b), 'memo');
    await engine.runSync(a, peer, direct());
    expect(row(a, 'stock_memos', 'memo')?.body).toBe('Bから更新');
    expect(row(a, 'stock_memos', 'memo')?.price_snapshot).toContain('142.5');
    vi.setSystemTime('2026-10-22T00:05:00.000Z');
    for (const table of ['stock_memos', 'memo_symbols']) a.prepare(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, updated_by = ?`).run(new Date().toISOString(), new Date().toISOString(), identity(a));
    await engine.runSync(a, peer, direct());
    expect(b.prepare('SELECT * FROM stock_memos WHERE deleted_at IS NULL').all()).toEqual([]);
    expect(b.prepare('SELECT * FROM memo_symbols WHERE deleted_at IS NULL').all()).toEqual([]);
  });

  it.each([false, true])('同一メモの同一銘柄は小さいIDの1行に収束する（小さいID側が新しい=%s）', async (smallNewer) => {
    put(a, 'stock_memos', { id: 'memo', title: 'メモ', body: '' });
    sync.applyChanges(b, sync.collectChanges(a, null), { lastSyncedAt: null });
    put(a, 'memo_symbols', { id: 'a-link', memo_id: 'memo', symbol: 'NVDA', market: 'US', updated_at: smallNewer ? latest : initial });
    put(b, 'memo_symbols', { id: 'z-link', memo_id: 'memo', symbol: 'NVDA', market: 'US', updated_at: smallNewer ? initial : latest });
    put(b, 'stock_memos', { id: 'other-memo', title: '別メモ', body: '' });
    put(b, 'memo_symbols', { id: 'other-link', memo_id: 'other-memo', symbol: 'NVDA', market: 'US' });
    await engine.runSync(a, peer, direct());
    expect(sync.collectChanges(a, null)).toEqual(sync.collectChanges(b, null));
    expect(a.prepare("SELECT id, updated_at FROM memo_symbols WHERE memo_id = 'memo'").all()).toEqual([{ id: 'a-link', updated_at: latest }]);
    expect(a.prepare('SELECT * FROM memo_symbols').all()).toHaveLength(2);
    expect(await engine.runSync(a, peer, direct())).toMatchObject({ received: 0, sent: 0 });
  });

  it('紐づけは親より先に到着でき、親が後で届いても保持される', () => {
    put(a, 'memo_symbols', { id: 'link', memo_id: 'late-parent', symbol: 'NVDA', market: 'US' });
    sync.applyChanges(b, sync.collectChanges(a, null), { lastSyncedAt: null });
    expect(row(b, 'memo_symbols', 'link')).toBeDefined();
    put(a, 'stock_memos', { id: 'late-parent', title: '遅れた親', body: '' });
    sync.applyChanges(b, sync.collectChanges(a, null), { lastSyncedAt: null });
    expect(row(b, 'stock_memos', 'late-parent')?.title).toBe('遅れた親');
    expect(b.pragma('foreign_key_check')).toEqual([]);
  });

  it('sinceは厳密な後方比較、更新元の除外はNULLを保持する', () => {
    idea(a);
    expect(sync.collectChanges(a, initial).trade_ideas).toHaveLength(0);
    expect(sync.collectChanges(a, null, identity(a)).trade_ideas).toHaveLength(0);
    a.prepare('UPDATE trade_ideas SET updated_by = NULL').run();
    expect(sync.collectChanges(a, null, identity(a)).trade_ideas).toHaveLength(1);
  });

  it('ID統合前の古い行を再受信しても行を書き直さない', () => {
    put(a, 'watchlist_items', { id: 'a-id', symbol: 'AAPL', market: 'US', memo: '新しい', updated_at: latest });
    put(b, 'watchlist_items', { id: 'z-id', symbol: 'AAPL', market: 'US', memo: '古い' });
    const changes = sync.collectChanges(b, null);
    const first = sync.applyChanges(a, changes, { lastSyncedAt: now });
    const second = sync.applyChanges(a, changes, { lastSyncedAt: now });
    expect(first.applied).toBe(0);
    expect(second).toMatchObject({ applied: 0, skipped: 1 });
    expect(second.canonicalChanges.watchlist_items).toEqual([expect.objectContaining({ id: 'a-id', memo: '新しい' })]);
  });

  it('旧DBのミリ秒なし日時を保存し、ミリ秒あり日時と時刻順に比較する', () => {
    put(a, 'trade_ideas', { id: 'idea', symbol: 'AAPL', market: 'US', note: '旧DB', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' });
    const changes = sync.collectChanges(a, null);
    expect(sync.applyChanges(b, changes, { lastSyncedAt: null }).applied).toBe(1);
    expect(row(b, 'trade_ideas', 'idea')?.updated_at).toBe('2024-01-01T00:00:00Z');
    expect(sync.collectChanges(a, '2024-01-01T00:00:00.000Z').trade_ideas).toEqual([]);
    expect(sync.collectChanges(a, '2024-01-01T00:00:00.001Z').trade_ideas).toEqual([]);
    update(b, '新しい', '2024-01-01T00:00:00.001Z');
    expect(sync.applyChanges(a, sync.collectChanges(b, null), { lastSyncedAt: null }).applied).toBe(1);
    expect(row(a, 'trade_ideas', 'idea')?.note).toBe('新しい');
  });

  it('不正行と外部キー違反は全体を反映せずロールバックする', () => {
    idea(a);
    put(a, 'portfolios', { id: 'account', name: '口座' });
    put(a, 'holdings', { id: 'holding', portfolio_id: 'account', symbol: 'AAPL', market: 'US', shares: 1, avg_cost: 10 });
    const changes = sync.collectChanges(a, null);
    changes.holdings[0].portfolio_id = 'missing';
    expect(() => sync.applyChanges(b, changes, { lastSyncedAt: null })).toThrow('FOREIGN KEY');
    expect(b.prepare('SELECT * FROM portfolios').all()).toEqual([]);
    expect(b.prepare('SELECT * FROM trade_ideas').all()).toEqual([]);
    expect(() => sync.applyChanges(b, { ...changes, sync_meta: [] } as SyncChanges, { lastSyncedAt: null })).toThrow('同期対象外');
    changes.holdings[0].updated_at = 'invalid';
    expect(() => sync.applyChanges(b, changes, { lastSyncedAt: null })).toThrow('行データ');
  });

  it('5分重ねて収集し、相手時刻と収集開始時刻を別々に保存する', async () => {
    a.prepare('UPDATE sync_peers SET last_pulled_until = ?, last_pushed_until = ?').run(now, now);
    idea(b);
    const transport = direct();
    const changes = vi.spyOn(transport, 'changes');
    const result = await engine.runSync(a, peer, transport);
    expect(changes).toHaveBeenCalledWith('2026-10-21T23:58:00.000Z');
    expect(result.received).toBe(1);
    expect(a.prepare('SELECT last_pulled_until, last_pushed_until FROM sync_peers').get())
      .toEqual({ last_pulled_until: now, last_pushed_until: now });
  });

  it('相手のスキーマ版数が違う・不明のときは409で止まり、データと同期位置を変えない', async () => {
    idea(a);
    const local = a.pragma('user_version', { simple: true }) as number;
    const before = sync.collectChanges(a, null);
    const beforePeer = a.prepare('SELECT * FROM sync_peers WHERE id = ?').get(peer.id);
    const mismatch = direct();
    mismatch.ping = async () => ({ deviceId: identity(b), deviceName: 'B', serverTime: new Date().toISOString(), schemaVersion: local - 1 });
    await expect(engine.runSync(a, peer, mismatch)).rejects.toMatchObject({ status: 409 });
    await expect(engine.runSync(a, peer, mismatch)).rejects.toThrow(
      `相手PCとアプリのバージョンが違います（このPC: v${local}、相手: v${local - 1}）。両方を最新にしてから同期してください。`,
    );
    const legacy = direct();
    legacy.ping = async () => ({ deviceId: identity(b), deviceName: 'B', serverTime: new Date().toISOString() } as SyncPing);
    await expect(engine.runSync(a, peer, legacy)).rejects.toThrow('相手: v不明');
    expect(sync.collectChanges(a, null)).toEqual(before);
    expect(a.prepare('SELECT * FROM sync_peers WHERE id = ?').get(peer.id)).toEqual(beforePeer);
  });

  it('3分を超える時刻差を警告する', async () => {
    const transport = direct();
    transport.ping = async () => ({ deviceId: identity(b), deviceName: 'B', serverTime: '2026-10-22T00:07:00.000Z', schemaVersion: b.pragma('user_version', { simple: true }) as number });
    const result = await engine.runSync(a, peer, transport);
    expect(result.clockSkewMs).toBe(240_000);
    expect(result.warnings).toHaveLength(1);
  });

  it('送信失敗はログに残し、受信位置だけ進めて再試行できる', async () => {
    idea(b);
    const transport = direct();
    transport.apply = async () => { throw new Error('通信失敗'); };
    await expect(engine.runSync(a, peer, transport)).rejects.toThrow('通信失敗');
    expect(row(a, 'trade_ideas', 'idea')).toBeDefined();
    expect(a.prepare('SELECT status, received, detail FROM sync_log').get()).toMatchObject({ status: 'failed', received: 1, detail: expect.stringContaining('通信失敗') });
    expect(a.prepare('SELECT last_pulled_until, last_pushed_until, last_synced_at FROM sync_peers').get())
      .toEqual({ last_pulled_until: now, last_pushed_until: null, last_synced_at: null });
    expect(await engine.runSync(a, peer, direct())).toMatchObject({ received: 0, sent: 0 });
  });

  it('同じDBの同期を排他し、終了後に解放する', async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const transport = direct();
    const ping = transport.ping;
    transport.ping = async () => { entered(); await gate; return ping(); };
    const running = engine.runSync(a, peer, transport);
    await ready;
    await expect(engine.runSync(a, peer, direct())).rejects.toThrow('同期を実行中');
    expect((await request('regenerate')).status).toBe(409);
    release();
    await running;
    await expect(engine.runSync(a, peer, direct())).resolves.toBeDefined();
  });

  it('バックアップを作り、古いものから削除して10件だけ保持する', async () => {
    const paths: string[] = [];
    for (let i = 0; i < 12; i++) {
      vi.setSystemTime(Date.parse(now) + i * 1000);
      paths.push(await engine.backupDatabase(a));
    }
    const remaining = readdirSync(join(directory, 'sync-backups'));
    expect(remaining).toHaveLength(10);
    expect(remaining).not.toContain(paths[0].split(/[\\/]/).pop());
    expect(remaining).not.toContain(paths[1].split(/[\\/]/).pop());
    const restored = connection.openDatabase(paths[11]);
    try {
      expect(restored.name).toBe(paths[11]);
      expect(identity(restored)).toBe(identity(a));
      expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally { restored.close(); }
  });

  it('90日を超える論理削除を掃除し、子行が残る口座を保持する', async () => {
    put(a, 'portfolios', { id: 'account', name: '口座', deleted_at: '2026-01-01T00:00:00.000Z' });
    put(a, 'holdings', { id: 'holding', portfolio_id: 'account', symbol: 'AAPL', market: 'US', shares: 1, avg_cost: 10 });
    idea(a);
    a.prepare('UPDATE trade_ideas SET deleted_at = ?').run('2026-01-01T00:00:00.000Z');
    await engine.runSync(a, peer, direct());
    expect(row(a, 'trade_ideas', 'idea')).toBeUndefined();
    expect(row(a, 'portfolios', 'account')).toBeDefined();
  });

  it('正しい署名が通り、本文・パス・署名・時刻・デバイスの改ざんを拒否する', () => {
    const path = '/api/sync/peer/apply?x=1';
    const body = '{"test":1}';
    const headers = auth.signedHeaders(identity(b), peer.secret, 'POST', path, body);
    const make = (h = headers, p = path) => new Request(`http://localhost${p}`, { method: 'POST', headers: h, body });
    expect(auth.verifyRequest(a, make(), body).device_id).toBe(identity(b));
    expect(() => auth.verifyRequest(a, make(), '{"test":2}')).toThrow('認証');
    expect(() => auth.verifyRequest(a, make(headers, '/api/sync/peer/apply'), body)).toThrow('認証');
    expect(() => auth.verifyRequest(a, make({ ...headers, 'X-PM-Signature': '00'.repeat(32) }), body)).toThrow('認証');
    expect(() => auth.verifyRequest(a, make({ ...headers, 'X-PM-Signature': 'bad' }), body)).toThrow('認証');
    expect(() => auth.verifyRequest(a, make(auth.signedHeaders(identity(b), peer.secret, 'POST', path, body, '2026-10-21T23:00:00.000Z')), body)).toThrow('認証');
    expect(() => auth.verifyRequest(a, make({ ...headers, 'X-PM-Device': 'unknown' }), body)).toThrow('認証');
    expect(() => auth.verifyRequest(a, make({ ...headers, 'X-PM-Timestamp': 'invalid' }), body)).toThrow('認証');
  });

  it('署名対象の形式がHMAC-SHA256の外部計算と一致する', async () => {
    const { createHash, createHmac } = await import('node:crypto');
    const body = '{"note":"日本語"}';
    const hash = createHash('sha256').update(body).digest('hex');
    const expected = createHmac('sha256', Buffer.from(peer.secret, 'hex')).update(`POST\n/api/sync/peer/apply\n${now}\n${hash}`).digest('hex');
    expect(auth.signature(peer.secret, 'POST', '/api/sync/peer/apply', now, body)).toBe(expected);
  });

  it('コードの誤り・期限切れ・使用済み・受付停止を拒否し、接続元の先頭IPを保存する', () => {
    const input = { deviceId: 'another-device', deviceName: '別PC', port: 3102 };
    const issued = pairing.startPairing(a);
    expect(issued.code).toMatch(/^\d{6}$/);
    expect(() => pairing.acceptPairing(a, { ...input, code: issued.code === '000000' ? '999999' : '000000' }, null)).toThrow('コード');
    vi.setSystemTime(Date.parse(issued.expiresAt));
    expect(() => pairing.acceptPairing(a, { ...input, code: issued.code }, null)).toThrow('コード');
    const active = pairing.startPairing(a);
    const result = pairing.acceptPairing(a, { ...input, code: active.code }, '192.168.1.5, 127.0.0.1');
    expect(result.secret).toMatch(/^[a-f0-9]{64}$/);
    expect(a.prepare('SELECT base_url FROM sync_peers WHERE device_id = ?').get(input.deviceId)).toEqual({ base_url: 'http://192.168.1.5:3102' });
    expect(() => pairing.acceptPairing(a, { ...input, code: active.code }, null)).toThrow('コード');
    const stopped = pairing.startPairing(a);
    pairing.stopPairing(a);
    expect(() => pairing.acceptPairing(a, { ...input, code: stopped.code }, null)).toThrow('コード');
  });

  it('pairとpeersの両方で同じデバイスIDを409で拒否する', async () => {
    const issued = pairing.startPairing(a);
    const accepted = await request('pair', 'POST', { code: issued.code, deviceId: identity(a), deviceName: 'コピーPC', port: 3102 });
    expect(accepted.status).toBe(409);
    expect((await accepted.json()).error).toContain('同じデバイスID');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ deviceId: identity(a), deviceName: 'コピーPC', secret: peer.secret }));
    const linked = await request('peers', 'POST', { address: '127.0.0.1:3102', code: issued.code });
    expect(linked.status).toBe(409);
    expect((await linked.json()).error).toContain('同じデバイスID');
  });

  it('APIは署名なしを401、不正JSONを400にし、署名付きchanges/applyを処理する', async () => {
    expect((await request('ping', 'GET')).status).toBe(401);
    expect((await api.handleSync(new Request('http://localhost/api/sync/run', { method: 'POST', body: '{' }), 'run', undefined, a)).status).toBe(400);
    idea(b);
    const body = JSON.stringify({ changes: sync.collectChanges(b, null), lastSyncedAt: null });
    const path = '/api/sync/peer/apply';
    const response = await api.handleSync(new Request(`http://localhost${path}`, {
      method: 'POST', body, headers: auth.signedHeaders(identity(b), peer.secret, 'POST', path, body),
    }), 'apply', undefined, a);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ applied: 1 });
    const changedPath = '/api/sync/peer/changes?since=2026-10-21T00%3A00%3A00.000Z';
    const changed = await api.handleSync(new Request(`http://localhost${changedPath}`, {
      headers: auth.signedHeaders(identity(b), peer.secret, 'GET', changedPath),
    }), 'changes', undefined, a);
    expect(changed.status).toBe(200);
    expect((await changed.json()).changes.trade_ideas).toEqual([]);
  });

  it('peersは疎通結果を返し、シークレットを返さず、PUBLIC_PORTを相手へ伝える', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ deviceId: identity(b), deviceName: 'B', serverTime: now }));
    const result = await request('peers', 'GET');
    const data = await result.json();
    expect(data.peers[0]).toMatchObject({ reachable: true, device_id: identity(b) });
    expect(JSON.stringify(data)).not.toContain(peer.secret);
    expect(fetch.mock.calls[0][1]?.signal).toBeDefined();
    fetch.mockRejectedValueOnce(new Error('timeout'));
    expect((await (await request('peers', 'GET')).json()).peers[0].reachable).toBe(false);
    process.env.PM_SYNC_PUBLIC_PORT = '3101';
    fetch.mockResolvedValueOnce(Response.json({ deviceId: 'new-peer', deviceName: '新PC', secret: peer.secret }));
    const linked = await request('peers', 'POST', { address: '127.0.0.1:3102', code: '123456' });
    expect(linked.status).toBe(201);
    expect(JSON.parse(fetch.mock.calls.at(-1)![1]!.body as string)).toMatchObject({ port: 3101 });
    delete process.env.PM_SYNC_PUBLIC_PORT;
  });

  it('peersは自分自身のデバイス情報とスキーマ版数も返す', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ deviceId: identity(b), deviceName: 'B', serverTime: now }));
    const data = await (await request('peers', 'GET')).json();
    expect(data.self).toEqual({
      deviceId: identity(a), deviceName: expect.any(String), schemaVersion: a.pragma('user_version', { simple: true }),
    });
    expect(data.peers[0]).toMatchObject({ device_id: identity(b), reachable: true });
    expect(JSON.stringify(data)).not.toContain(peer.secret);
  });

  it('ログは新しい50件、解除は自分側だけ、ID再生成はLinkと同期位置を消す', async () => {
    for (let i = 0; i < 55; i++) a.prepare("INSERT INTO sync_log (id, peer_device_id, started_at, status) VALUES (?, ?, ?, 'success')").run(`log-${i}`, identity(b), now);
    const logs = (await (await request('log', 'GET')).json()).logs;
    expect(logs).toHaveLength(50);
    expect(logs[0].id).toBe('log-54');
    const removed = await api.handleSync(new Request('http://localhost/api/sync/peers/id', { method: 'DELETE' }), 'removePeer', peer.id, a);
    expect(removed.status).toBe(200);
    expect(b.prepare('SELECT * FROM sync_peers').all()).toHaveLength(1);
    pairing.savePeer(a, identity(b), 'B', peer.base_url, peer.secret);
    a.prepare("INSERT INTO sync_meta VALUES ('last_test', 'old')").run();
    const oldId = identity(a);
    const generated = await request('regenerate');
    expect(generated.status).toBe(200);
    expect(identity(a)).not.toBe(oldId);
    expect(identity(a)).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.prepare('SELECT * FROM sync_peers').all()).toEqual([]);
    expect(a.prepare("SELECT * FROM sync_meta WHERE key LIKE 'last_%'").all()).toEqual([]);
  });

  it('HTTP transportは本文とクエリを署名して送る', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ applied: 0 }));
    const http = transportModule.httpTransport(identity(a), peer);
    await http.apply(sync.emptyChanges(), null);
    const [url, init] = fetch.mock.calls[0];
    const outgoing = new Request(url as string, init);
    expect(auth.verifyRequest(b, outgoing, init!.body as string).device_id).toBe(identity(a));
    expect(transportModule.normalizeAddress('127.0.0.1:3102')).toBe('http://127.0.0.1:3102');
    expect(() => transportModule.normalizeAddress('http://user:password@localhost/')).toThrow('アドレス');
  });
});
