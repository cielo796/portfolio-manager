import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncPeer, SyncTransport } from '@/types';

describe('T27 自動同期・検出・履歴', () => {
  let directory: string;
  let db: Database.Database;
  let peer: SyncPeer;
  let sequence = 0;
  let connection: typeof import('@/lib/db/connection');
  let auto: typeof import('./auto');
  let discovery: typeof import('./discovery');
  let api: typeof import('./api');
  let engine: typeof import('./engine');
  let changes: typeof import('./changes');
  let pairing: typeof import('./pairing');
  const timestamp = '2026-10-23T00:00:00.000Z';
  const base = Date.parse(timestamp);
  function transport(): SyncTransport {
    return {
      ping: vi.fn(async () => ({ deviceId: peer.device_id, deviceName: peer.name, serverTime: new Date().toISOString(), schemaVersion: db.pragma('user_version', { simple: true }) as number })),
      changes: vi.fn(async () => ({ changes: changes.emptyChanges(), serverTime: new Date().toISOString() })),
      apply: vi.fn(async () => ({ applied: 0, skipped: 0, conflicts: 0, conflictDetails: [], canonicalChanges: changes.emptyChanges(), byTable: {} })),
    };
  }
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pm-t27-'));
    vi.stubEnv('PM_FORBID_REAL_DB', '1');
    vi.stubEnv('SQLITE_DB_PATH', join(directory, 'guard.db'));
    connection = await import('@/lib/db/connection');
    auto = await import('./auto'); discovery = await import('./discovery'); api = await import('./api');
    engine = await import('./engine'); changes = await import('./changes'); pairing = await import('./pairing');
  });
  beforeEach(() => {
    const filename = join(directory, `${sequence++}.db`);
    db = connection.openDatabase(filename);
    expect(db.name).toBe(filename);
    peer = pairing.savePeer(db, 'other-pc', '相手PC', 'http://192.168.1.2:38400', 'ab'.repeat(32));
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(timestamp);
  });
  afterEach(() => { auto.stopAutoSync(db); db.close(); vi.useRealTimers(); vi.restoreAllMocks(); });
  afterAll(() => { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });

  it('最初に一時DBへの接続を確認する', () => { expect(db.name.startsWith(directory)).toBe(true); });

  it('既定オフ・設定検証・保存を行う', async () => {
    expect(auto.autoConfig(db)).toEqual({ mode: 'off', intervalMinutes: 30 });
    const remote = transport(); await auto.tickAutoSync(db, base, () => remote);
    expect(remote.ping).not.toHaveBeenCalled();
    expect(() => auto.saveAutoConfig(db, { mode: 'interval', intervalMinutes: 1 })).toThrow();
    auto.saveAutoConfig(db, { mode: 'startup', intervalMinutes: 15 });
    expect(auto.autoConfig(db).mode).toBe('startup');
  });

  it.each([15, 30, 60] as const)('%i分の定期間隔と起動直後の待機を判定する', async (minutes) => {
    auto.saveAutoConfig(db, { mode: 'interval', intervalMinutes: minutes });
    const remote = transport();
    auto.autoStatus(db);
    await auto.tickAutoSync(db, base + 4999, () => remote); expect(remote.ping).not.toHaveBeenCalled();
    vi.setSystemTime(base + 5000); await auto.tickAutoSync(db, Date.now(), () => remote);
    expect(remote.ping).toHaveBeenCalledTimes(1);
    expect(auto.autoStatus(db).nextRunAt).toBe(new Date(base + 5000 + minutes * 60_000).toISOString());
    vi.setSystemTime(base + 5000 + minutes * 60_000 - 1); await auto.tickAutoSync(db, Date.now(), () => remote);
    expect(remote.ping).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 1); await auto.tickAutoSync(db, Date.now(), () => remote); expect(remote.ping).toHaveBeenCalledTimes(2);
  });

  it('起動時のみは失敗しても再試行せず、プロセス再起動相当で再実行する', async () => {
    auto.saveAutoConfig(db, { mode: 'startup', intervalMinutes: 30 }); auto.autoStatus(db);
    const remote = transport(); vi.mocked(remote.ping).mockRejectedValue(new Error('応答なし'));
    vi.setSystemTime(base + 5000); await auto.tickAutoSync(db, Date.now(), () => remote);
    expect(auto.autoStatus(db).nextRunAt).toBeNull();
    await auto.tickAutoSync(db, base + 9999999, () => remote); expect(remote.ping).toHaveBeenCalledTimes(1);
    auto.stopAutoSync(db); auto.autoStatus(db);
    vi.setSystemTime(Date.now() + 5000); await auto.tickAutoSync(db, Date.now(), () => remote); expect(remote.ping).toHaveBeenCalledTimes(2);
    expect(remote.changes).not.toHaveBeenCalled();
  });

  it('失敗を指数バックオフし成功後に通常間隔に戻す', async () => {
    auto.saveAutoConfig(db, { mode: 'interval', intervalMinutes: 15 }); auto.autoStatus(db);
    const remote = transport(); vi.mocked(remote.ping).mockRejectedValue(new Error('offline'));
    vi.setSystemTime(base + 5000); await auto.tickAutoSync(db, Date.now(), () => remote);
    expect(auto.autoStatus(db).nextRunAt).toBe(new Date(Date.now() + 30 * 60_000).toISOString());
    await auto.tickAutoSync(db, Date.now() + 1, () => remote); expect(remote.ping).toHaveBeenCalledTimes(1);
    vi.setSystemTime(auto.autoStatus(db).nextRunAt!); await auto.tickAutoSync(db, Date.now(), () => remote);
    expect(auto.autoStatus(db).nextRunAt).toBe(new Date(Date.now() + 60 * 60_000).toISOString());
    vi.mocked(remote.ping).mockImplementation(transport().ping);
    vi.setSystemTime(auto.autoStatus(db).nextRunAt!); await auto.tickAutoSync(db, Date.now(), () => remote);
    expect(auto.autoStatus(db).nextRunAt).toBe(new Date(Date.now() + 15 * 60_000).toISOString());
  });

  it('自動・手動・自動tick間で同時実行しない', async () => {
    auto.saveAutoConfig(db, { mode: 'interval', intervalMinutes: 15 }); auto.autoStatus(db);
    const remote = transport();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ping = remote.ping;
    remote.ping = vi.fn(async () => { await gate; return ping(); });
    vi.setSystemTime(base + 5000);
    const running = auto.tickAutoSync(db, Date.now(), () => remote);
    await expect(engine.runSync(db, peer, transport())).rejects.toThrow('同期を実行中');
    await auto.tickAutoSync(db, Date.now(), () => transport());
    release(); await running;
    expect(remote.ping).toHaveBeenCalledTimes(1);
    const manual = engine.runSync(db, peer, remote);
    await auto.tickAutoSync(db, base + 9999999, () => transport()); await manual;
    expect(db.prepare('SELECT COUNT(*) AS n FROM sync_log').get()).toEqual({ n: 2 });
  });

  it('検出は自分を除外し、登録済み相手だけアドレスを更新する', () => {
    const detected = { deviceId: peer.device_id, deviceName: '検出PC', schemaVersion: 9, address: '192.168.1.9', port: 38401, expiresAt: Date.now() + 120000 };
    discovery.receiveDiscovery(db, detected);
    expect(db.prepare('SELECT base_url, secret, name FROM sync_peers').get()).toEqual({ base_url: 'http://192.168.1.9:38401', secret: peer.secret, name: peer.name });
    discovery.receiveDiscovery(db, { ...detected, deviceId: 'unpaired' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM sync_peers').get()).toEqual({ n: 1 });
    const self = db.prepare("SELECT value FROM sync_meta WHERE key = 'device_id'").get() as { value: string };
    discovery.receiveDiscovery(db, { ...detected, deviceId: self.value });
    expect(discovery.nearbyPeers(db)).toHaveLength(2);
    expect(() => discovery.receiveDiscovery(db, { ...detected, address: '8.8.8.8' })).toThrow();
    expect(discovery.nearbyPeers(db, Date.now() + 120001)).toHaveLength(0);
  });

  it('内部経路は秘密トークン必須で外部URL・リレー転送・誤トークンを拒否する', async () => {
    vi.stubEnv('PM_DISCOVERY_TOKEN', 'test-internal-token');
    for (const [url, headers] of [
      ['http://127.0.0.1/api/sync/discovery', {}],
      ['http://192.168.1.2/api/sync/discovery', { 'x-pm-discovery-token': 'test-internal-token' }],
      ['http://127.0.0.1/api/sync/discovery', { 'x-pm-discovery-token': 'test-internal-token', 'x-forwarded-for': '192.168.1.8' }],
    ] as [string, HeadersInit][]) expect((await api.handleSync(new Request(url, { headers }), 'discovery', undefined, db)).status).toBe(403);
    const response = await api.handleSync(new Request('http://127.0.0.1/api/sync/discovery', { headers: { 'x-pm-discovery-token': 'test-internal-token', 'x-forwarded-for': '127.0.0.1' } }), 'discovery', undefined, db);
    expect(response.status).toBe(200); expect(JSON.stringify(await response.json())).not.toContain('test-internal-token');
  });

  it('履歴は200件まで結果で絞り込み、手動/自動・一部・旧履歴を表示する', async () => {
    for (let i = 0; i < 205; i++) db.prepare('INSERT INTO sync_log (id, peer_device_id, started_at, finished_at, status, detail) VALUES (?, ?, ?, ?, ?, ?)')
      .run(`entry-${i}`, peer.device_id, timestamp, timestamp, i % 2 ? 'failed' : 'success', i % 3 ? JSON.stringify({ source: 'auto', partial: true, error: 'T21の案内', byTable: { holdings: { received: 2, sent: 1 } } }) : null);
    async function logs(query: string) { return api.handleSync(new Request(`http://127.0.0.1/api/sync/log?${query}`), 'log', undefined, db); }
    const all = await (await logs('limit=200')).json(); expect(all.logs).toHaveLength(200); expect(all.logs[0].id).toBe('entry-204');
    const partial = await (await logs('limit=200&status=partial')).json();
    expect(partial.logs.length).toBeGreaterThan(0);
    expect(partial.logs.every((entry: { status: string }) => entry.status === 'partial')).toBe(true);
    expect(partial.logs[0]).toMatchObject({ source: 'auto', error: 'T21の案内', byTable: { holdings: { received: 2, sent: 1 } }, durationMs: 0 });
    const failed = await (await logs('status=failed')).json(); expect(failed.logs[0].source).toBe('manual');
    expect((await logs('limit=201')).status).toBe(400); expect((await logs('status=unknown')).status).toBe(400);
  });
});
