import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations';
import { seedIfEmpty } from './seed';

type GlobalWithDb = typeof globalThis & {
  __portfolioDb?: Database.Database;
  __portfolioDbInitialized?: boolean;
};

const globalWithDb = globalThis as GlobalWithDb;

// 作業中の事故防止: PM_FORBID_REAL_DB=1 のときは実DBを開かない
export function assertNotForbiddenPath(dbPath: string): void {
  if (process.env.PM_FORBID_REAL_DB !== '1') return;
  const target = path.resolve(dbPath).toLowerCase();
  const realDb = path.resolve(process.cwd(), 'data', 'portfolio.db').toLowerCase();
  if (target === realDb) {
    throw new Error('PM_FORBID_REAL_DB=1 のため実DB（data/portfolio.db）は開けません。SQLITE_DB_PATH に一時ファイルを指定してください。');
  }
}

export function openDatabase(dbPath: string): Database.Database {
  assertNotForbiddenPath(dbPath);
  const resolvedPath = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const db = new Database(resolvedPath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function getDb(): Database.Database {
  if (!globalWithDb.__portfolioDb) {
    const configuredDbPath = process.env.SQLITE_DB_PATH?.trim();
    const dbPath = configuredDbPath
      ? path.resolve(process.cwd(), configuredDbPath)
      : path.join(process.cwd(), 'data', 'portfolio.db');
    assertNotForbiddenPath(dbPath);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    globalWithDb.__portfolioDb = new Database(dbPath);
    globalWithDb.__portfolioDb.pragma('journal_mode = WAL');
    globalWithDb.__portfolioDb.pragma('foreign_keys = ON');
  }
  const db = globalWithDb.__portfolioDb;

  if (!globalWithDb.__portfolioDbInitialized) {
    runMigrations(db);
    seedIfEmpty(db);
    globalWithDb.__portfolioDbInitialized = true;
  }
  return db;
}
