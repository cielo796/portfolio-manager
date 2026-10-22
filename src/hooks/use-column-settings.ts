'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { ColumnSizingState, OnChangeFn, VisibilityState } from '@tanstack/react-table';

const STORAGE_KEY = 'pm.columns.holdings';
const EVENT = 'pm-columns-holdings-change';
const DEFAULT_VISIBILITY: VisibilityState = { account: false, memo: false, updated: false };
type ColumnSettings = { visibility: VisibilityState; sizing: ColumnSizingState };
let memory: string | null = null;

function read() {
  if (memory !== null) return memory;
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function parse(raw: string | null): ColumnSettings {
  const defaults = { visibility: DEFAULT_VISIBILITY, sizing: {} };
  try {
    const saved = JSON.parse(raw ?? 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    return {
      visibility: saved.visibility && typeof saved.visibility === 'object'
        ? { ...DEFAULT_VISIBILITY, ...Object.fromEntries(Object.entries(saved.visibility).filter(
          (entry): entry is [string, boolean] => typeof entry[1] === 'boolean'
        )) } : DEFAULT_VISIBILITY,
      sizing: saved.sizing && typeof saved.sizing === 'object'
        ? Object.fromEntries(Object.entries(saved.sizing).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number'
            && Number.isFinite(entry[1]) && entry[1] >= 40 && entry[1] <= 600
        )) : {},
    };
  } catch { return defaults; }
}

function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) { memory = null; callback(); }
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT, callback);
  };
}

function write(settings: ColumnSettings) {
  memory = JSON.stringify(settings);
  try { localStorage.setItem(STORAGE_KEY, memory); } catch {
    // ストレージが無効でも現在のタブには反映する。
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useColumnSettings() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const settings = useMemo(() => parse(raw), [raw]);
  const setVisibility: OnChangeFn<VisibilityState> = (updater) => {
    const current = parse(read());
    write({ ...current, visibility: typeof updater === 'function' ? updater(current.visibility) : updater });
  };
  const setSizing: OnChangeFn<ColumnSizingState> = (updater) => {
    const current = parse(read());
    write({ ...current, sizing: typeof updater === 'function' ? updater(current.sizing) : updater });
  };
  return { ...settings, setVisibility, setSizing };
}
