import 'server-only';

import type Database from 'better-sqlite3';
import type { SyncPeer } from '@/types';
import { getDb } from '@/lib/db/connection';
import { getDeviceId, getDeviceName } from '@/lib/db/device';
import { applyChanges, collectChanges, validateChanges } from './changes';
import { runSync } from './engine';
import { verifyRequest } from './auth';
import { acceptPairing, portValue, regenerateDevice, savePeer, startPairing, stopPairing } from './pairing';
import { assertIdle, duplicateDeviceMessage, SyncError, validTime } from './state';
import { fetchJson, httpTransport, normalizeAddress } from './transport';

export type SyncAction = 'pairing' | 'peers' | 'removePeer' | 'run' | 'log' | 'regenerate' | 'pair' | 'ping' | 'changes' | 'apply';

function publicPeer(peer: SyncPeer) {
  const { secret: _secret, ...visible } = peer;
  void _secret;
  return visible;
}

function parseBody(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch { /* 共通の入力エラーを返す */ }
  throw new SyncError('不正なリクエストです。');
}

export async function handleSync(request: Request, action: SyncAction, id?: string, database?: Database.Database): Promise<Response> {
  try {
    const db = database ?? getDb();
    const raw = request.method === 'POST' ? await request.text() : '';
    const signed = ['ping', 'changes', 'apply'].includes(action);
    const caller = signed ? verifyRequest(db, request, raw) : undefined;
    const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
    if (action === 'pairing') {
      if (request.method === 'DELETE') { stopPairing(db); return json({ success: true }); }
      return json(startPairing(db));
    }
    if (action === 'pair') return json(acceptPairing(db, parseBody(raw), request.headers.get('X-Forwarded-For')));
    if (action === 'ping') return json({ deviceId: getDeviceId(db), deviceName: getDeviceName(db), serverTime: new Date().toISOString() });
    if (action === 'changes') {
      const serverTime = new Date().toISOString();
      return json({ changes: collectChanges(db, new URL(request.url).searchParams.get('since'), caller!.device_id), serverTime });
    }
    if (action === 'apply') {
      const body = parseBody(raw);
      if (body.lastSyncedAt !== null && !validTime(body.lastSyncedAt)) throw new SyncError('最終同期日時が不正です。');
      const changes = body.changes;
      // 検証はapplyChanges内でも行い、トランザクションに入る前に不正入力を拒否する
      validateChanges(db, changes);
      return json(applyChanges(db, changes, { lastSyncedAt: body.lastSyncedAt }));
    }
    if (action === 'peers' && request.method === 'GET') {
      const peers = db.prepare('SELECT * FROM sync_peers ORDER BY created_at, id').all() as SyncPeer[];
      return json({ peers: await Promise.all(peers.map(async (peer) => {
        try {
          const ping = await httpTransport(getDeviceId(db), peer).ping();
          return { ...publicPeer(peer), reachable: ping.deviceId === peer.device_id, serverTime: ping.serverTime };
        } catch { return { ...publicPeer(peer), reachable: false }; }
      })) });
    }
    if (action === 'peers') {
      assertIdle(db);
      const body = parseBody(raw);
      const baseUrl = normalizeAddress(body.address);
      if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) throw new SyncError('6桁のコードを指定してください。');
      const result = await fetchJson<{ deviceId: string; deviceName: string; secret: string }>(baseUrl, '/api/sync/peer/pair', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          code: body.code, deviceId: getDeviceId(db), deviceName: getDeviceName(db), port: portValue(process.env.PM_SYNC_PUBLIC_PORT),
        }),
      });
      if (result.deviceId === getDeviceId(db)) throw new SyncError(duplicateDeviceMessage, 409);
      if (typeof result.deviceId !== 'string' || !result.deviceId || typeof result.deviceName !== 'string'
        || !/^[a-f0-9]{64}$/.test(result.secret)) throw new SyncError('相手PCの応答が不正です。', 502);
      assertIdle(db);
      return json({ peer: publicPeer(savePeer(db, result.deviceId, result.deviceName, baseUrl, result.secret)) }, 201);
    }
    if (action === 'removePeer') {
      assertIdle(db);
      if (!db.prepare('DELETE FROM sync_peers WHERE id = ?').run(id).changes) throw new SyncError('Link先が見つかりません。', 404);
      return json({ success: true });
    }
    if (action === 'regenerate') return json(regenerateDevice(db));
    if (action === 'log') return json({ logs: db.prepare('SELECT * FROM sync_log ORDER BY started_at DESC, rowid DESC LIMIT 50').all() });
    const body = parseBody(raw);
    if (typeof body.peerId !== 'string' || !body.peerId) throw new SyncError('peerIdを指定してください。');
    const peer = db.prepare('SELECT * FROM sync_peers WHERE id = ?').get(body.peerId) as SyncPeer | undefined;
    if (!peer) throw new SyncError('Link先が見つかりません。', 404);
    return json(await runSync(db, peer, httpTransport(getDeviceId(db), peer)));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '同期に失敗しました。' }, {
      status: error instanceof SyncError ? error.status : 500, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
