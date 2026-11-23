import { RELEASE_REPO } from './release-updates.js';

export const APP_NAME = 'Luma';
// This is a storage path, not the display name. Keep existing files and Chromium partitions.
export const APP_PROFILE_DIR = 'Luma Player';
// Keep the Windows media/launcher ID resolvable by both AppsFolder and executable-name readers.
export const APP_USER_MODEL_ID = 'Luma.exe';

export interface AppInfo {
  version: string;
  systemLocale?: string;
  mode: 'desktop' | 'dev' | 'web';
}

export const runtimeMode = {
  desktop: 'Настольное приложение', dev: 'Настольная сборка из исходников', web: 'Веб-версия',
} as const;

export const RELEASES_URL = `https://github.com/${RELEASE_REPO}/releases/latest`;

/** Public client identification for catalog APIs; contains no installation or user identifier. */
export function appApiAgent(version = 'dev') {
  return `LumaPlayer/${version} (https://github.com/${RELEASE_REPO})`;
}

/** Some Chromium hosts return locale identifiers with ICU/POSIX separators or suffixes. */
export function dataLocale(...candidates: Array<string | undefined>): string {
  for (const value of candidates) {
    try {
      const tag = value?.split(/[.@]/, 1)[0].replaceAll('_', '-');
      const [canonical] = Intl.getCanonicalLocales(tag ?? []);
      if (canonical) return canonical;
    } catch { /* Try the next locale instead of crashing a settings page. */ }
  }
  return 'ru-RU';
}
