import electron from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { startSyncRelay } from './sync-relay.mjs';

const { app, BrowserWindow, shell } = electron;

const START_URL = process.env.ELECTRON_START_URL;
const packagedBasePort = Number(process.env.DESKTOP_PORT || 38400);
const maxPortScan = 30;
const syncPort = Number(process.env.PM_SYNC_PORT || 38400);

let serverProcess;
let syncRelay;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createChildEnv = (overrides = {}) => {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('=') || value === undefined) continue;
    env[key] = value;
  }
  return {
    ...env,
    ...overrides,
  };
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
    if (serverProcess?.exitCode !== null) {
      throw new Error(`Bundled web server exited early (code: ${serverProcess.exitCode ?? 1})`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // Keep waiting until the server is ready.
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
};

const startBundledServer = async () => {
  if (START_URL) return START_URL;
  if (!app.isPackaged) return 'http://localhost:3000';

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
  try {
    syncRelay = await startSyncRelay({
      listenPort: syncPort,
      targetOrigin: startUrl,
      log: (message) => logStream.write(`${message}\n`),
    });
  } catch (error) {
    const warning = `[sync-relay] 同期ポート ${syncPort} を使用できないため、LAN同期を無効にします: ${error.message}`;
    logStream.write(`${warning}\n`);
    console.warn(warning);
  }
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

  serverProcess.stdout.pipe(logStream);
  serverProcess.stderr.pipe(logStream);
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
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    title: 'Portfolio Manager',
    icon: path.join(app.getAppPath(), 'public', 'app-icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(startUrl);

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(async () => {
  const startUrl = await startBundledServer();
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

app.on('before-quit', () => {
  app.isQuitting = true;
  syncRelay?.close().catch((error) => console.error('[sync-relay] Failed to close:', error));
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
