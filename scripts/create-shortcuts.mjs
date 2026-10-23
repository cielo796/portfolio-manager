import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const APP_ID = 'com.cielo.portfolio-manager';
export const APP_NAME = 'Portfolio Manager';
const scriptPath = fileURLToPath(import.meta.url);
export const repositoryRoot = path.resolve(path.dirname(scriptPath), '..');

export function shortcutDetails(root = repositoryRoot, executable) {
  if (executable) {
    return { target: executable, args: '', cwd: path.dirname(executable),
      description: APP_NAME, icon: path.join(root, 'build', 'icon.ico'), iconIndex: 0, appUserModelId: APP_ID };
  }
  return {
    target: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe'),
    args: `//B //Nologo "${path.join(root, 'scripts', 'launch-desktop.vbs')}"`,
    cwd: root,
    description: APP_NAME,
    icon: path.join(root, 'build', 'icon.ico'),
    iconIndex: 0,
    appUserModelId: APP_ID,
  };
}

export function updateShortcutLinks({ app, shell, desktop = false, root = repositoryRoot, executable }) {
  const details = shortcutDetails(root, executable);
  if (!fs.existsSync(details.icon)) throw new Error(`アイコンが見つかりません: ${details.icon}`);
  const directories = [path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')];
  if (desktop) directories.push(app.getPath('desktop'));
  for (const directory of directories) {
    const link = path.join(directory, `${APP_NAME}.lnk`);
    let current;
    try { current = shell.readShortcutLink(link); } catch { /* 未作成・破損時は作り直す */ }
    if (current && Object.entries(details).every(([key, value]) => current[key] === value)) continue;
    fs.mkdirSync(directory, { recursive: true });
    if (!shell.writeShortcutLink(link, current ? 'replace' : 'create', details)) {
      throw new Error(`ショートカットを保存できません: ${link}`);
    }
  }
}

async function run() {
  if (process.platform !== 'win32') throw new Error('ショートカット作成はWindows専用です。');
  const electron = (await import('electron')).default;
  if (process.versions.electron) {
    const { app, shell } = electron;
    await app.whenReady();
    try {
      updateShortcutLinks({ app, shell, desktop: true });
      console.info('[desktop] スタートメニューとデスクトップのショートカットを確認しました。');
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  } else {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [scriptPath], { env, stdio: 'inherit', windowsHide: true });
    child.once('error', (error) => { console.error(error); process.exitCode = 1; });
    child.once('exit', (code) => { process.exitCode = code ?? 1; });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  run().catch((error) => { console.error(error); process.exitCode = 1; });
}
