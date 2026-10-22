import 'server-only';

import { getDb } from './connection';
import { SYNC_TABLES } from './sync-tables';

export function purgeDeletedRows(days = 90, db = getDb()): number {
  if (!Number.isFinite(days) || days < 0) throw new RangeError('保持日数は0以上にしてください');
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return db.transaction(() => {
    let removed = 0;
    for (const table of SYNC_TABLES.filter((table) => table !== 'portfolios')) {
      removed += db.prepare(`DELETE FROM ${table} WHERE deleted_at < ?`).run(cutoff).changes;
    }
    // CASCADEで保持期間内の子行まで消さないよう、参照が残る口座は保持する
    removed += db.prepare(`
      DELETE FROM portfolios WHERE deleted_at < ?
        AND NOT EXISTS (SELECT 1 FROM holdings WHERE portfolio_id = portfolios.id)
        AND NOT EXISTS (SELECT 1 FROM transactions WHERE portfolio_id = portfolios.id)
    `).run(cutoff).changes;
    return removed;
  })();
}
