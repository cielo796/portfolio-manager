import { describe, expect, it } from 'vitest';
import { HOME_LAYOUTS, homeLayoutKey, parseHomeLayout, type HomeLayoutName } from './layout-model';

describe('ホームの保存レイアウト', () => {
  it.each(Object.keys(HOME_LAYOUTS) as HomeLayoutName[])('%s の既定比率は合計100で最小サイズを満たす', (name) => {
    const { defaults, minimums } = HOME_LAYOUTS[name];
    expect(Object.values(defaults).reduce((sum, size) => sum + size, 0)).toBe(100);
    for (const [id, min] of Object.entries(minimums)) expect((defaults as Record<string, number>)[id]).toBeGreaterThanOrEqual(min);
    expect(parseHomeLayout(null, name)).toEqual(defaults);
    expect(homeLayoutKey(name)).toBe(`pm.home.layout.${name}`);
  });

  it('既定比率と変更後の有効な比率を復元する', () => {
    expect(HOME_LAYOUTS.rows.defaults).toEqual({ top: 52, bottom: 48 });
    expect(HOME_LAYOUTS.top.defaults).toEqual({ holdings: 58, market: 42 });
    expect(HOME_LAYOUTS.bottom.defaults).toEqual({ movers: 25, allocation: 25, earnings: 25, news: 25 });
    expect(HOME_LAYOUTS.allocation.defaults).toEqual({ donut: 62, history: 38 });
    const layout = { movers: 12, allocation: 48, earnings: 15, news: 25 };
    expect(parseHomeLayout(JSON.stringify(layout), 'bottom')).toEqual(layout);
    expect(parseHomeLayout('{"holdings":78,"market":22}', 'top')).toEqual({ holdings: 78, market: 22 });
    expect(parseHomeLayout('{"top":66.666667,"bottom":33.333333}', 'rows')).toEqual({ top: 66.666667, bottom: 33.333333 });
  });

  it.each([
    '', 'invalid', 'null', '[]', '42', '{}', '{"top":52}', '{"top":52,"bottom":48,"other":0}',
    '{"top":"52","bottom":48}', '{"top":null,"bottom":48}', '{"top":1e999,"bottom":48}',
    '{"top":-1,"bottom":101}', '{"top":24,"bottom":76}', '{"top":70,"bottom":35}',
    '{"top":0,"bottom":0}', '{"holdings":58,"market":42}', '{"toString":52,"bottom":48}',
  ])('不正な保存値 %s を既定に戻す', (raw) => {
    expect(parseHomeLayout(raw, 'rows')).toEqual(HOME_LAYOUTS.rows.defaults);
  });
});
