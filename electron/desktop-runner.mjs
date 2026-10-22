import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { startSyncRelay } from './sync-relay.mjs';

const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const webScript = mode === 'start' ? 'start' : 'dev';
const basePort = Number(process.env.DESKTOP_PORT || 3001);
const maxPortScan = 20;
const syncPort = Number(process.env.PM_SYNC_PORT || 38400);

let webProcess;
let electronProcess;
let shuttingDown = false;
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

const findAvailablePort = async (startPort, maxScan) => {
  for (let offset = 0; offset < maxScan; offset += 1) {
    const port = startPort + offset;
    if (port === syncPort) continue;
    const available = await isPortAvailable(port);
    if (available) return port;
  }
  throw new Error(`No available port found in range ${startPort}-${startPort + maxScan - 1}`);
};

const runCommand = (command) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, {
      stdio: 'inherit',
      shell: true,
      env: createChildEnv(),
      windowsHide: false,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed (${code ?? 1}): ${command}`));
    });
  });

const terminateProcessTree = (child) => {
  if (!child || child.exitCode !== null || child.killed) return;

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }

  child.kill('SIGTERM');
};

const shutdown = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  syncRelay?.close().catch((error) => console.error('[sync-relay] Failed to close:', error));
  terminateProcessTree(electronProcess);
  terminateProcessTree(webProcess);
  setTimeout(() => process.exit(exitCode), 100);
};

const waitForServer = async (url, timeoutMs = 120000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (webProcess?.exitCode !== null) {
      throw new Error(`Web process exited early (code: ${webProcess.exitCode ?? 1})`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return;
    } catch {
      // Ignore until timeout.
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${url}`);
};

const run = async () => {
  if (webScript === 'start') {
    const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');
    if (!fs.existsSync(buildIdPath)) {
      console.log('[desktop] No production build found. Running npm run build...');
      await runCommand(`${npmCommand} run build`);
    }
  }

  const port = await findAvailablePort(basePort, maxPortScan);
  const startUrl = `http://127.0.0.1:${port}`;
  try {
    syncRelay = await startSyncRelay({
      listenPort: syncPort,
      targetOrigin: startUrl,
      log: (message) => console.info(message),
    });
  } catch (error) {
    console.warn(`[sync-relay] 同期ポート ${syncPort} を使用できないため、LAN同期を無効にします: ${error.message}`);
  }
  const publicSyncPort = syncRelay ? String(syncRelay.port) : '';
  const syncEnv = { PM_SYNC_PORT: publicSyncPort, PM_SYNC_PUBLIC_PORT: publicSyncPort };

  console.log(`[desktop] Starting Next.js (${webScript}) on ${startUrl}`);
  webProcess = spawn(`${npmCommand} run ${webScript} -- --hostname 127.0.0.1 -p ${port}`, {
    stdio: 'inherit',
    shell: true,
    env: createChildEnv(syncEnv),
    windowsHide: false,
  });

  webProcess.on('exit', (code) => {
    if (shuttingDown) return;
    console.error(`[desktop] Web process exited (code: ${code ?? 1})`);
    shutdown(code ?? 1);
  });

  await waitForServer(startUrl);

  console.log('[desktop] Launching Electron...');

  electronProcess = spawn(process.execPath, ['electron/run-electron.mjs'], {
    stdio: 'inherit',
    env: createChildEnv({
      ...syncEnv,
      ELECTRON_START_URL: startUrl,
    }),
    windowsHide: false,
  });

  electronProcess.on('exit', (code) => {
    shutdown(code ?? 0);
  });
};

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));
process.on('uncaughtException', (error) => {
  console.error('[desktop] Uncaught exception:', error);
  shutdown(1);
});
process.on('unhandledRejection', (error) => {
  console.error('[desktop] Unhandled rejection:', error);
  shutdown(1);
});

run().catch((error) => {
  console.error('[desktop] Failed to start desktop mode:', error);
  shutdown(1);
});
