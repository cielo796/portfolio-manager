import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type Database from 'better-sqlite3';
import type { SyncDiscoveredPeer } from '@/types';
import { getDeviceId } from '@/lib/db/device';
import { state, SyncError } from './state';

const shared = globalThis as typeof globalThis & { __pmDiscovered?: Map<string, Map<string, SyncDiscoveredPeer>> };
const discoveries = shared.__pmDiscovered ??= new Map<string, Map<string, SyncDiscoveredPeer>>();

export function assertInternalDiscovery(request: Request) {
  const expected = process.env.PM_DISCOVERY_TOKEN;
  const actual = request.headers.get('x-pm-discovery-token') ?? '';
  const host = new URL(request.url).hostname;
  // Next.js自身も接続元をX-Forwarded-Forに補うため、ループバック値だけを許可する。
  const forwarded = request.headers.get('x-forwarded-for');
  if (!['127.0.0.1', '[::1]', 'localhost'].includes(host)
    || (forwarded && forwarded.split(',').some((address) => !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address.trim())))
    || !expected || Buffer.byteLength(actual) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    throw new SyncError('内部経路にはアクセスできません。', 403);
  }
}

export function nearbyPeers(db: Database.Database, now = Date.now()): SyncDiscoveredPeer[] {
  const peers = discoveries.get(db.name);
  if (!peers) return [];
  for (const [id, peer] of peers) if (peer.expiresAt <= now || id === getDeviceId(db)) peers.delete(id);
  return [...peers.values()];
}

export function receiveDiscovery(db: Database.Database, input: unknown) {
  const peer = input as SyncDiscoveredPeer;
  if (!peer || typeof peer.deviceId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(peer.deviceId)
    || typeof peer.deviceName !== 'string' || !peer.deviceName.trim() || peer.deviceName.length > 160
    || !Number.isInteger(peer.schemaVersion) || peer.schemaVersion < 0
    || !Number.isInteger(peer.port) || peer.port < 1 || peer.port > 65535
    || typeof peer.address !== 'string' || isIP(peer.address) !== 4
    || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(peer.address)
    || !Number.isFinite(peer.expiresAt)) throw new SyncError('検出情報が不正です。');
  if (peer.deviceId === getDeviceId(db)) return;
  let peers = discoveries.get(db.name);
  if (!peers) { peers = new Map(); discoveries.set(db.name, peers); }
  nearbyPeers(db);
  if (peers.size >= 200 && !peers.has(peer.deviceId)) return;
  if (peer.expiresAt <= Date.now()) { peers.delete(peer.deviceId); return; }
  const safe = { ...peer, expiresAt: Math.min(peer.expiresAt, Date.now() + 120_000) };
  peers.set(peer.deviceId, safe);
  // 通信中の相手情報は変更せず、次の広告で更新する。
  if (!state.running.has(db.name)) {
    db.prepare('UPDATE sync_peers SET base_url = ?, updated_at = ? WHERE device_id = ? AND base_url != ?')
      .run(`http://${safe.address}:${safe.port}`, new Date().toISOString(), safe.deviceId, `http://${safe.address}:${safe.port}`);
  }
}
