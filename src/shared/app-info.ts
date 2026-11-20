export const APP_NAME = 'Luma Player';
// Keep the Windows media/launcher ID resolvable by both AppsFolder and executable-name readers.
export const APP_USER_MODEL_ID = 'LumaPlayer.exe';

export interface AppInfo {
  version: string;
  systemLocale?: string;
  mode: 'desktop' | 'dev' | 'web';
}

export const runtimeMode = {
  desktop: 'Настольное приложение', dev: 'Настольная сборка из исходников', web: 'Веб-версия',
} as const;

export const RELEASES_URL = 'https://github.com/JohnBirlich/VKX-Modded/releases/latest';

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
