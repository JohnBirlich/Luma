export interface AppInfo {
  version: string;
  mode: 'desktop' | 'dev' | 'web';
}

export const runtimeMode = {
  desktop: 'Настольное приложение', dev: 'Настольная сборка из исходников', web: 'Веб-версия',
} as const;

export const RELEASES_URL = 'https://github.com/JohnBirlich/VKX-Modded/releases/latest';
