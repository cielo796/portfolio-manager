import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations';
import { seedIfEmpty } from './seed';

const configuredDbPath = process.env.SQLITE_DB_PATH?.trim();
const defaultDbPath = path.join(process.cwd(), 'data', 'portfolio.db');
const DB_PATH = configuredDbPath ? path.resolve(process.cwd(), configuredDbPath) : defaultDbPath;
const DATA_DIR = path.dirname(DB_PATH);

type GlobalWithDb = typeof globalThis & {
  __portfolioDb?: Database.Database;
  __portfolioDbInitialized?: boolean;
};

const globalWithDb = globalThis as GlobalWithDb;

export function getDb(): Database.Database {
  if (!globalWithDb.__portfolioDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    globalWithDb.__portfolioDb = new Database(DB_PATH);
  }
  const db = globalWithDb.__portfolioDb;
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  if (!globalWithDb.__portfolioDbInitialized) {
    runMigrations(db);
    seedIfEmpty(db);
    globalWithDb.__portfolioDbInitialized = true;
  }
  return db;
}
