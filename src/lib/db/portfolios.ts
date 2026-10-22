import 'server-only';

import { Portfolio } from '@/types';
import { getDb } from './connection';

export function listPortfolios(): Portfolio[] {
  const db = getDb();
  return db.prepare('SELECT * FROM portfolios WHERE deleted_at IS NULL ORDER BY created_at ASC').all() as Portfolio[];
}
