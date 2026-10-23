import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// アプリ・Next.js・DBを使わず、専用のダミーNodeプロセスだけでJobの実動作を確認する。
const runnerUrl = new URL('./desktop-runner.mjs', import.meta.url).href;
const root = fileURLToPath(new URL('../', import.meta.url));
const grandchild = `
  const server = require('node:net').createServer();
  server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ pid: process.pid, port: server.address().port })));
`;
const child = `
  require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], {
    stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
  });
  setInterval(() => {}, 1000);
`;
const fixtureSource = `
  import { spawn } from 'node:child_process';
  import { protectWindowsProcessTree } from ${JSON.stringify(runnerUrl)};
  await protectWindowsProcessTree();
  const child = spawn(process.execPath, ['-e', ${JSON.stringify(child)}], {
    stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
    if (output.includes('\\n')) process.send({ childPid: child.pid, ...JSON.parse(output.trim()) });
  });
  process.on('message', () => process.exit(0));
`;

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const accepting = (port) => new Promise((resolve) => {
  const socket = createConnection({ host: '127.0.0.1', port });
  socket.once('connect', () => { socket.destroy(); resolve(true); });
  socket.once('error', () => resolve(false));
});

describe.skipIf(process.platform !== 'win32')('Windows Job Object（ダミープロセスの実動作）', () => {
  for (const mode of ['normal', 'forced']) {
    it(`${mode}: 親終了時に子・孫とLISTENポートを回収する`, async () => {
      const fixture = spawn(process.execPath, ['--input-type=module', '-e', fixtureSource], {
        cwd: root, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true,
      });
      let errors = '';
      fixture.stderr.on('data', (data) => { errors += data; });
      let info;
      try {
        info = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`fixture timeout: ${errors}`)), 35_000);
          fixture.once('message', (value) => { clearTimeout(timer); resolve(value); });
          fixture.once('error', (error) => { clearTimeout(timer); reject(error); });
          fixture.once('exit', (code) => { clearTimeout(timer); reject(new Error(`fixture exited (${code}): ${errors}`)); });
        });
        expect(await accepting(info.port)).toBe(true);
        const exited = once(fixture, 'exit');
        if (mode === 'normal') fixture.send('quit');
        else fixture.kill('SIGKILL');
        await exited;
        const deadline = Date.now() + 8000;
        while ((alive(info.childPid) || alive(info.pid)) && Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        expect(alive(info.childPid)).toBe(false);
        expect(alive(info.pid)).toBe(false);
        expect(await accepting(info.port)).toBe(false);
      } finally {
        // テストで作成したPIDだけを片付ける。
        for (const pid of [fixture.pid, info?.childPid, info?.pid]) {
          if (pid && alive(pid)) {
            const cleanup = spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
            await once(cleanup, 'exit');
          }
        }
      }
    }, 50_000);
  }
});
