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

export function openDatabase(dbPath: string): Database.Database {
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
