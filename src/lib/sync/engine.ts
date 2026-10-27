import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { SyncChanges, SyncConflict, SyncPeer, SyncResult, SyncTable, SyncTransport } from '@/types';
import { applyChanges, collectChanges, tables } from './changes';
import { assertIdle, duplicateDeviceMessage, state, SyncError, validTime } from './state';
import { getDeviceId } from '@/lib/db/device';
import { purgeDeletedRows } from '@/lib/db/maintenance';

export async function backupDatabase(db: Database.Database): Promise<string> {
  const directory = path.join(path.dirname(db.name), 'sync-backups');
  await mkdir(directory, { recursive: true });
  const filename = `portfolio-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.db`;
  const destination = path.join(directory, filename);
  await db.backup(destination);
  const files = (await readdir(directory)).filter((name) => /^portfolio-\d{4}-\d{2}-\d{2}T.*\.db$/.test(name)).sort();
  for (const name of files.slice(0, Math.max(0, files.length - 10))) await unlink(path.join(directory, name));
  return destination;
}

function overlap(value: string | null): string | null {
  return value === null ? null : new Date(Date.parse(value) - 300_000).toISOString();
}

function mergeCanonical(changes: SyncChanges, corrections: SyncChanges) {
  for (const table of tables) {
    const ids = new Map(changes[table].map((row) => [row.id, row]));
    for (const row of corrections[table]) ids.set(row.id, row);
    changes[table] = [...ids.values()];
  }
}

export async function runSync(db: Database.Database, inputPeer: SyncPeer, transport: SyncTransport, source: 'manual' | 'auto' = 'manual'): Promise<SyncResult> {
  assertIdle(db);
  state.running.add(db.name);
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const logId = randomUUID();
  const result: SyncResult = { received: 0, sent: 0, conflicts: 0, conflictDetails: [], clockSkewMs: 0, warnings: [], durationMs: 0 };
  const byTable = Object.fromEntries(tables.map((table) => [table, { received: 0, sent: 0 }])) as Record<SyncTable, { received: number; sent: number }>;
  let pulledSuccessfully = false;
  let pushStarted = false;
  const countTables = (counts: Partial<Record<SyncTable, number>> | undefined, direction: 'received' | 'sent') => {
    for (const table of tables) byTable[table][direction] += counts?.[table] ?? 0;
  };
  const detail = (extra = {}) => JSON.stringify({ ...result, source, peerName: inputPeer.name, byTable, ...extra });
  const addConflicts = (details: SyncConflict[]) => {
    for (const detail of details) {
      if (!result.conflictDetails.some((old) => old.table === detail.table && old.id === detail.id
        && [old.localUpdatedAt, old.remoteUpdatedAt].sort().join() === [detail.localUpdatedAt, detail.remoteUpdatedAt].sort().join())) {
        result.conflictDetails.push(detail);
      }
    }
    result.conflicts = result.conflictDetails.length;
  };
  try {
    // 呼出し元の古い一覧ではなく、直前までの同期位置を使う
    const peer = db.prepare('SELECT * FROM sync_peers WHERE id = ?').get(inputPeer.id) as SyncPeer | undefined;
    if (!peer) throw new SyncError('Link先が見つかりません。', 404);
    db.prepare('INSERT INTO sync_log (id, peer_device_id, started_at, status, detail) VALUES (?, ?, ?, ?, ?)').run(logId, peer.device_id, startedAt, 'running', detail());
    if (source === 'manual') await backupDatabase(db);
    const pingStarted = Date.now();
    const ping = await transport.ping();
    if (ping.deviceId === getDeviceId(db)) throw new SyncError(duplicateDeviceMessage, 409);
    if (ping.deviceId !== peer.device_id || !validTime(ping.serverTime)) throw new SyncError('相手PCの情報が一致しません。', 502);
    // 列構成が違うDB同士で同期すると原因の分かりにくい検証エラーになるため、先に版数を比べる
    const localVersion = db.pragma('user_version', { simple: true }) as number;
    const remoteVersion = typeof ping.schemaVersion === 'number' ? ping.schemaVersion : null;
    if (remoteVersion !== localVersion) {
      throw new SyncError(`相手PCとアプリのバージョンが違います（このPC: v${localVersion}、相手: v${remoteVersion ?? '不明'}）。両方を最新にしてから同期してください。`, 409);
    }
    if (source === 'auto') await backupDatabase(db);
    result.clockSkewMs = Date.parse(ping.serverTime) - (pingStarted + Date.now()) / 2;
    if (Math.abs(result.clockSkewMs) > 180_000) result.warnings.push('相手PCとの時刻差が3分を超えています。時計を確認してください。');
    const incoming = await transport.changes(overlap(peer.last_pulled_until));
    if (!validTime(incoming.serverTime)) throw new SyncError('相手PCの時刻が不正です。', 502);
    const pulled = applyChanges(db, incoming.changes, { lastSyncedAt: peer.last_synced_at });
    result.received = pulled.applied;
    pulledSuccessfully = true;
    countTables(pulled.byTable, 'received');
    addConflicts(pulled.conflictDetails);
    db.prepare('UPDATE sync_peers SET last_pulled_until = ?, updated_at = ? WHERE id = ?').run(incoming.serverTime, new Date().toISOString(), peer.id);
    const pushedUntil = new Date().toISOString();
    const outgoing = collectChanges(db, overlap(peer.last_pushed_until), peer.device_id);
    mergeCanonical(outgoing, pulled.canonicalChanges);
    pushStarted = true;
    const pushed = await transport.apply(outgoing, peer.last_synced_at);
    result.sent = pushed.applied;
    countTables(pushed.byTable, 'sent');
    addConflicts(pushed.conflictDetails);
    // 相手側で初めて判明したID統合も取り込む
    const reconciled = applyChanges(db, pushed.canonicalChanges, { lastSyncedAt: peer.last_synced_at });
    result.received += reconciled.applied;
    countTables(reconciled.byTable, 'received');
    addConflicts(reconciled.conflictDetails);
    const finishedAt = new Date().toISOString();
    db.prepare('UPDATE sync_peers SET last_pushed_until = ?, last_synced_at = ?, updated_at = ? WHERE id = ?').run(pushedUntil, finishedAt, finishedAt, peer.id);
    purgeDeletedRows(90, db);
    result.durationMs = Date.now() - started;
    db.prepare(`UPDATE sync_log SET finished_at = ?, status = 'success', received = ?, sent = ?, conflicts = ?, detail = ? WHERE id = ?`)
      .run(finishedAt, result.received, result.sent, result.conflicts, detail(), logId);
    return result;
  } catch (error) {
    result.durationMs = Date.now() - started;
    const reason = error instanceof Error ? error.message : '同期に失敗しました。';
    db.prepare(`UPDATE sync_log SET finished_at = ?, status = 'failed', received = ?, sent = ?, conflicts = ?, detail = ? WHERE id = ?`)
      .run(new Date().toISOString(), result.received, result.sent, result.conflicts, detail({ error: reason, partial: pulledSuccessfully && (result.received > 0 || pushStarted) }), logId);
    throw error;
  } finally {
    state.running.delete(db.name);
  }
}
