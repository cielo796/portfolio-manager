'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { DisplaySettings } from '@/types';

const KEY = 'pm.display';
const EVENT = 'pm-display-change';
const defaults: DisplaySettings = { updown: 'jp', density: 'compact' };
let memory: string | null = null;

function read() {
  if (memory !== null) return memory;
  try {
    return window.localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

function parse(raw: string | null): DisplaySettings {
  try {
    const value = JSON.parse(raw ?? '{}') as Partial<DisplaySettings> | null;
    return {
      updown: value?.updown === 'us' ? 'us' : 'jp',
      density: value?.density === 'standard' ? 'standard' : 'compact',
    };
  } catch {
    return defaults;
  }
}

function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) {
      memory = null;
      callback();
    }
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(EVENT, callback);
  };
}

export function useDisplaySettings() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const settings = useMemo(() => parse(raw), [raw]);
  const updateSettings = (patch: Partial<DisplaySettings>) => {
    memory = JSON.stringify({ ...parse(read()), ...patch });
    try {
      window.localStorage.setItem(KEY, memory);
    } catch {
      // 保存できない環境でも現在のタブには反映する。
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return { settings, updateSettings };
}
