import { spawn } from 'node:child_process';
import electronPath from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['electron/main.mjs'], {
  stdio: 'inherit',
  env,
  windowsHide: false,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
