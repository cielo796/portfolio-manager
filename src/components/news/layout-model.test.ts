import { describe, expect, it } from 'vitest';
import { parseResizableLayout } from '@/lib/resizable-layout';
import { NEWS_LAYOUT } from './layout-model';

describe('ニュースの3ペイン設定', () => {
  it('既定比率・最小サイズ・専用保存キーを維持する', () => {
    expect(NEWS_LAYOUT.storageKey).toBe('pm.news.layout.panes');
    expect(parseResizableLayout(null, NEWS_LAYOUT)).toEqual({ filter: 16, list: 56, preview: 28 });
    expect(NEWS_LAYOUT.minimums).toEqual({ filter: 12, list: 30, preview: 18 });
  });

  it.each([
    { filter: 12, list: 70, preview: 18 },
    { filter: 20, list: 30, preview: 50 },
    { filter: 21.5, list: 40, preview: 38.5 },
  ])('変更した比率 %j を復元できる', (layout) => {
    expect(parseResizableLayout(JSON.stringify(layout), NEWS_LAYOUT)).toEqual(layout);
  });

  it.each([
    { filter: 11, list: 60, preview: 29 },
    { filter: 40, list: 29, preview: 31 },
    { filter: 20, list: 63, preview: 17 },
    { holdings: 58, market: 42 },
  ])('最小サイズ未満やホームの保存値 %j を棄却する', (layout) => {
    expect(parseResizableLayout(JSON.stringify(layout), NEWS_LAYOUT)).toEqual(NEWS_LAYOUT.defaults);
  });
});
