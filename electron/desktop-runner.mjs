import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { startSyncRelay } from './sync-relay.mjs';
import { discoveryAddresses, startDiscovery } from './discovery.mjs';

const filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(filename), '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const createChildEnv = (overrides = {}) => {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('=') || value === undefined) continue;
    env[key] = value;
  }
  return { ...env, ...overrides };
};

// Jobのハンドルは監視用PowerShellだけが保持し、親の強制終了時にも子孫を回収する。
export async function protectWindowsProcessTree({ platform = process.platform, spawnProcess = spawn } = {}) {
  if (platform !== 'win32') return;
  const script = `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class DesktopJob {
  [StructLayout(LayoutKind.Sequential)] struct Basic {
    public long ProcessTime, JobTime;
    public uint Flags;
    public UIntPtr MinWorkingSet, MaxWorkingSet;
    public uint ActiveProcesses;
    public UIntPtr Affinity;
    public uint Priority, Scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] struct Io {
    public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
  }
  [StructLayout(LayoutKind.Sequential)] struct Extended {
    public Basic Limits;
    public Io Counters;
    public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
  }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref Extended info, uint size);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static void Watch(int pid) {
    IntPtr parent = OpenProcess(0x00100101, false, pid);
    if (parent == IntPtr.Zero) throw new Win32Exception();
    IntPtr job = CreateJobObject(IntPtr.Zero, null);
    try {
      if (job == IntPtr.Zero) throw new Win32Exception();
      Extended info = new Extended();
      info.Limits.Flags = 0x2000;
      if (!SetInformationJobObject(job, 9, ref info, (uint)Marshal.SizeOf(info))) throw new Win32Exception();
      if (!AssignProcessToJobObject(job, parent)) throw new Win32Exception();
      Console.WriteLine("DESKTOP_JOB_READY");
      Console.Out.Flush();
      if (WaitForSingleObject(parent, 0xffffffff) != 0) throw new Win32Exception();
    } finally {
      if (job != IntPtr.Zero) CloseHandle(job);
      CloseHandle(parent);
    }
  }
}
'@
[DesktopJob]::Watch(${process.pid})`;
  await new Promise((resolve, reject) => {
    const guardian = spawnProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64')], {
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: createChildEnv(),
    });
    let output = '';
    let errors = '';
    const timer = setTimeout(() => {
      reject(new Error('Windows Job Objectの準備がタイムアウトしました。'));
      guardian.kill();
    }, 30_000);
    const fail = (error) => { clearTimeout(timer); reject(error); };
    guardian.once('error', fail);
    guardian.stderr.on('data', (data) => { errors = `${errors}${data}`.slice(-4000); });
    guardian.stdout.on('data', (data) => {
      output += data;
      if (!output.includes('DESKTOP_JOB_READY')) return;
      clearTimeout(timer);
      guardian.unref();
      guardian.stdout.unref();
      guardian.stderr.unref();
      resolve();
    });
    guardian.once('exit', (code) => fail(new Error(`Windows Job Object監視が終了しました (${code}): ${errors}`)));
  });
}

export async function terminateProcessTree(child, { platform = process.platform, spawnProcess = spawn } = {}) {
  if (!child?.pid || child.exitCode !== null || child.signalCode != null) return;
  if (platform === 'win32') {
    await new Promise((resolve, reject) => {
      const killer = spawnProcess('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore', windowsHide: true,
      });
      const timer = setTimeout(() => { killer.kill(); reject(new Error(`taskkill timeout: ${child.pid}`)); }, 8000);
      killer.once('error', (error) => { clearTimeout(timer); reject(error); });
      killer.once('exit', (code) => {
        clearTimeout(timer);
        if (code === 0 || child.exitCode !== null || child.signalCode != null) resolve();
        else reject(new Error(`taskkill failed (${code}): ${child.pid}`));
      });
    });
    return;
  }
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

export const isPortAvailable = (port) => new Promise((resolve) => {
  const server = createServer();
  server.once('error', () => resolve(false));
  server.once('listening', () => server.close(() => resolve(true)));
  server.listen(port, '127.0.0.1');
});

export async function findAvailablePort(startPort, maxScan, syncPort, log = console.warn) {
  for (let offset = 0; offset < maxScan; offset += 1) {
    const port = startPort + offset;
    if (port === syncPort) continue;
    if (await isPortAvailable(port)) return port;
    log(`[desktop] ポート ${port} は使用中です。前回の孤立したNext.jsの可能性もあるため、別ポートを探します（既存プロセスは終了しません）。`);
  }
  throw new Error(`No available port found in range ${startPort}-${startPort + maxScan - 1}`);
}

export async function runDesktop() {
  const mode = process.argv[2] === 'start' ? 'start' : 'dev';
  const basePort = Number(process.env.DESKTOP_PORT || 3001);
  const syncPort = Number(process.env.PM_SYNC_PORT || 38400);
  const discoveryToken = randomBytes(32).toString('hex');
  let webProcess;
  let electronProcess;
  let buildProcess;
  let syncRelay;
  let discovery;
  let discoveryTimer;
  let shuttingDown = false;

  const shutdown = async (exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(discoveryTimer);
    const deadline = setTimeout(() => process.exit(exitCode || 1), 12_000);
    const results = await Promise.allSettled([
      discovery?.close(), syncRelay?.close(),
      terminateProcessTree(electronProcess), terminateProcessTree(webProcess), terminateProcessTree(buildProcess),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[desktop] 終了処理に失敗しました:', result.reason);
        exitCode ||= 1;
      }
    }
    clearTimeout(deadline);
    process.exit(exitCode);
  };
  process.on('SIGINT', () => { void shutdown(130); });
  process.on('SIGTERM', () => { void shutdown(143); });
  process.on('SIGHUP', () => { void shutdown(129); });
  for (const event of ['uncaughtException', 'unhandledRejection']) {
    process.on(event, (error) => { console.error(`[desktop] ${event}:`, error); void shutdown(1); });
  }

  try {
    console.info(`[desktop] ${new Date().toISOString()} Starting (${mode}), repository: ${root}`);
    await protectWindowsProcessTree();
    if (shuttingDown) return;
    const electronPath = createRequire(import.meta.url)('electron');
    const electronEnv = createChildEnv({ PM_DESKTOP_RUNNER: '1' });
    delete electronEnv.ELECTRON_RUN_AS_NODE;
    // 二重起動ではサーバーを作らず、Electronのsecond-instanceで既存ウィンドウを表示する。
    electronProcess = spawn(electronPath, [root], {
      cwd: root, env: electronEnv, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true,
    });
    electronProcess.once('exit', (code, signal) => { void shutdown(code ?? (signal ? 1 : 0)); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Electronの起動待機がタイムアウトしました。')), 30_000);
      electronProcess.once('error', (error) => { clearTimeout(timer); reject(error); });
      electronProcess.once('exit', () => { clearTimeout(timer); resolve(); });
      electronProcess.once('message', (message) => {
        clearTimeout(timer);
        if (message?.type === 'desktop-ready') resolve();
        else reject(new Error('Electronから不正な準備応答を受信しました。'));
      });
    });
    if (shuttingDown) return;

    const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
    const patch = path.join(root, 'scripts', 'node-readlink-eisdir-fix.cjs');
    if (mode === 'start' && !fs.existsSync(path.join(root, '.next', 'BUILD_ID'))) {
      console.info('[desktop] No production build found. Building Next.js...');
      await new Promise((resolve, reject) => {
        buildProcess = spawn(process.execPath, ['--require', patch, nextBin, 'build', '--webpack'], {
          cwd: root, env: createChildEnv(), stdio: 'inherit', windowsHide: true,
        });
        buildProcess.once('error', reject);
        buildProcess.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Build failed (${code})`)));
      });
    }
    if (shuttingDown) return;
    const port = await findAvailablePort(basePort, 20, syncPort);
    if (shuttingDown) return;
    const startUrl = `http://127.0.0.1:${port}`;
    try {
      const relay = await startSyncRelay({ listenPort: syncPort, targetOrigin: startUrl, log: console.info });
      if (shuttingDown) { await relay.close(); return; }
      syncRelay = relay;
    } catch (error) {
      console.warn(`[sync-relay] 同期ポート ${syncPort} を使用できないため、LAN同期を無効にします: ${error.message}`);
    }
    if (shuttingDown) return;
    const publicSyncPort = syncRelay ? String(syncRelay.port) : '';
    const syncEnv = { PM_SYNC_PORT: publicSyncPort, PM_SYNC_PUBLIC_PORT: publicSyncPort, PM_DISCOVERY_TOKEN: discoveryToken };
    console.info(`[desktop] Starting Next.js (${mode}) on ${startUrl}`);
    const nodeArgs = ['--require', patch, nextBin, mode, ...(mode === 'dev' ? ['--webpack'] : []), '--hostname', '127.0.0.1', '-p', String(port)];
    webProcess = spawn(process.execPath, nodeArgs, {
      cwd: root, env: createChildEnv(syncEnv), stdio: 'inherit', windowsHide: true,
    });
    webProcess.once('error', (error) => { console.error('[desktop] Next.js起動失敗:', error); void shutdown(1); });
    webProcess.once('exit', (code, signal) => {
      if (!shuttingDown) console.error(`[desktop] Web process exited (${code ?? signal})`);
      void shutdown(code ?? 1);
    });
    const deadline = Date.now() + 120_000;
    let ready = false;
    while (!shuttingDown && Date.now() < deadline) {
      if (webProcess.exitCode !== null || webProcess.signalCode !== null) throw new Error('Web process exited early');
      try {
        const response = await fetch(startUrl, { signal: AbortSignal.timeout(2000) });
        await response.body?.cancel();
        if (response.ok) { ready = true; break; }
      } catch { /* 起動を待つ */ }
      await sleep(500);
    }
    if (shuttingDown) return;
    if (!ready) throw new Error(`Timed out waiting for ${startUrl}`);

    let discoveryIdentity = '';
    let refreshingDiscovery = false;
    const refreshDiscovery = async () => {
      if (refreshingDiscovery || shuttingDown) return;
      refreshingDiscovery = true;
      try {
        const headers = { 'x-pm-discovery-token': discoveryToken };
        const response = await fetch(`${startUrl}/api/sync/discovery`, { headers, signal: AbortSignal.timeout(3000) });
        if (!response.ok) throw new Error(`Internal discovery: ${response.status}`);
        const self = await response.json();
        const addresses = discoveryAddresses();
        const identity = JSON.stringify({ self, addresses });
        if (syncRelay && identity !== discoveryIdentity && !shuttingDown) {
          await discovery?.close();
          if (shuttingDown) return;
          const nextDiscovery = await startDiscovery({ self, addresses, port: syncRelay.port, log: console.warn, onPeer: (peer) => {
            if (shuttingDown) return;
            void fetch(`${startUrl}/api/sync/discovery`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify(peer), signal: AbortSignal.timeout(3000) }).catch(() => {});
          } });
          if (shuttingDown) { await nextDiscovery.close(); return; }
          discovery = nextDiscovery;
          discoveryIdentity = discovery.activeInterfaces ? identity : '';
        }
      } catch (error) { console.warn(`[discovery] ${error.message}`); }
      finally { refreshingDiscovery = false; }
    };
    await refreshDiscovery();
    if (shuttingDown) return;
    discoveryTimer = setInterval(() => { void refreshDiscovery(); }, 30_000);
    electronProcess.send({ type: 'desktop-start', url: startUrl }, (error) => {
      if (error && !shuttingDown) { console.error('[desktop] Electron通信失敗:', error); void shutdown(1); }
    });
  } catch (error) {
    console.error('[desktop] Failed to start desktop mode:', error);
    await shutdown(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === filename) void runDesktop();
