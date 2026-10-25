export const HOME_LAYOUTS = {
  rows: { defaults: { top: 52, bottom: 48 }, minimums: { top: 25, bottom: 25 } },
  top: { defaults: { holdings: 58, market: 42 }, minimums: { holdings: 35, market: 22 } },
  bottom: { defaults: { movers: 25, allocation: 25, earnings: 25, news: 25 }, minimums: { movers: 12, allocation: 12, earnings: 12, news: 12 } },
  allocation: { defaults: { donut: 62, history: 38 }, minimums: { donut: 25, history: 25 } },
} as const;

export type HomeLayoutName = keyof typeof HOME_LAYOUTS;
export const homeLayoutKey = (name: HomeLayoutName) => `pm.home.layout.${name}`;

// 不正な保存値や旧構成の値はグループ単位で既定比率に戻す。
export function parseHomeLayout(raw: string | null, name: HomeLayoutName): Record<string, number> {
  const { defaults, minimums } = HOME_LAYOUTS[name];
  try {
    const value: unknown = raw === null ? null : JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...defaults };
    const entries = Object.entries(value);
    const min: Record<string, number> = minimums;
    if (entries.length !== Object.keys(defaults).length || entries.some(([id, size]) =>
      !Object.hasOwn(defaults, id) || typeof size !== 'number' || !Number.isFinite(size) || size < min[id] || size > 100)) return { ...defaults };
    if (Math.abs(entries.reduce((sum, [, size]) => sum + size, 0) - 100) > 0.1) return { ...defaults };
    return Object.fromEntries(entries);
  } catch {
    return { ...defaults };
  }
}
