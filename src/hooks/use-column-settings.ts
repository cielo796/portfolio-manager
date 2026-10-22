'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { ColumnSizingState, OnChangeFn, VisibilityState } from '@tanstack/react-table';

type ColumnScope = 'holdings' | 'watchlist';
const DEFAULT_VISIBILITY: Record<ColumnScope, VisibilityState> = {
  holdings: { account: false, memo: false, updated: false },
  watchlist: {},
};
type ColumnSettings = { visibility: VisibilityState; sizing: ColumnSizingState };
const memory: Partial<Record<ColumnScope, string | null>> = {};

function read(scope: ColumnScope) {
  if (memory[scope] != null) return memory[scope];
  try { return localStorage.getItem(`pm.columns.${scope}`); } catch { return null; }
}

function parse(raw: string | null, scope: ColumnScope): ColumnSettings {
  const defaultVisibility = DEFAULT_VISIBILITY[scope];
  const defaults = { visibility: defaultVisibility, sizing: {} };
  try {
    const saved = JSON.parse(raw ?? 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    return {
      visibility: saved.visibility && typeof saved.visibility === 'object'
        ? { ...defaultVisibility, ...Object.fromEntries(Object.entries(saved.visibility).filter(
          (entry): entry is [string, boolean] => typeof entry[1] === 'boolean'
        )) } : defaultVisibility,
      sizing: saved.sizing && typeof saved.sizing === 'object'
        ? Object.fromEntries(Object.entries(saved.sizing).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number'
            && Number.isFinite(entry[1]) && entry[1] >= 40 && entry[1] <= 600
        )) : {},
    };
  } catch { return defaults; }
}

function subscribe(scope: ColumnScope, callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === `pm.columns.${scope}` || event.key === null) { memory[scope] = null; callback(); }
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(`pm-columns-${scope}-change`, callback);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(`pm-columns-${scope}-change`, callback);
  };
}

function write(scope: ColumnScope, settings: ColumnSettings) {
  const raw = JSON.stringify(settings);
  memory[scope] = raw;
  try { localStorage.setItem(`pm.columns.${scope}`, raw); } catch {
    // ストレージが無効でも現在のタブには反映する。
  }
  window.dispatchEvent(new Event(`pm-columns-${scope}-change`));
}

export function useColumnSettings(scope: ColumnScope = 'holdings') {
  const store = useMemo(() => ({
    subscribe: (callback: () => void) => subscribe(scope, callback),
    read: () => read(scope),
  }), [scope]);
  const raw = useSyncExternalStore(store.subscribe, store.read, () => null);
  const settings = useMemo(() => parse(raw, scope), [raw, scope]);
  const setVisibility: OnChangeFn<VisibilityState> = (updater) => {
    const current = parse(read(scope), scope);
    write(scope, { ...current, visibility: typeof updater === 'function' ? updater(current.visibility) : updater });
  };
  const setSizing: OnChangeFn<ColumnSizingState> = (updater) => {
    const current = parse(read(scope), scope);
    write(scope, { ...current, sizing: typeof updater === 'function' ? updater(current.sizing) : updater });
  };
  return { ...settings, setVisibility, setSizing };
}
