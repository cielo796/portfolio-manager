import 'server-only';

import type Database from 'better-sqlite3';
import type { SyncAutoConfig, SyncAutoStatus, SyncPeer, SyncTransport } from '@/types';
import { getDeviceId } from '@/lib/db/device';
import { runSync } from './engine';
import { syncHistory } from './history';
import { state, SyncError } from './state';
import { httpTransport } from './transport';

type Schedule = { due: Map<string, { at: number | null; failures: number }>; busy: boolean; timer?: ReturnType<typeof setInterval> };
const shared = globalThis as typeof globalThis & { __pmAutoSync?: Map<string, Schedule> };
const schedules = shared.__pmAutoSync ??= new Map<string, Schedule>();

export function autoConfig(db: Database.Database): SyncAutoConfig {
  const row = db.prepare("SELECT value FROM sync_meta WHERE key = 'auto_sync'").get() as { value: string } | undefined;
  return row ? JSON.parse(row.value) : { mode: 'off', intervalMinutes: 30 };
}

export function saveAutoConfig(db: Database.Database, value: unknown) {
  const config = value as SyncAutoConfig;
  if (!config || !['off', 'startup', 'interval'].includes(config.mode) || ![15, 30, 60].includes(config.intervalMinutes)) throw new SyncError('自動同期の設定が不正です。');
  db.prepare("INSERT INTO sync_meta (key, value) VALUES ('auto_sync', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify({ mode: config.mode, intervalMinutes: config.intervalMinutes }));
  schedules.get(db.name)?.due.clear();
}

function schedule(db: Database.Database) {
  let value = schedules.get(db.name);
  if (!value) { value = { due: new Map(), busy: false }; schedules.set(db.name, value); }
  return value;
}

function refreshPeers(db: Database.Database, now: number) {
  const value = schedule(db);
  const peers = db.prepare('SELECT * FROM sync_peers ORDER BY id').all() as SyncPeer[];
  for (const id of value.due.keys()) if (!peers.some((peer) => peer.id === id)) value.due.delete(id);
  for (const peer of peers) if (!value.due.has(peer.id)) value.due.set(peer.id, { at: now + 5000, failures: 0 });
  return peers;
}

export async function tickAutoSync(db: Database.Database, now = Date.now(), transportFor: (peer: SyncPeer) => SyncTransport = (peer) => httpTransport(getDeviceId(db), peer)) {
  const value = schedule(db);
  const config = autoConfig(db);
  if (config.mode === 'off' || value.busy || state.running.has(db.name)) return;
  const peers = refreshPeers(db, now);
  value.busy = true;
  try {
    for (const peer of peers) {
      const due = value.due.get(peer.id)!;
      if (due.at === null || due.at > now) continue;
      if (autoConfig(db).mode === 'off' || state.running.has(db.name)) break;
      // runSyncの排他を取得してから署名付きpingで到達性を確かめる。
      try { await runSync(db, peer, transportFor(peer), 'auto'); due.failures = 0; }
      catch (error) {
        if (error instanceof SyncError && error.status === 409 && state.running.has(db.name)) break;
        due.failures++;
      }
      const current = autoConfig(db);
      due.at = current.mode === 'interval'
        ? Math.max(now, Date.now()) + current.intervalMinutes * 60_000 * 2 ** Math.min(due.failures, 5)
        : null;
    }
  } finally { value.busy = false; }
}

export function startAutoSync(db: Database.Database) {
  const value = schedule(db);
  if (value.timer) return;
  refreshPeers(db, Date.now());
  value.timer = setInterval(() => { if (db.open) void tickAutoSync(db).catch(() => {}); else stopAutoSync(db); }, 5000);
  value.timer.unref();
}

export function stopAutoSync(db: Database.Database) {
  const value = schedules.get(db.name);
  if (value?.timer) clearInterval(value.timer);
  schedules.delete(db.name);
}

export function autoStatus(db: Database.Database): SyncAutoStatus {
  const config = autoConfig(db);
  refreshPeers(db, Date.now());
  const times = config.mode === 'off' ? [] : [...schedule(db).due.values()].flatMap((due) => due.at === null ? [] : [due.at]);
  const last = db.prepare('SELECT MAX(last_synced_at) AS at FROM sync_peers').get() as { at: string | null };
  return { config, running: state.running.has(db.name), lastSyncedAt: last.at, nextRunAt: times.length ? new Date(Math.min(...times)).toISOString() : null, latest: syncHistory(db, null, 1)[0] ?? null };
}
