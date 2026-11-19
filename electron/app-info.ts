import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import type { AppInfo } from '../src/shared/app-info.js';

export function desktopAppInfo(): AppInfo {
  // The running app's manifest is also the source for the installer and release tag.
  // app.getVersion() can return the Electron host's version when main.js is loaded by another entry point.
  const { version } = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8'));
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(version)) {
    throw new Error('The Luma package is missing a valid version.');
  }
  return { version, mode: app.isPackaged ? 'desktop' : 'dev' };
}
