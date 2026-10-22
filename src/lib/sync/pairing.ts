import 'server-only';

import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import type Database from 'better-sqlite3';
import type { SyncPeer } from '@/types';
import { getDeviceId, getDeviceName } from '@/lib/db/device';
import { assertIdle, duplicateDeviceMessage, state, SyncError } from './state';

export function portValue(value: unknown, fallback = 38400): number {
  const port = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new SyncError('ポート番号が不正です。');
  return port;
}

export function startPairing(db: Database.Database) {
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const expiresAt = new Date(Date.now() + 300_000).toISOString();
  const port = portValue(process.env.PM_SYNC_PORT);
  const addresses = Object.values(networkInterfaces()).flatMap((entries) => entries ?? [])
    .filter(({ family, internal, address }) => family === 'IPv4' && !internal
      && (/^10\./.test(address) || /^192\.168\./.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address)))
    .map(({ address }) => `${address}:${port}`);
  state.pairing.set(db.name, { code, expiresAt });
  return { code, expiresAt, deviceId: getDeviceId(db), deviceName: getDeviceName(db), addresses: [...new Set(addresses)] };
}

export function stopPairing(db: Database.Database) {
  state.pairing.delete(db.name);
}

export function savePeer(db: Database.Database, deviceId: string, name: string, baseUrl: string, secret: string): SyncPeer {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO sync_peers (id, device_id, name, base_url, secret, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET
    name = excluded.name, base_url = excluded.base_url, secret = excluded.secret,
    last_synced_at = NULL, last_pulled_until = NULL, last_pushed_until = NULL, updated_at = excluded.updated_at`)
    .run(randomUUID(), deviceId, name, baseUrl, secret, now, now);
  return db.prepare('SELECT * FROM sync_peers WHERE device_id = ?').get(deviceId) as SyncPeer;
}

export function acceptPairing(db: Database.Database, input: Record<string, unknown>, forwardedFor: string | null) {
  assertIdle(db);
  if (typeof input.deviceId !== 'string' || !input.deviceId || typeof input.deviceName !== 'string' || !input.deviceName) throw new SyncError('デバイス情報が不正です。');
  if (input.deviceId === getDeviceId(db)) throw new SyncError(duplicateDeviceMessage, 409);
  const pairing = state.pairing.get(db.name);
  const code = typeof input.code === 'string' ? input.code : '';
  if (!pairing || Date.now() >= Date.parse(pairing.expiresAt) || !/^\d{6}$/.test(code)
    || !timingSafeEqual(Buffer.from(code), Buffer.from(pairing.code))) throw new SyncError('ペアリングコードが無効または期限切れです。', 401);
  const ip = forwardedFor?.split(',')[0].trim() || '127.0.0.1';
  if (!isIP(ip)) throw new SyncError('接続元IPが不正です。');
  const port = portValue(input.port);
  const secret = randomBytes(32).toString('hex');
  savePeer(db, input.deviceId, input.deviceName, `http://${isIP(ip) === 6 ? `[${ip}]` : ip}:${port}`, secret);
  stopPairing(db);
  return { deviceId: getDeviceId(db), deviceName: getDeviceName(db), secret };
}

export function regenerateDevice(db: Database.Database) {
  assertIdle(db);
  const deviceId = randomUUID();
  db.transaction(() => {
    db.prepare("UPDATE sync_meta SET value = ? WHERE key = 'device_id'").run(deviceId);
    db.prepare("DELETE FROM sync_meta WHERE key LIKE 'last_%'").run();
    db.prepare('DELETE FROM sync_peers').run();
  })();
  stopPairing(db);
  return { deviceId, deviceName: getDeviceName(db) };
}
