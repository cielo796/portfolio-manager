import { EventEmitter } from 'node:events';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ ownsInstance: true }));
vi.mock('electron', () => ({ default: {
  get app() { return mock.app; },
  get BrowserWindow() { return mock.BrowserWindow; },
  get shell() { return mock.shell; },
} }));
vi.mock('./desktop-runner.mjs', () => ({
  createChildEnv: vi.fn((env) => env), protectWindowsProcessTree: vi.fn(), terminateProcessTree: vi.fn(),
}));
vi.mock('../scripts/create-shortcuts.mjs', () => ({
  APP_ID: 'com.cielo.portfolio-manager', APP_NAME: 'Portfolio Manager', repositoryRoot: 'D:\\test repository',
  shortcutDetails: vi.fn(() => ({ target: 'C:\\Windows\\System32\\wscript.exe',
    args: '//B //Nologo "D:\\test repository\\scripts\\launch-desktop.vbs"', icon: 'D:\\test repository\\build\\icon.ico' })),
  updateShortcutLinks: vi.fn(),
}));

let originalSend;
let messageListeners;
let disconnectListeners;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mock.ownsInstance = true;
  mock.app = Object.assign(new EventEmitter(), {
    isPackaged: false, requestSingleInstanceLock: vi.fn(() => mock.ownsInstance),
    setAppUserModelId: vi.fn(), whenReady: vi.fn(() => Promise.resolve()), quit: vi.fn(),
  });
  mock.window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false, isMinimized: () => true,
    restore: vi.fn(), show: vi.fn(), focus: vi.fn(), setAppDetails: vi.fn(), loadURL: vi.fn(),
    webContents: Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn() }),
  });
  mock.BrowserWindow = vi.fn(function () { return mock.window; });
  mock.BrowserWindow.getAllWindows = () => [mock.window];
  mock.shell = { openExternal: vi.fn() };
  originalSend = process.send;
  process.send = vi.fn((_message, callback) => callback?.());
  messageListeners = new Set(process.listeners('message'));
  disconnectListeners = new Set(process.listeners('disconnect'));
  vi.stubEnv('PM_DESKTOP_RUNNER', '1');
});

afterEach(() => {
  process.send = originalSend;
  for (const listener of process.listeners('message')) if (!messageListeners.has(listener)) process.removeListener('message', listener);
  for (const listener of process.listeners('disconnect')) if (!disconnectListeners.has(listener)) process.removeListener('disconnect', listener);
  vi.unstubAllEnvs();
});

describe('Electronメイン処理（Electronを起動しないモック検証）', () => {
  it('二重起動なら即終了し、ウィンドウ・サーバーを作成しない', async () => {
    mock.ownsInstance = false;
    await import('./main.mjs');
    expect(mock.app.quit).toHaveBeenCalledOnce();
    expect(mock.app.whenReady).not.toHaveBeenCalled();
    expect(mock.BrowserWindow).not.toHaveBeenCalled();
    expect(process.send).not.toHaveBeenCalled();
  });

  it('IPCの準備通知後にURLを待ち、同じAppID・アイコン・VBSでタスクバーを設定する', async () => {
    await import('./main.mjs');
    await vi.waitFor(() => expect(process.send).toHaveBeenCalledWith({ type: 'desktop-ready' }, expect.any(Function)));
    expect(mock.BrowserWindow).not.toHaveBeenCalled();
    process.emit('message', { type: 'desktop-start', url: 'http://127.0.0.1:3001' });
    await vi.waitFor(() => expect(mock.window.loadURL).toHaveBeenCalledWith('http://127.0.0.1:3001'));
    expect(mock.app.setAppUserModelId).toHaveBeenCalledWith('com.cielo.portfolio-manager');
    if (process.platform === 'win32') {
      expect(mock.window.setAppDetails).toHaveBeenCalledWith({
        appId: 'com.cielo.portfolio-manager', appIconPath: 'D:\\test repository\\build\\icon.ico', appIconIndex: 0,
        relaunchCommand: '"C:\\Windows\\System32\\wscript.exe" //B //Nologo "D:\\test repository\\scripts\\launch-desktop.vbs"',
        relaunchDisplayName: 'Portfolio Manager',
      });
    }
    expect(mock.BrowserWindow.mock.calls[0][0].icon).toBe(path.join('D:\\test repository', 'public', 'app-icon.png'));
    mock.app.emit('second-instance');
    expect(mock.window.restore).toHaveBeenCalledOnce();
    expect(mock.window.focus).toHaveBeenCalledOnce();
    process.emit('disconnect');
    expect(mock.app.quit).toHaveBeenCalledOnce();
  });

  it('起動途中の二重起動要求はウィンドウ作成後に前面へ反映する', async () => {
    await import('./main.mjs');
    await vi.waitFor(() => expect(process.send).toHaveBeenCalled());
    mock.app.emit('second-instance');
    process.emit('message', { type: 'desktop-start', url: 'http://127.0.0.1:3002' });
    await vi.waitFor(() => expect(mock.BrowserWindow).toHaveBeenCalledOnce());
    mock.window.emit('ready-to-show');
    expect(mock.window.show).toHaveBeenCalledOnce();
    expect(mock.window.focus).toHaveBeenCalledOnce();
  });
});
