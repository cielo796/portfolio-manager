import type { ResizableLayoutDefinition } from '@/lib/resizable-layout';

export const NEWS_LAYOUT = {
  storageKey: 'pm.news.layout.panes',
  defaults: { filter: 16, list: 56, preview: 28 },
  minimums: { filter: 12, list: 30, preview: 18 },
} as const satisfies ResizableLayoutDefinition;
