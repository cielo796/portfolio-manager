import 'server-only';

import type Database from 'better-sqlite3';
import type { SyncHistoryEntry } from '@/types';
import { SyncError } from './state';

export function syncHistory(db: Database.Database, filter: string | null = null, limit = 200): SyncHistoryEntry[] {
  if (filter && !['success', 'failed', 'partial', 'running'].includes(filter)) throw new SyncError('結果の絞り込みが不正です。');
  const rows = db.prepare(`SELECT l.*, p.name AS peerName FROM sync_log l LEFT JOIN sync_peers p ON p.device_id = l.peer_device_id
    ORDER BY l.started_at DESC, l.rowid DESC`).iterate();
  const entries: SyncHistoryEntry[] = [];
  for (const value of rows) {
    const row = value as SyncHistoryEntry;
    let detail: Partial<SyncHistoryEntry> & { partial?: boolean } = {};
    try {
      const parsed = JSON.parse(row.detail ?? '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) detail = parsed;
    } catch { /* 旧ログも表示する */ }
    const entry: SyncHistoryEntry = {
      ...row, status: row.status === 'failed' && detail.partial ? 'partial' : row.status,
      peerName: detail.peerName || row.peerName || row.peer_device_id,
      source: detail.source === 'auto' ? 'auto' : 'manual', durationMs: detail.durationMs ?? (row.finished_at ? Date.parse(row.finished_at) - Date.parse(row.started_at) : null),
      error: detail.error ?? null, warnings: detail.warnings ?? [], byTable: detail.byTable ?? {},
    };
    if (!filter || entry.status === filter) entries.push(entry);
    if (entries.length >= limit) break;
  }
  return entries;
}
