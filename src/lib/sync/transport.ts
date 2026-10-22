import 'server-only';

import type { SyncApplyResult, SyncChanges, SyncPeer, SyncPing, SyncTransport } from '@/types';
import { signedHeaders } from './auth';
import { SyncError } from './state';

export function normalizeAddress(address: unknown): string {
  if (typeof address !== 'string' || !address.trim()) throw new SyncError('相手のアドレスを指定してください。');
  let url: URL;
  try {
    url = new URL(address.includes('://') ? address : `http://${address}`);
  } catch {
    throw new SyncError('相手のアドレスが不正です。');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new SyncError('相手のアドレスが不正です。');
  }
  return url.origin;
}

export async function fetchJson<T>(baseUrl: string, path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
  const result = await response.json();
  if (!response.ok) throw new SyncError(typeof result?.error === 'string' ? result.error : '相手PCへの接続に失敗しました。', response.status);
  return result as T;
}

export function httpTransport(deviceId: string, peer: SyncPeer): SyncTransport {
  async function call<T>(method: string, path: string, payload?: unknown, timeoutMs?: number): Promise<T> {
    const body = payload === undefined ? '' : JSON.stringify(payload);
    return fetchJson<T>(peer.base_url, path, {
      method, headers: { ...signedHeaders(deviceId, peer.secret, method, path, body), 'Content-Type': 'application/json' },
      ...(body ? { body } : {}),
    }, timeoutMs);
  }
  return {
    ping: () => call<SyncPing>('GET', '/api/sync/peer/ping', undefined, 2_000),
    changes: (since) => call<{ changes: SyncChanges; serverTime: string }>('GET', `/api/sync/peer/changes${since ? `?since=${encodeURIComponent(since)}` : ''}`),
    apply: (changes, lastSyncedAt) => call<SyncApplyResult>('POST', '/api/sync/peer/apply', { changes, lastSyncedAt }),
  };
}
