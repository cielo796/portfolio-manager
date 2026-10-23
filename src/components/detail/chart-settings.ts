'use client';

import { useMemo, useSyncExternalStore } from 'react';
import type { ChartSettings } from '@/types';

export const defaultChartSettings: ChartSettings = { range: '3m', interval: 'd', ma5: true, ma25: true, ma75: true, cost: true, target: true, trades: true };

export function parseChartSettings(raw: string | null): ChartSettings {
  try {
    const value = JSON.parse(raw ?? '{}') as Partial<ChartSettings> | null;
    const settings = { ...defaultChartSettings };
    if (value && ['3m', '6m', '1y', '5y'].includes(value.range ?? '')) settings.range = value.range!;
    if (value && ['d', 'w', 'm'].includes(value.interval ?? '')) settings.interval = value.interval!;
    for (const key of ['ma5', 'ma25', 'ma75', 'cost', 'target', 'trades'] as const) {
      if (typeof value?.[key] === 'boolean') settings[key] = value[key];
    }
    return settings;
  } catch { return defaultChartSettings; }
}

let memory: string | null = null;
const read = () => { try { return memory ?? window.localStorage.getItem('pm.chart'); } catch { return memory; } };
const subscribe = (callback: () => void) => {
  const storage = (event: StorageEvent) => { if (event.key === 'pm.chart' || event.key === null) { memory = null; callback(); } };
  window.addEventListener('storage', storage);
  window.addEventListener('pm-chart-change', callback);
  return () => { window.removeEventListener('storage', storage); window.removeEventListener('pm-chart-change', callback); };
};

export function useChartSettings() {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const settings = useMemo(() => parseChartSettings(raw), [raw]);
  const update = (patch: Partial<ChartSettings>) => {
    memory = JSON.stringify({ ...parseChartSettings(read()), ...patch });
    try { window.localStorage.setItem('pm.chart', memory); } catch { /* 保存不可でも表示に反映する。 */ }
    window.dispatchEvent(new Event('pm-chart-change'));
  };
  return { settings, update };
}
