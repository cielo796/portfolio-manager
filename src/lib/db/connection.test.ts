import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const realDbPath = path.resolve(process.cwd(), 'data', 'portfolio.db');
const tempDbPath = path.resolve(process.cwd(), 'tmp', 't11b-test.db');
const errorMessage = 'PM_FORBID_REAL_DB=1 のため実DB（data/portfolio.db）は開けません。SQLITE_DB_PATH に一時ファイルを指定してください。';

describe('実DBを開けなくするガード', () => {
  let assertNotForbiddenPath: typeof import('./connection').assertNotForbiddenPath;

  beforeAll(async () => {
    // 実DBを開かないよう、動的 import の前に一時パスを設定する
    vi.stubEnv('SQLITE_DB_PATH', tempDbPath);
    ({ assertNotForbiddenPath } = await import('./connection'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('PM_FORBID_REAL_DB=1 のとき実DBのパスで例外になる', () => {
    vi.stubEnv('PM_FORBID_REAL_DB', '1');
    expect(() => assertNotForbiddenPath(realDbPath)).toThrow(errorMessage);
    expect(() => assertNotForbiddenPath('data/portfolio.db')).toThrow(errorMessage);
  });

  it('大文字小文字が違う実DBのパスでも例外になる', () => {
    vi.stubEnv('PM_FORBID_REAL_DB', '1');
    expect(() => assertNotForbiddenPath(realDbPath.toUpperCase())).toThrow(errorMessage);
    expect(() => assertNotForbiddenPath('DATA/Portfolio.DB')).toThrow(errorMessage);
  });

  it('一時パスでは例外にならない', () => {
    vi.stubEnv('PM_FORBID_REAL_DB', '1');
    expect(() => assertNotForbiddenPath(tempDbPath)).not.toThrow();
  });

  it('PM_FORBID_REAL_DB が無いときは実DBのパスでも例外にならない', () => {
    vi.stubEnv('PM_FORBID_REAL_DB', undefined);
    // 判定関数だけを呼び、実際に実DBは開かない
    expect(() => assertNotForbiddenPath(realDbPath)).not.toThrow();
  });

  it('PM_FORBID_REAL_DB が 1 以外のときは実DBのパスでも例外にならない', () => {
    vi.stubEnv('PM_FORBID_REAL_DB', '0');
    expect(() => assertNotForbiddenPath(realDbPath)).not.toThrow();
  });
});
