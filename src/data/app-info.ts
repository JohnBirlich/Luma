// Import the manifest as a Vite module: edits to it invalidate the dev module graph.
import { version } from '../../package.json';
import type { AppInfo } from '../shared/app-info';

export const webAppInfo: AppInfo = { version, mode: 'web' };

export async function getAppInfo(): Promise<AppInfo> {
  return window.luma ? window.luma.getAppInfo() : webAppInfo;
}
