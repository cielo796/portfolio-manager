import { describe, expect, it } from 'vitest';
import { createHoldingsCsv, holdingsCsvFilename } from './csv';

describe('保有銘柄CSV', () => {
  it('BOM・日本語ヘッダー・CRLFを出力する', () => {
    expect(createHoldingsCsv(['コード', '銘柄名'], [['7203', 'トヨタ自動車']]))
      .toBe('\uFEFFコード,銘柄名\r\n7203,トヨタ自動車\r\n');
  });

  it('カンマ・改行・ダブルクォートをエスケープする', () => {
    expect(createHoldingsCsv(['メモ'], [['a,b'], ['a\nb'], ['a\rb'], ['a"b']]))
      .toBe('\uFEFFメモ\r\n"a,b"\r\n"a\nb"\r\n"a\rb"\r\n"a""b"\r\n');
  });

  it('表示中の列と行の順序を保持し空欄も出力する', () => {
    expect(createHoldingsCsv(['銘柄名', 'コード'], [['Apple', 'AAPL'], ['', '7203']]))
      .toBe('\uFEFF銘柄名,コード\r\nApple,AAPL\r\n,7203\r\n');
    expect(createHoldingsCsv(['コード'], [])).toBe('\uFEFFコード\r\n');
  });

  it('ローカル日付でファイル名を作る', () => {
    expect(holdingsCsvFilename(new Date(2026, 0, 2))).toBe('holdings-20260102.csv');
  });
});
