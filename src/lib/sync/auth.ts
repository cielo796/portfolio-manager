import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { SyncPeer } from '@/types';
import { SyncError, validTime } from './state';

export function signature(secret: string, method: string, pathWithQuery: string, timestamp: string, body: string): string {
  const hash = createHash('sha256').update(body).digest('hex');
  return createHmac('sha256', Buffer.from(secret, 'hex')).update(`${method.toUpperCase()}\n${pathWithQuery}\n${timestamp}\n${hash}`).digest('hex');
}

export function signedHeaders(deviceId: string, secret: string, method: string, path: string, body = '', timestamp = new Date().toISOString()) {
  return { 'X-PM-Device': deviceId, 'X-PM-Timestamp': timestamp, 'X-PM-Signature': signature(secret, method, path, timestamp, body) };
}

export function verifyRequest(db: Database.Database, request: Request, body: string, now = Date.now()): SyncPeer {
  const device = request.headers.get('X-PM-Device');
  const timestamp = request.headers.get('X-PM-Timestamp');
  const supplied = request.headers.get('X-PM-Signature') ?? '';
  const peer = db.prepare('SELECT * FROM sync_peers WHERE device_id = ?').get(device) as SyncPeer | undefined;
  if (!peer || !validTime(timestamp) || Math.abs(now - Date.parse(timestamp)) > 300_000 || !/^[a-fA-F0-9]{64}$/.test(supplied)) {
    throw new SyncError('同期の認証に失敗しました。', 401);
  }
  const url = new URL(request.url);
  const expected = signature(peer.secret, request.method, url.pathname + url.search, timestamp, body);
  if (!timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'))) throw new SyncError('同期の認証に失敗しました。', 401);
  return peer;
}
