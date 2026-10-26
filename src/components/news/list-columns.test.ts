import { describe, expect, it } from 'vitest';
import { clampNewsListColumn, DEFAULT_NEWS_LIST_COLUMNS, NEWS_LIST_COLUMNS_KEY, parseNewsListColumns } from './list-columns';

describe('ニュース一覧の列幅', () => {
  it('専用保存キーと従来の既定幅を使い、有効な変更値を復元する', () => {
    expect(NEWS_LIST_COLUMNS_KEY).toBe('pm.news.listColumns');
    expect(parseNewsListColumns(null)).toEqual({ date: 78, symbol: 60, source: 96 });
    expect(parseNewsListColumns('{"date":100,"symbol":80,"source":140}')).toEqual({ date: 100, symbol: 80, source: 140 });
    expect(parseNewsListColumns('{"date":64,"symbol":44,"source":240}')).toEqual({ date: 64, symbol: 44, source: 240 });
  });

  it.each([
    '', 'broken', 'null', '[]', '42', '{}', '{"date":78,"symbol":60}',
    '{"date":78,"symbol":60,"source":96,"other":1}', '{"date":"78","symbol":60,"source":96}',
    '{"date":63,"symbol":60,"source":96}', '{"date":181,"symbol":60,"source":96}',
    '{"date":78,"symbol":43,"source":96}', '{"date":78,"symbol":141,"source":96}',
    '{"date":78,"symbol":60,"source":63}', '{"date":78,"symbol":60,"source":241}',
    '{"date":78,"symbol":60,"source":1e999}', '{"date":78,"symbol":60,"toString":96}',
  ])('破損・範囲外・旧構成の列幅 %s は既定に戻す', (raw) => {
    expect(parseNewsListColumns(raw)).toEqual(DEFAULT_NEWS_LIST_COLUMNS);
  });

  it('ドラッグやキー入力での幅を制約内に収める', () => {
    expect(clampNewsListColumn('date', -100)).toBe(64);
    expect(clampNewsListColumn('symbol', 1000)).toBe(140);
    expect(clampNewsListColumn('source', 120.7)).toBe(121);
    expect(clampNewsListColumn('source', NaN)).toBe(96);
    expect(clampNewsListColumn('date', Infinity)).toBe(78);
  });
});
