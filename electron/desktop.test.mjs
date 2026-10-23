import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findAvailablePort, protectWindowsProcessTree, terminateProcessTree } from './desktop-runner.mjs';
import { createServer } from 'node:net';
import { APP_ID, shortcutDetails, updateShortcutLinks } from '../scripts/create-shortcuts.mjs';
import { startDiscovery } from './discovery.mjs';
import { startSyncRelay } from './sync-relay.mjs';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('プロセスの終了と監視（OS操作はモック）', () => {
  it('killedフラグだけでは回収を省略せず、taskkillの完了まで待つ', async () => {
    const killer = new EventEmitter();
    const spawnProcess = vi.fn(() => killer);
    let finished = false;
    const done = terminateProcessTree({ pid: 123, exitCode: null, signalCode: null, killed: true },
      { platform: 'win32', spawnProcess }).then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(spawnProcess).toHaveBeenCalledWith('taskkill.exe', ['/pid', '123', '/t', '/f'],
      { stdio: 'ignore', windowsHide: true });
    killer.emit('exit', 0);
    await done;
    expect(finished).toBe(true);
  });

  it('taskkillの起動失敗・失敗終了を呼び出し元に伝える', async () => {
    for (const event of ['error', 'exit']) {
      const killer = new EventEmitter();
      const done = terminateProcessTree({ pid: 123, exitCode: null }, { platform: 'win32', spawnProcess: () => killer });
      const assertion = expect(done).rejects.toThrow();
      killer.emit(event, event === 'error' ? new Error('spawn failed') : 1);
      await assertion;
    }
  });

  it('終了済みのプロセスへtaskkillを発行しない', async () => {
    const spawnProcess = vi.fn();
    await terminateProcessTree({ pid: 123, exitCode: 0 }, { platform: 'win32', spawnProcess });
    await terminateProcessTree({ pid: 123, exitCode: null, signalCode: 'SIGKILL' }, { platform: 'win32', spawnProcess });
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('Windows Jobの準備完了を待ち、監視プロセスとパイプをunrefする', async () => {
    const guardian = Object.assign(new EventEmitter(), {
      stdout: Object.assign(new EventEmitter(), { unref: vi.fn() }),
      stderr: Object.assign(new EventEmitter(), { unref: vi.fn() }), unref: vi.fn(),
    });
    const spawnProcess = vi.fn(() => guardian);
    let finished = false;
    const done = protectWindowsProcessTree({ platform: 'win32', spawnProcess }).then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(spawnProcess.mock.calls[0][2].windowsHide).toBe(true);
    guardian.stdout.emit('data', Buffer.from('DESKTOP_JOB_'));
    expect(finished).toBe(false);
    guardian.stdout.emit('data', Buffer.from('READY\r\n'));
    await done;
    expect(guardian.unref).toHaveBeenCalledOnce();
    expect(guardian.stdout.unref).toHaveBeenCalledOnce();
    expect(guardian.stderr.unref).toHaveBeenCalledOnce();
  });

  it('Jobの初期化失敗を握りつぶさない', async () => {
    const guardian = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
    const done = protectWindowsProcessTree({ platform: 'win32', spawnProcess: () => guardian });
    const assertion = expect(done).rejects.toThrow('denied');
    guardian.stderr.emit('data', Buffer.from('denied'));
    guardian.emit('exit', 1);
    await assertion;
  });

  it('使用中のポートを警告し、既存サーバーを停止せず回避する', async () => {
    const occupied = createServer();
    await new Promise((resolve) => occupied.listen(0, '127.0.0.1', resolve));
    const port = occupied.address().port;
    const log = vi.fn();
    try {
      const selected = await findAvailablePort(port, 20, port + 1, log);
      expect(selected).toBeGreaterThan(port + 1);
      expect(log).toHaveBeenCalledWith(expect.stringContaining(`ポート ${port}`));
      expect(occupied.listening).toBe(true);
    } finally { await new Promise((resolve) => occupied.close(resolve)); }
  });
});

describe('同期リレーとmDNSの終了', () => {
  it('リレーは重複closeでも同じ完了通知を返す', async () => {
    const relay = await startSyncRelay({ listenPort: 0, targetOrigin: 'http://127.0.0.1:1' });
    const closing = relay.close();
    expect(relay.close()).toBe(closing);
    await closing;
  });

  it('mDNSのgoodbye送信が完了しなくても500ms後に閉じ、重複closeを許容する', async () => {
    vi.useFakeTimers();
    const socket = Object.assign(new EventEmitter(), {
      bind: (_port, _host, callback) => callback(), addMembership: vi.fn(),
      setMulticastInterface: vi.fn(), setMulticastTTL: vi.fn(), send: vi.fn(), close: vi.fn(),
    });
    const discovery = await startDiscovery({ self: { deviceId: 't30', deviceName: 'test', schemaVersion: 1 },
      port: 38400, addresses: ['192.168.1.2'], socketFactory: () => socket, onPeer: vi.fn() });
    const closing = discovery.close();
    expect(discovery.close()).toBe(closing);
    expect(socket.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    await closing;
    expect(socket.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('ショートカット（実際のlnk作成なし）', () => {
  const root = path.resolve('tmp', 'T30 日本語 space');
  const app = { getPath: (name) => path.join(root, name) };
  const prepare = () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
  };

  it('wscriptとVBSを引用し、AppUserModelIDと新アイコンを指定する', () => {
    const details = shortcutDetails(root);
    expect(details.target).toMatch(/wscript\.exe$/);
    expect(details.args).toBe(`//B //Nologo "${path.join(root, 'scripts', 'launch-desktop.vbs')}"`);
    expect(details.appUserModelId).toBe(APP_ID);
    expect(details.icon).toBe(path.join(root, 'build', 'icon.ico'));
  });

  it('スタートメニューだけを作成し、内容が同じなら書き換えない', () => {
    prepare();
    const shell = { readShortcutLink: vi.fn(() => shortcutDetails(root)), writeShortcutLink: vi.fn(() => true) };
    updateShortcutLinks({ app, shell, root });
    expect(shell.readShortcutLink).toHaveBeenCalledOnce();
    expect(shell.writeShortcutLink).not.toHaveBeenCalled();
    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  it('未作成・旧アイコンは更新し、指定時だけデスクトップにも作成する', () => {
    prepare();
    const shell = { readShortcutLink: vi.fn().mockImplementationOnce(() => { throw new Error('missing'); })
      .mockReturnValueOnce({ ...shortcutDetails(root), icon: 'old.ico' }), writeShortcutLink: vi.fn(() => true) };
    updateShortcutLinks({ app, shell, root, desktop: true });
    expect(shell.writeShortcutLink.mock.calls.map((call) => call[1])).toEqual(['create', 'replace']);
    expect(shell.writeShortcutLink.mock.calls[0][0]).toContain(path.join('Start Menu', 'Programs', 'Portfolio Manager.lnk'));
    expect(shell.writeShortcutLink.mock.calls[1][0]).toBe(path.join(root, 'desktop', 'Portfolio Manager.lnk'));
  });

  it('書き込み失敗を通知する', () => {
    prepare();
    const shell = { readShortcutLink: () => { throw new Error('missing'); }, writeShortcutLink: () => false };
    expect(() => updateShortcutLinks({ app, shell, root })).toThrow('ショートカットを保存できません');
  });
});
