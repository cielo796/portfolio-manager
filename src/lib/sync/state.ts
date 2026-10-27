import 'server-only';

import type Database from 'better-sqlite3';

export class SyncError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

// Next.jsのルート別バンドルでも受付状態と排他を共有する
const shared = globalThis as typeof globalThis & {
  __pmSyncState?: {
    pairing: Map<string, { code: string; expiresAt: string }>;
    running: Set<string>;
  };
};
export const state = shared.__pmSyncState ??= { pairing: new Map(), running: new Set() };

export function assertIdle(db: Database.Database) {
  if (state.running.has(db.name)) throw new SyncError('同期を実行中です。', 409);
}

export const duplicateDeviceMessage = '相手のPCと同じデバイスIDです。どちらかのPCの設定画面でデバイスIDを作り直してください';

export function validTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === (value.length === 20 ? value.replace('Z', '.000Z') : value);
}
