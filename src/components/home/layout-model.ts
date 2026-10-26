import { parseResizableLayout, type ResizableLayoutDefinition } from '@/lib/resizable-layout';

export const HOME_LAYOUTS = {
  rows: { storageKey: 'pm.home.layout.rows', defaults: { top: 52, bottom: 48 }, minimums: { top: 25, bottom: 25 } },
  top: { storageKey: 'pm.home.layout.top', defaults: { holdings: 58, market: 42 }, minimums: { holdings: 35, market: 22 } },
  bottom: { storageKey: 'pm.home.layout.bottom', defaults: { movers: 25, allocation: 25, earnings: 25, news: 25 }, minimums: { movers: 12, allocation: 12, earnings: 12, news: 12 } },
  allocation: { storageKey: 'pm.home.layout.allocation', defaults: { donut: 62, history: 38 }, minimums: { donut: 25, history: 25 } },
} as const satisfies Record<string, ResizableLayoutDefinition>;

export type HomeLayoutName = keyof typeof HOME_LAYOUTS;
export const homeLayoutKey = (name: HomeLayoutName) => HOME_LAYOUTS[name].storageKey;

// 不正な保存値や旧構成の値はグループ単位で既定比率に戻す。
export function parseHomeLayout(raw: string | null, name: HomeLayoutName): Record<string, number> {
  return parseResizableLayout(raw, HOME_LAYOUTS[name]);
}
