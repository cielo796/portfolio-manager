import electron from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { startSyncRelay } from './sync-relay.mjs';
import { createChildEnv, protectWindowsProcessTree, terminateProcessTree } from './desktop-runner.mjs';
import { APP_ID, APP_NAME, repositoryRoot, shortcutDetails, updateShortcutLinks } from '../scripts/create-shortcuts.mjs';

const { app, BrowserWindow, shell } = electron;

app.setAppUserModelId(APP_ID);
const ownsInstance = app.requestSingleInstanceLock();

const START_URL = process.env.ELECTRON_START_URL;
const packagedBasePort = Number(process.env.DESKTOP_PORT || 38400);
const maxPortScan = 30;
const syncPort = Number(process.env.PM_SYNC_PORT || 38400);

let serverProcess;
let syncRelay;
let serverLog;
let primaryWindow;
let cleanupStarted = false;
let cleanupFinished = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const focusWindow = () => {
  if (!primaryWindow || primaryWindow.isDestroyed()) return;
  if (primaryWindow.isMinimized()) primaryWindow.restore();
  if (!primaryWindow.isVisible()) primaryWindow.show();
  primaryWindow.focus();
};

app.on('second-instance', focusWindow);

const runnerStartUrl = async () => {
  if (process.env.PM_DESKTOP_RUNNER !== '1') return START_URL;
  if (!process.send) throw new Error('desktop-runnerとのIPC接続がありません。');
  return new Promise((resolve, reject) => {
    process.once('message', (message) => {
      if (message?.type === 'desktop-start' && /^http:\/\/127\.0\.0\.1:\d+$/.test(message.url)) resolve(message.url);
      else reject(new Error('desktop-runnerから不正な起動URLを受信しました。'));
    });
    process.once('disconnect', () => app.quit());
    process.send({ type: 'desktop-ready' }, (error) => { if (error) reject(error); });
  });
};

const isPortAvailable = async (port) =>
  new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });

const findAvailablePort = async () => {
  for (let offset = 0; offset < maxPortScan; offset += 1) {
    const port = packagedBasePort + offset;
    if (port === syncPort) continue;
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found in range ${packagedBasePort}-${packagedBasePort + maxPortScan - 1}`);
};

const waitForServer = async (url, timeoutMs = 120000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (app.isQuitting) throw new Error('起動が中止されました。');
    if (serverProcess?.exitCode !== null || serverProcess?.signalCode !== null) {
      throw new Error(`Bundled web server exited early (code: ${serverProcess.exitCode ?? 1})`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      // Keep waiting until the server is ready.
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
};

const startBundledServer = async () => {
  const externalUrl = await runnerStartUrl();
  if (externalUrl) return externalUrl;
  if (!app.isPackaged) return 'http://localhost:3000';

  await protectWindowsProcessTree();
  if (app.isQuitting) throw new Error('起動が中止されました。');

  const resourcesPath = process.resourcesPath;
  const appRoot = path.join(resourcesPath, 'app');
  const nodePath = path.join(resourcesPath, 'node', process.platform === 'win32' ? 'node.exe' : 'bin/node');
  const nextBin = path.join(appRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  const readlinkPatch = path.join(appRoot, 'scripts', 'node-readlink-eisdir-fix.cjs');
  const dbPath = process.env.SQLITE_DB_PATH || path.join(app.getPath('userData'), 'portfolio.db');

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const port = await findAvailablePort();
  const startUrl = `http://127.0.0.1:${port}`;
  const logPath = path.join(app.getPath('userData'), 'next-server.log');
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  serverLog = logStream;
  logStream.on('error', (error) => { console.error('[desktop] ログ書き込み失敗:', error); app.quit(); });
  try {
    const relay = await startSyncRelay({
      listenPort: syncPort,
      targetOrigin: startUrl,
      log: (message) => logStream.write(`${message}\n`),
    });
    if (app.isQuitting) { await relay.close(); throw new Error('起動が中止されました。'); }
    syncRelay = relay;
  } catch (error) {
    const warning = `[sync-relay] 同期ポート ${syncPort} を使用できないため、LAN同期を無効にします: ${error.message}`;
    logStream.write(`${warning}\n`);
    console.warn(warning);
  }
  if (app.isQuitting) throw new Error('起動が中止されました。');
  const publicSyncPort = syncRelay ? String(syncRelay.port) : '';
  const nodeArgs = [
    '--require',
    readlinkPatch,
    nextBin,
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ];

  serverProcess = spawn(nodePath, nodeArgs, {
    cwd: appRoot,
    env: createChildEnv({
      NODE_ENV: 'production',
      SQLITE_DB_PATH: dbPath,
      PM_SYNC_PORT: publicSyncPort,
      PM_SYNC_PUBLIC_PORT: publicSyncPort,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProcess.stdout.pipe(logStream, { end: false });
  serverProcess.stderr.pipe(logStream, { end: false });
  serverProcess.on('error', (error) => { console.error('[desktop] サーバー起動失敗:', error); app.quit(); });
  serverProcess.on('exit', (code) => {
    if (!app.isQuitting) {
      console.error(`Bundled web server exited with code ${code ?? 1}. See ${logPath}`);
      app.quit();
    }
  });

  await waitForServer(startUrl);
  return startUrl;
};

function createWindow(startUrl) {
  const appRoot = app.isPackaged ? path.join(process.resourcesPath, 'app') : repositoryRoot;
  const windowsIcon = path.join(appRoot, 'build', 'icon.ico');
  const icon = process.platform === 'win32' && fs.existsSync(windowsIcon)
    ? windowsIcon
    : path.join(appRoot, 'public', 'app-icon.png');
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    title: 'Portfolio Manager',
    icon,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  primaryWindow = win;
  if (process.platform === 'win32') {
    const details = shortcutDetails(appRoot, app.isPackaged ? process.execPath : undefined);
    win.setAppDetails({
      appId: APP_ID, appIconPath: details.icon, appIconIndex: 0,
      relaunchCommand: `"${details.target}"${details.args ? ` ${details.args}` : ''}`,
      relaunchDisplayName: APP_NAME,
    });
  }

  let fallbackTimer;
  const reveal = () => {
    if (win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
  };
  const revealAndFocus = () => {
    reveal();
    win.focus();
  };

  win.once('closed', () => {
    clearTimeout(fallbackTimer);
    if (primaryWindow === win) primaryWindow = undefined;
  });
  // 描画準備後に表示し、直後に非表示へ戻る環境向けに300ms後も確認する。
  win.once('ready-to-show', () => {
    clearTimeout(fallbackTimer);
    revealAndFocus();
    setTimeout(() => {
      if (win.isDestroyed() || win.isVisible()) return;
      if (win.isMinimized()) win.restore();
      win.show();
    }, 300);
  });
  // 読み込み失敗などでready-to-showが来なくても非表示のままにしない。
  win.webContents.on('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
    if (isMainFrame === false) return;
    clearTimeout(fallbackTimer);
    revealAndFocus();
  });
  fallbackTimer = setTimeout(revealAndFocus, 5000);

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[desktop] Renderer exited: ${details.reason}`);
    app.quit();
  });

  win.loadURL(startUrl);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

if (ownsInstance) app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    try {
      updateShortcutLinks({ app, shell,
        root: app.isPackaged ? path.join(process.resourcesPath, 'app') : repositoryRoot,
        executable: app.isPackaged ? process.execPath : undefined });
    } catch (error) { console.warn('[desktop] ショートカット更新失敗:', error); }
  }
  const startUrl = await startBundledServer();
  if (app.isQuitting) return;
  createWindow(startUrl);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(startUrl);
    }
  });
}).catch((error) => {
  console.error('[desktop] Failed to start bundled app:', error);
  app.quit();
});

app.on('before-quit', (event) => {
  app.isQuitting = true;
  if (cleanupFinished || (!serverProcess && !syncRelay)) return;
  event.preventDefault();
  if (cleanupStarted) return;
  cleanupStarted = true;
  const deadline = setTimeout(() => app.exit(1), 12_000);
  Promise.allSettled([syncRelay?.close(), terminateProcessTree(serverProcess)]).then((results) => {
    for (const result of results) {
      if (result.status === 'rejected') console.error('[desktop] 終了処理に失敗しました:', result.reason);
    }
    serverLog?.end();
    clearTimeout(deadline);
    cleanupFinished = true;
    app.quit();
  });
});

if (!ownsInstance) app.quit();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
