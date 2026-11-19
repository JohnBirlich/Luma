export const APP_NAME = 'Luma Player';
export const APP_USER_MODEL_ID = 'app.lumaplayer.desktop';

export interface AppInfo {
  version: string;
  mode: 'desktop' | 'dev' | 'web';
}

export const runtimeMode = {
  desktop: 'Настольное приложение', dev: 'Настольная сборка из исходников', web: 'Веб-версия',
} as const;

export const RELEASES_URL = 'https://github.com/JohnBirlich/VKX-Modded/releases/latest';
