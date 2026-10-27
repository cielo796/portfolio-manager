import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Holding, StockPrice } from '@/types';
import { MetricsPane } from './metrics-pane';

const holding: Holding = { id: 'one', portfolio_id: 'a', symbol: 'NVDA', market: 'US', shares: 2, avg_cost: 100, sort_order: 0, created_at: '', updated_at: '' };
const render = (holdings: Holding[], price?: StockPrice) => renderToStaticMarkup(createElement(MetricsPane, { holdings, price, loading: false }));

describe('詳細画面の保有指標', () => {
  it('価格未取得時は取得単価で評価損益を代用しない', () => {
    const html = render([holding]);
    expect(html).toContain('取得単価');
    expect(html.match(/価格未取得/g)).toHaveLength(3);
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });

  it('全口座の数量と取得額を合算して損益・当日損益を計算する', () => {
    const html = render([holding, { ...holding, id: 'two', portfolio_id: 'b', shares: 3, avg_cost: 200 }], {
      symbol: 'NVDA', market: 'US', name: 'NVIDIA', price: 180, change: 10, change_percent: 10 / 170 * 100, currency: 'USD', updated_at: '',
    });
    expect(html).toContain('$160.00');
    expect(html).toContain('$900.00');
    expect(html).toContain('$100.00');
    expect(html).toContain('+12.5%');
    expect(html).toContain('$50.00');
  });

  it('未保有銘柄では保有情報を表示せず、財務指標の欠損はダッシュで示す', () => {
    const html = render([]);
    expect(html).not.toContain('保有数量');
    expect(html).toContain('財務・バリュエーション');
    expect(html).toContain('—');
  });
});
