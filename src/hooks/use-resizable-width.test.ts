import { describe, expect, it } from 'vitest';
import { clampWidth, parseStoredWidth } from './use-resizable-width';

const DEFAULTS = { defaultWidth: 240, min: 200, max: 520 };

describe('clampWidth', () => {
  it('範囲内はそのまま返す', () => {
    expect(clampWidth(320, 200, 520)).toBe(320);
  });

  it('min/max でクランプする', () => {
    expect(clampWidth(120, 200, 520)).toBe(200);
    expect(clampWidth(900, 200, 520)).toBe(520);
  });

  it('小数は四捨五入し、数値でなければ min にする', () => {
    expect(clampWidth(240.6, 200, 520)).toBe(241);
    expect(clampWidth(Number.NaN, 200, 520)).toBe(200);
  });
});

describe('parseStoredWidth', () => {
  it('保存されていない場合は既定値', () => {
    expect(parseStoredWidth(null, DEFAULTS.defaultWidth, DEFAULTS.min, DEFAULTS.max)).toBe(240);
  });

  it('保存値を復元する', () => {
    expect(parseStoredWidth('320', DEFAULTS.defaultWidth, DEFAULTS.min, DEFAULTS.max)).toBe(320);
  });

  it.each(['', '  ', 'abc', '240px', 'NaN'])('数値でない保存値 %j は既定値', (raw) => {
    expect(parseStoredWidth(raw, DEFAULTS.defaultWidth, DEFAULTS.min, DEFAULTS.max)).toBe(240);
  });

  it.each(['120', '900'])('範囲外の保存値 %s は既定値', (raw) => {
    expect(parseStoredWidth(raw, DEFAULTS.defaultWidth, DEFAULTS.min, DEFAULTS.max)).toBe(240);
  });

  it('既定値自体が範囲外ならクランプする', () => {
    expect(parseStoredWidth(null, 100, DEFAULTS.min, DEFAULTS.max)).toBe(200);
    expect(parseStoredWidth(null, 800, DEFAULTS.min, DEFAULTS.max)).toBe(520);
  });
});
