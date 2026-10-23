import 'server-only';

import type Database from 'better-sqlite3';
import type { SyncApplyResult, SyncChanges, SyncRow, SyncTable } from '@/types';
import { SyncError, validTime } from './state';
import { snapshotId, validSnapshot } from '@/components/history/model';
import type { SnapshotInput } from '@/types';

export const tables: SyncTable[] = ['portfolios', 'holdings', 'transactions', 'trade_ideas', 'ticker_presets', 'watchlist_items', 'stock_memos', 'memo_symbols', 'top_picks', 'portfolio_snapshots'];

export function emptyChanges(): SyncChanges {
  return { portfolios: [], holdings: [], transactions: [], trade_ideas: [], ticker_presets: [], watchlist_items: [], stock_memos: [], memo_symbols: [], top_picks: [], portfolio_snapshots: [] };
}

export function collectChanges(db: Database.Database, since: string | null, excludeDeviceId?: string): SyncChanges {
  if (since !== null && !validTime(since)) throw new SyncError('sinceの日時が不正です。');
  const result = emptyChanges();
  for (const table of tables) {
    result[table] = db.prepare(`SELECT * FROM ${table}
      WHERE (? IS NULL OR julianday(updated_at) > julianday(?)) AND (? IS NULL OR updated_by IS NULL OR updated_by != ?)
      ORDER BY updated_at, id`).all(since, since, excludeDeviceId ?? null, excludeDeviceId ?? null) as SyncRow[];
  }
  return result;
}

export function validateChanges(db: Database.Database, value: unknown): asserts value is SyncChanges {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SyncError('変更データが不正です。');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !tables.includes(key as SyncTable))) throw new SyncError('同期対象外のテーブルです。');
  for (const table of tables) {
    if (!Array.isArray(data[table])) throw new SyncError(`${table}の変更データが不正です。`);
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; notnull: number; type: string }>;
    const ids = new Set<string>();
    for (const entry of data[table]) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new SyncError('行データが不正です。');
      const row = entry as SyncRow;
      if (Object.keys(row).length !== columns.length || columns.some(({ name, notnull, type }) => {
        const v = row[name];
        if (v === null) return Boolean(notnull);
        return type === 'TEXT' ? typeof v !== 'string' : typeof v !== 'number' || !Number.isFinite(v);
      }) || typeof row.id !== 'string' || !row.id || ids.has(row.id)
        || !validTime(row.updated_at) || !validTime(row.created_at)
        || (row.deleted_at !== null && !validTime(row.deleted_at))) throw new SyncError(`${table}の行データが不正です。`);
      if (table === 'portfolio_snapshots') {
        const snapshot = row as unknown as SnapshotInput;
        if (!validSnapshot(snapshot) || row.id !== snapshotId(snapshot.snapshot_date, snapshot.portfolio_id)) {
          throw new SyncError('資産記録のID・値が不正です。');
        }
      }
      ids.add(row.id);
    }
  }
}

function newer(remote: SyncRow, local: SyncRow): boolean {
  const remoteTime = Date.parse(remote.updated_at);
  const localTime = Date.parse(local.updated_at);
  return remoteTime > localTime
    || (remoteTime === localTime && (remote.updated_by ?? '') > (local.updated_by ?? ''));
}

function differentContent(a: SyncRow, b: SyncRow): boolean {
  return Object.keys(a).some((key) => !['id', 'updated_at', 'updated_by'].includes(key) && a[key] !== b[key]);
}

export function applyChanges(db: Database.Database, changes: SyncChanges, options: { lastSyncedAt: string | null }): SyncApplyResult {
  validateChanges(db, changes);
  if (options.lastSyncedAt !== null && !validTime(options.lastSyncedAt)) throw new SyncError('最終同期日時が不正です。');
  return db.transaction(() => {
    const result: SyncApplyResult = { applied: 0, skipped: 0, conflicts: 0, conflictDetails: [], canonicalChanges: emptyChanges() };
    for (const table of tables) {
      const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(({ name }) => name);
      const upsert = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
        ON CONFLICT(id) DO UPDATE SET ${columns.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}`);
      for (const remote of changes[table]) {
        let local = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(remote.id) as SyncRow | undefined;
        const unique = table === 'watchlist_items' || table === 'ticker_presets';
        const sameSymbol = table === 'memo_symbols'
          ? db.prepare('SELECT * FROM memo_symbols WHERE memo_id = ? AND symbol = ? AND market = ? AND id != ?').get(remote.memo_id, remote.symbol, remote.market, remote.id) as SyncRow | undefined
          : unique
          ? db.prepare(`SELECT * FROM ${table} WHERE symbol = ? AND market = ? AND id != ?`).get(remote.symbol, remote.market, remote.id) as SyncRow | undefined
          : undefined;
        if (sameSymbol && local) throw new SyncError('同一IDの銘柄が一致しません。');
        local ??= sameSymbol;
        const differentKind = table === 'portfolio_snapshots' && local && remote.is_estimate !== local.is_estimate;
        const remoteWins = !local || (differentKind ? remote.is_estimate === 0 : newer(remote, local));
        if (local && (options.lastSyncedAt === null || Date.parse(local.updated_at) > Date.parse(options.lastSyncedAt)) && differentContent(remote, local)) {
          result.conflicts++;
          result.conflictDetails.push({ table, id: local.id < remote.id ? local.id : remote.id,
            winner: remoteWins ? 'remote' : 'local', localUpdatedAt: local.updated_at, remoteUpdatedAt: remote.updated_at });
        }
        const canonicalId = sameSymbol && sameSymbol.id < remote.id ? sameSymbol.id : remote.id;
        const winner: SyncRow = { ...(remoteWins ? remote : local!), id: canonicalId };
        const remapped = Boolean(sameSymbol);
        const changesId = Boolean(sameSymbol && canonicalId !== sameSymbol.id);
        if (changesId) db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(sameSymbol!.id);
        if (remoteWins || changesId) {
          upsert.run(...columns.map((column) => winner[column]));
          result.applied++;
        } else {
          result.skipped++;
        }
        // 更新元を保ったID統合結果は、通常の送り返し除外とは別に相手へ伝える
        if (remapped || differentKind) result.canonicalChanges[table].push(winner);
      }
    }
    const activePicks = db.prepare('SELECT COUNT(*) AS n FROM top_picks WHERE removed_at IS NULL AND deleted_at IS NULL').get() as { n: number };
    if (activePicks.n > 10) throw new SyncError(`トップピックが合計 ${activePicks.n} 件（上限 10 件）になるため同期を中止しました。どちらかの PC でピックを外してから、もう一度同期してください。データは変更されていません。`, 409);
    return result;
  })();
}
