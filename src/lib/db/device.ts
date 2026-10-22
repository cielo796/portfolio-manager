import 'server-only';

import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type Database from 'better-sqlite3';
import { getDb } from './connection';

function getOrCreate(key: string, create: () => string, db: Database.Database): string {
  const row = db.prepare('SELECT value FROM sync_meta WHERE key = ?').get(key) as { value: string } | undefined;
  if (row) return row.value;
  db.prepare('INSERT OR IGNORE INTO sync_meta (key, value) VALUES (?, ?)').run(key, create());
  return (db.prepare('SELECT value FROM sync_meta WHERE key = ?').get(key) as { value: string }).value;
}

export function getDeviceId(db = getDb()): string {
  return getOrCreate('device_id', randomUUID, db);
}

export function getDeviceName(db = getDb()): string {
  return getOrCreate('device_name', hostname, db);
}
