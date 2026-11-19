import { execFile } from 'node:child_process';
import { release, type } from 'node:os';
import { join } from 'node:path';
import { windowsSystem } from '../src/shared/system.js';

const currentVersion = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion';
function windowsField(name: 'InstallationType' | 'DisplayVersion') {
  const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
  return new Promise<string | undefined>((resolve) => {
    // Read only two named machine-wide values. No shell, elevation or user data.
    execFile(executable, ['query', currentVersion, '/v', name], { windowsHide: true, timeout: 1800, maxBuffer: 8192 }, (error, stdout) => {
      resolve(error ? undefined : new RegExp(`^\\s*${name}\\s+REG_SZ\\s+([^\\r\\n]+)`, 'im').exec(stdout)?.[1].trim());
    });
  });
}

export async function systemName(): Promise<string> {
  const arch = process.arch === 'x64' ? 'x64' : process.arch;
  if (process.platform === 'win32') {
    const [installation, version] = await Promise.all([windowsField('InstallationType'), windowsField('DisplayVersion')]);
    return `${windowsSystem(release(), installation, version)} · приложение ${arch}`;
  }
  if (process.platform === 'darwin') return `macOS ${process.getSystemVersion()} · приложение ${arch}`;
  return `${type()} · ядро ${release()} · приложение ${arch}`;
}
