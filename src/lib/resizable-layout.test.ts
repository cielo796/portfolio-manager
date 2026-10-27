import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLayoutStorage, parseResizableLayout, readStorageValue, writeStorageValue, type ResizableLayoutDefinition } from './resizable-layout';

const definition: ResizableLayoutDefinition = {
  storageKey: 'test.layout', defaults: { first: 40, second: 60 }, minimums: { first: 20, second: 30 },
};

afterEach(() => vi.unstubAllGlobals());

describe('共通レイアウトの保存値検証', () => {
  it('構成と最小サイズが一致する保存値と小数を復元する', () => {
    expect(parseResizableLayout('{"second":70,"first":30}', definition)).toEqual({ first: 30, second: 70 });
    expect(parseResizableLayout('{"first":33.333333,"second":66.666667}', definition)).toEqual({ first: 33.333333, second: 66.666667 });
    expect(parseResizableLayout('{"first":20,"second":80}', definition)).toEqual({ first: 20, second: 80 });
  });

  it.each([
    null, '', 'invalid', 'null', '[]', '42', '{}', '{"first":40}', '{"first":40,"second":60,"other":0}',
    '{"first":"40","second":60}', '{"first":null,"second":60}', '{"first":1e999,"second":60}',
    '{"first":-1,"second":101}', '{"first":19,"second":81}', '{"first":71,"second":29}',
    '{"first":40,"second":65}', '{"first":0,"second":0}', '{"old":40,"second":60}', '{"toString":40,"second":60}',
  ])('不正な保存値 %s を既定に戻す', (raw) => {
    expect(parseResizableLayout(raw, definition)).toEqual(definition.defaults);
  });

  it('既定へのフォールバックは定義を書き換えない', () => {
    const fallback = parseResizableLayout(null, definition);
    fallback.first = 99;
    expect(definition.defaults.first).toBe(40);
  });
});

describe('安全なlocalStorage', () => {
  it('ライブラリ側のキーに依存せず定義されたキーで読み書きする', () => {
    const saved = '{"first":30,"second":70}';
    const getItem = vi.fn(() => saved);
    const setItem = vi.fn();
    vi.stubGlobal('window', { localStorage: { getItem, setItem } });
    const storage = createLayoutStorage(definition);
    expect(JSON.parse(storage.getItem('library.internal')!)).toEqual({ first: 30, second: 70 });
    expect(getItem).toHaveBeenCalledWith('test.layout');
    storage.setItem('library.internal', saved);
    expect(setItem).toHaveBeenCalledWith('test.layout', saved);
  });

  it('破損した保存値を安全な既定値へ変換する', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => 'broken' } });
    expect(JSON.parse(createLayoutStorage(definition).getItem('ignored')!)).toEqual(definition.defaults);
  });

  it.each(['server', 'denied', 'quota'])('%s 環境でも読み書きで例外を出さない', (environment) => {
    if (environment === 'server') vi.stubGlobal('window', undefined);
    if (environment === 'denied') vi.stubGlobal('window', { get localStorage() { throw new Error('denied'); } });
    if (environment === 'quota') vi.stubGlobal('window', { localStorage: {
      getItem: () => null, setItem: () => { throw new Error('quota'); },
    } });
    expect(readStorageValue('anything')).toBeNull();
    expect(() => writeStorageValue('anything', 'value')).not.toThrow();
    const storage = createLayoutStorage(definition);
    expect(JSON.parse(storage.getItem('ignored')!)).toEqual(definition.defaults);
    expect(() => storage.setItem('ignored', '{}')).not.toThrow();
  });
});
