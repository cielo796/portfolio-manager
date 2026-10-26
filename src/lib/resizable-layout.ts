export type ResizableLayoutDefinition = {
  storageKey: string;
  defaults: Record<string, number>;
  minimums: Record<string, number>;
};

export function readStorageValue(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function writeStorageValue(key: string, value: string): void {
  try { window.localStorage.setItem(key, value); } catch { /* 保存できなくても操作は継続する。 */ }
}

// 不正な保存値や旧構成の値はグループ単位で既定比率に戻す。
export function parseResizableLayout(raw: string | null, { defaults, minimums }: ResizableLayoutDefinition): Record<string, number> {
  try {
    const value: unknown = raw === null ? null : JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...defaults };
    const entries = Object.entries(value);
    if (entries.length !== Object.keys(defaults).length || entries.some(([id, size]) =>
      !Object.hasOwn(defaults, id) || typeof size !== 'number' || !Number.isFinite(size) || size < minimums[id] || size > 100)) return { ...defaults };
    if (Math.abs(entries.reduce((sum, [, size]) => sum + size, 0) - 100) > 0.1) return { ...defaults };
    return Object.fromEntries(entries);
  } catch {
    return { ...defaults };
  }
}

export function createLayoutStorage(definition: ResizableLayoutDefinition): Pick<Storage, 'getItem' | 'setItem'> {
  return {
    getItem: () => JSON.stringify(parseResizableLayout(readStorageValue(definition.storageKey), definition)),
    setItem: (_key, value) => writeStorageValue(definition.storageKey, value),
  };
}
