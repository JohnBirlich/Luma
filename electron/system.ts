import { execFile } from 'node:child_process';
import { net } from 'electron';
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

/**
 * Connectivity as the app experiences it: a short request to a host that answers
 * with no body. The browser's online flag only reports a network interface, not a
 * working route, so the diagnostics card asks twice before it calls the app offline.
 */
export async function probeNetwork(): Promise<boolean> {
  if (!net.isOnline()) return false;
  for (const url of ['https://www.gstatic.com/generate_204', 'https://api.github.com/zen']) {
    try {
      const response = await net.fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(4_000) });
      void response.body?.cancel().catch(() => {});
      if (response.ok || response.status === 204) return true;
    } catch { /* an unreachable host says nothing about the next one */ }
  }
  return false;
}
