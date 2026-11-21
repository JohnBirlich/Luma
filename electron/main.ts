import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, safeStorage, session, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_NAME, APP_USER_MODEL_ID, RELEASES_URL } from '../src/shared/app-info.js';
import { WIDGET_SHORTCUT } from '../src/shared/customization.js';
import type { AppInfo } from '../src/shared/app-info.js';
import { readUiLanguage } from '../src/shared/ui-language.js';
import { textFor } from '../src/i18n/text.js';
import { desktopAppInfo } from './app-info.js';
import { diagnosticsReport, reportFilename } from '../src/shared/diagnostics.js';
import { DesktopDiagnostics } from './diagnostics.js';
import { createCommunitySearch } from '../src/shared/community-catalogs.js';
import { isOnlineExternalUrl } from '../src/shared/online.js';
import { isLyricEditionPage } from '../src/shared/lyric-editions.js';
import { createLyricsService } from '../src/shared/lyrics-service.js';
import { DesktopLastFm, lastFmConfig } from './lastfm.js';
import { createOnlineExporter } from './online-export.js';
import { MAIN_MINIMUM, widgetController } from './desktop-widget.js';
import { createMetadataService, validAcoustidClient } from '../src/shared/metadata-service.js';
import { isMetadataPage } from '../src/shared/recognition.js';
import { AUDIO_EXTENSIONS, emptyImport } from '../src/shared/media.js';
import { RUSSIAN_LOCALE } from '../src/shared/russian.js';
import { isMusicSiteUrl } from '../src/shared/music-sites.js';
import { isStationPage } from '../src/shared/radio.js';
import { isVkExternalUrl, LEGACY_VK_SESSION } from '../src/shared/vk.js';
import { APP_ORIGIN, DesktopLibrary } from './library.js';
import { DesktopFloatOutput } from './float-output.js';
import { StreamCache } from './stream-cache.js';
import { createProtocolHandler } from './protocol.js';

protocol.registerSchemesAsPrivileged([{
  scheme: 'luma',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
}]);

app.commandLine.appendSwitch('lang', 'ru');
app.setName(APP_NAME);
app.setAppUserModelId(APP_USER_MODEL_ID);
const devUrl = getDevUrl();
app.setPath('userData', join(app.getPath('appData'), devUrl ? 'Luma Player Dev' : 'Luma Player'));
let window: BrowserWindow | null = null;
let journal: DesktopDiagnostics | undefined;
let changeWidget: ((enabled: boolean) => boolean) | undefined;
let changeFullscreen: ((fullscreen: boolean) => void) | undefined;
const floatOutput = new DesktopFloatOutput(process.platform === 'win32' ? (app.isPackaged
  ? join(process.resourcesPath, 'audio', 'LumaFloat.exe') : join(app.getAppPath(), 'dist-native', 'LumaFloat.exe')) : undefined);
const started = performance.now();

function getDevUrl(): URL | undefined {
  const value = !app.isPackaged && process.env.LUMA_DEV_SERVER_URL;
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.pathname !== '/') {
    throw new Error('The development URL must be a loopback Vite server.');
  }
  return url;
}

function isAppPage(value: string) {
  try {
    const url = new URL(value);
    if (devUrl) return url.origin === devUrl.origin && url.pathname === '/';
    return url.protocol === 'luma:' && url.hostname === 'app' && !url.port && !url.username && !url.password
      && (url.pathname === '/' || url.pathname === '/index.html');
  } catch {
    return false;
  }
}

function appWindow(event: IpcMainInvokeEvent): BrowserWindow {
  if (!window || window.isDestroyed() || event.sender !== window.webContents
    || !event.senderFrame || event.senderFrame !== event.sender.mainFrame || !isAppPage(event.senderFrame.url)) {
    throw new Error('Untrusted IPC sender');
  }
  return window;
}

function bindIpc(library: DesktopLibrary, logs: DesktopDiagnostics, info: AppInfo, lastfm: DesktopLastFm, cache: StreamCache) {
  floatOutput.onLost = () => {
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('float:lost');
  };
  ipcMain.handle('float:available', (event) => { appWindow(event); return floatOutput.available(); });
  ipcMain.handle('float:start', (event, rate: unknown) => { appWindow(event); return floatOutput.start(rate); });
  ipcMain.handle('float:stop', (event) => { appWindow(event); return floatOutput.stop(); });
  ipcMain.on('float:pcm', (event, stereo: unknown) => { try { appWindow(event); } catch { return; } floatOutput.drain(stereo); });
  let t = textFor('ru');
  ipcMain.handle('ui:language', (event, language: unknown) => { appWindow(event); t = textFor(readUiLanguage(language)); });
  ipcMain.handle('app:info', (event) => { appWindow(event); return info; });
  lastfm.onChange = (status) => {
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('lastfm:changed', status);
  };
  ipcMain.handle('lastfm:status', (event) => { appWindow(event); return lastfm.status(); });
  ipcMain.handle('lastfm:configure', (event, key: unknown, secret: unknown) => { appWindow(event); return lastfm.configure(key, secret); });
  ipcMain.handle('lastfm:forget', (event) => { appWindow(event); return lastfm.forgetCredentials(); });
  ipcMain.handle('lastfm:begin', (event) => { appWindow(event); return lastfm.begin((url) => shell.openExternal(url)); });
  ipcMain.handle('lastfm:finish', (event) => { appWindow(event); return lastfm.finish(); });
  ipcMain.handle('lastfm:enable', (event, enabled: unknown) => {
    appWindow(event);
    if (typeof enabled !== 'boolean') throw new TypeError('Expected an opt-in state');
    return lastfm.enable(enabled);
  });
  ipcMain.handle('lastfm:disconnect', (event) => { appWindow(event); return lastfm.disconnect(); });
  ipcMain.on('lastfm:record', (event, data: unknown) => {
    try { appWindow(event); } catch { return; }
    void lastfm.record(data);
  });
  ipcMain.handle('vk:reset', async (event) => {
    appWindow(event);
    // A 0.12 profile can still hold a VK login. Do not create a view or read any account data.
    const legacy = session.fromPartition(LEGACY_VK_SESSION);
    await legacy.clearStorageData();
    await legacy.clearCache();
  });
  const lookupLyrics = createLyricsService(net.fetch, true);
  const exportMp3 = createOnlineExporter(lookupLyrics, (...args) => t(...args));
  ipcMain.handle('lyrics:local', (event, id: unknown) => { appWindow(event); return library.lyrics(id); });
  ipcMain.handle('lyrics:edition', (event, url: unknown) => {
    appWindow(event);
    if (!isLyricEditionPage(url)) throw new Error('Unsupported lyrics link');
    return shell.openExternal(url);
  });
  ipcMain.handle('lyrics:lookup', (event, query: unknown, refresh: unknown) => {
    appWindow(event);
    return lookupLyrics(query, AbortSignal.timeout(9000), refresh === true);
  });
  ipcMain.handle('cache:url', (event, track: unknown) => { appWindow(event); return cache.url(track); });
  ipcMain.handle('cache:save', (event, track: unknown) => { appWindow(event); return cache.save(track); });
  ipcMain.handle('cache:info', (event) => { appWindow(event); return cache.info(); });
  ipcMain.handle('cache:clear', (event) => { appWindow(event); return cache.clear(); });
  ipcMain.handle('online:export-mp3', (event, track: unknown, withLyrics: unknown) => exportMp3(appWindow(event), track, withLyrics));
  const metadata = createMetadataService(net.fetch);
  const acoustidClient = process.env.LUMA_ACOUSTID_CLIENT;
  ipcMain.handle('metadata:search', (event, query: unknown, locale: unknown) => {
    appWindow(event);
    return metadata.search(query, locale, AbortSignal.timeout(21_000));
  });
  ipcMain.handle('metadata:has-acoustid', (event) => { appWindow(event); return validAcoustidClient(acoustidClient); });
  ipcMain.handle('metadata:identify', (event, fingerprint: unknown) => {
    appWindow(event);
    if (!validAcoustidClient(acoustidClient)) throw new Error('AcoustID is not configured');
    return metadata.identify(fingerprint, acoustidClient, AbortSignal.timeout(9000));
  });
  ipcMain.handle('metadata:open-link', (event, url: unknown) => {
    appWindow(event);
    if (!isMetadataPage(url)) throw new Error('Unsupported recording link');
    return shell.openExternal(url);
  });
  const community = createCommunitySearch(net.fetch);
  ipcMain.handle('online:search-community', (event, id: unknown, query: unknown, filter: unknown) => {
    appWindow(event);
    return community.search(id, query, filter);
  });
  ipcMain.handle('online:cancel-search', (event, id: unknown) => {
    appWindow(event);
    community.cancel(id);
  });
  ipcMain.handle('online:open-link', (event, url: unknown) => {
    appWindow(event);
    if (!(isOnlineExternalUrl(url) || isMusicSiteUrl(url) || isStationPage(url))) throw new Error('Unsupported catalog link');
    return shell.openExternal(url);
  });
  ipcMain.handle('app:releases', (event) => { appWindow(event); return shell.openExternal(RELEASES_URL); });
  logs.onChange = () => {
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('diagnostics:changed');
  };
  ipcMain.on('diagnostics:record', (event, name: unknown, values: unknown) => {
    // Fire-and-forget from the isolated preload; ignore any non-app frame.
    try { appWindow(event); } catch { return; }
    logs.renderer(name, values);
  });
  ipcMain.handle('diagnostics:snapshot', (event) => { appWindow(event); return logs.snapshot(); });
  ipcMain.handle('diagnostics:clear', (event) => { appWindow(event); return logs.clear(); });
  ipcMain.handle('diagnostics:save', async (event) => {
    const owner = appWindow(event);
    const result = await dialog.showSaveDialog(owner, {
      title: t("Сохранить журнал Luma"), defaultPath: reportFilename(), filters: [{ name: t("Журнал"), extensions: ['log'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await writeFile(result.filePath, diagnosticsReport(logs.snapshot(), t), 'utf8');
    return true;
  });
  ipcMain.handle('library:audio-format', (event, id: unknown) => { appWindow(event); return library.audioFormat(id); });
  ipcMain.handle('library:list', (event) => { appWindow(event); return library.list(); });
  ipcMain.handle('library:choose', async (event) => {
    const owner = appWindow(event);
    const { filePaths, canceled } = await dialog.showOpenDialog(owner, {
      title: t("Добавить музыку"),
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: t("Аудиофайлы"), extensions: AUDIO_EXTENSIONS }],
    });
    return canceled ? { ...emptyImport(library.list()), cancelled: true } : library.importPaths(filePaths);
  });
  ipcMain.handle('library:drop', (event, paths: unknown) => {
    appWindow(event);
    if (!Array.isArray(paths) || !paths.every((path) => typeof path === 'string')) throw new TypeError('Expected file paths');
    return library.importPaths(paths);
  });
  ipcMain.handle('library:remove', (event, id: unknown) => {
    appWindow(event);
    if (typeof id !== 'string') throw new TypeError('Expected track ID');
    return library.remove(id);
  });
  ipcMain.handle('vk:open-link', (event, url: unknown) => {
    appWindow(event);
    if (!isVkExternalUrl(url)) throw new Error('Unsupported VK link');
    return shell.openExternal(url).then(() => { logs.main('vk.browserOpened'); }, (error) => { logs.main('vk.browserFailed'); throw error; });
  });
  ipcMain.handle('window:minimize', (event) => appWindow(event).minimize());
  ipcMain.handle('window:toggle-maximize', (event) => {
    const owner = appWindow(event);
    if (owner.isMaximized()) owner.unmaximize();
    else owner.maximize();
  });
  ipcMain.handle('window:is-maximized', (event) => appWindow(event).isMaximized());
  ipcMain.handle('window:set-fullscreen', (event, fullscreen: unknown) => {
    appWindow(event);
    if (typeof fullscreen !== 'boolean') throw new TypeError('Expected a fullscreen state');
    changeFullscreen?.(fullscreen);
  });
  ipcMain.handle('window:widget', (event, enabled: unknown) => {
    appWindow(event);
    if (typeof enabled !== 'boolean') throw new TypeError('Expected widget state');
    return changeWidget?.(enabled) ?? false;
  });
  ipcMain.handle('window:close', (event) => appWindow(event).close());
}

async function createWindow() {
  const owner = new BrowserWindow({
    title: APP_NAME, width: 1440, height: 900, minWidth: MAIN_MINIMUM[0], minHeight: MAIN_MINIMUM[1],
    frame: false, show: false, backgroundColor: '#101116',
    webPreferences: {
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
      nodeIntegration: false, nodeIntegrationInSubFrames: false, contextIsolation: true, sandbox: true,
      autoplayPolicy: 'no-user-gesture-required', // App-controlled local autoplay, off by default.
    },
  });
  owner.webContents.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
    if (isMainFrame && !isSameDocument) void floatOutput.stop();
  });
  owner.webContents.on('render-process-gone', () => { void floatOutput.stop(); });
  owner.once('closed', () => { void floatOutput.stop(); });
  window = owner;
  changeWidget = widgetController(owner);
  // Reserve the chord inside Luma only, before Chromium can handle Ctrl+Shift+R as reload.
  owner.webContents.on('before-input-event', (event, input) => {
    const shortcutKey = input.code === WIDGET_SHORTCUT.code || input.key.toLowerCase() === WIDGET_SHORTCUT.key;
    if (!shortcutKey || !input.control || !input.shift || input.alt || input.meta) return;
    if (!isAppPage(owner.webContents.getURL())) return;
    event.preventDefault();
    if (input.type === 'keyDown' && !input.isAutoRepeat) owner.webContents.send('window:widgetShortcut');
  });
  if (process.platform === 'win32' && app.isPackaged) {
    // Windows taskbar and native media clients can resolve the AppUserModelID to this name.
    // Keep the app origin unchanged so existing IndexedDB and localStorage survive updates.
    const launcher = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    owner.setAppDetails({ appId: APP_USER_MODEL_ID, relaunchDisplayName: APP_NAME, appIconPath: launcher,
      relaunchCommand: `"${launcher}"` });
  }
  owner.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  owner.webContents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame || !isAppPage(event.url)) event.preventDefault();
  });
  owner.webContents.on('will-redirect', (event) => {
    if (!event.isMainFrame || !isAppPage(event.url)) event.preventDefault();
  });
  owner.webContents.on('will-attach-webview', (event) => event.preventDefault());
  owner.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
    if (code === -3) return; // An intentional navigation, not a load failure.
    if (mainFrame) journal?.main('desktop.pageFailed', { code });
  });
  owner.webContents.on('render-process-gone', (_event, { reason, exitCode }) => {
    if (reason !== 'clean-exit') journal?.main('desktop.rendererExited', { code: exitCode });
  });
  // Use native window fullscreen, not Chromium's HTML fullscreen inside a frameless window.
  // On macOS a second request can arrive before the first Space transition completes.
  let goal = false;
  let transitioning = false;
  let settle: ReturnType<typeof setTimeout> | undefined;
  function applyFullscreen() {
    if (owner.isDestroyed() || transitioning || owner.isFullScreen() === goal) return;
    if (process.platform === 'darwin') {
      transitioning = true;
      settle = setTimeout(() => { transitioning = false; }, 3000);
    }
    owner.setFullScreen(goal);
  }
  changeFullscreen = (fullscreen) => { goal = fullscreen; applyFullscreen(); };
  const syncFullscreen = (fullscreen: boolean) => {
    if (!transitioning) goal = fullscreen; // Includes exits initiated by the operating system.
    clearTimeout(settle);
    transitioning = false;
    owner.webContents.send('window:fullscreen', fullscreen);
    if (goal !== fullscreen) setImmediate(applyFullscreen);
  };
  owner.on('enter-full-screen', () => syncFullscreen(true));
  owner.on('leave-full-screen', () => syncFullscreen(false));
  owner.on('closed', () => {
    clearTimeout(settle);
    if (window === owner) { window = null; changeFullscreen = undefined; changeWidget = undefined; }
  });
  const sendMaximized = () => owner.webContents.send('window:maximized', owner.isMaximized());
  owner.on('maximize', sendMaximized);
  owner.on('unmaximize', sendMaximized);
  owner.once('ready-to-show', () => owner.show());
  await owner.loadURL(devUrl?.href ?? `${APP_ORIGIN}/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  void app.whenReady().then(async () => {
    const info = desktopAppInfo();
    journal = await DesktopDiagnostics.open(app.getPath('userData'), info);
    journal.main('desktop.start');
    Menu.setApplicationMenu(null);
    session.defaultSession.setUserAgent(session.defaultSession.getUserAgent(), `${RUSSIAN_LOCALE},ru`);
    // Chromium needs speaker selection to switch our audio graph to/from its silent sink.
    // This does not grant capture and never applies to subframes or other windows.
    const canRouteAudio = (contents: Electron.WebContents | null, permission: string, url: string | undefined, mainFrame: boolean) =>
      process.platform === 'win32' && permission === 'speaker-selection' && mainFrame && !!url
      && !!window && !window.isDestroyed() && contents === window.webContents && isAppPage(url);
    session.defaultSession.setPermissionRequestHandler((contents, permission, reply, details) => {
      reply(canRouteAudio(contents, permission, details.requestingUrl, details.isMainFrame));
    });
    session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
      canRouteAudio(contents, permission, details.requestingUrl, details.isMainFrame));
    const library = await DesktopLibrary.open(app.getPath('userData'));
    const cache = await StreamCache.open(join(app.getPath('userData'), 'stream-cache'), net.fetch);
    protocol.handle('luma', createProtocolHandler(join(app.getAppPath(), 'dist'), library, devUrl?.origin, cache));
    journal.main('desktop.protocol');
    const lastfm = await DesktopLastFm.open(lastFmConfig(process.env.LUMA_LASTFM_API_KEY, process.env.LUMA_LASTFM_SECRET), net.fetch,
      join(app.getPath('userData'), 'lastfm-session.bin'), safeStorage);
    bindIpc(library, journal, info, lastfm, cache);
    await createWindow();
    journal.main('desktop.ready', { ms: performance.now() - started });
    app.on('activate', () => { if (!window) void createWindow(); });
  }).catch((error: unknown) => {
    journal?.main('desktop.failed');
    console.error(error);
    dialog.showErrorBox('Luma Player', 'Не удалось открыть плеер. При запуске из исходников сначала выполните npm run build или используйте npm run dev.');
    app.quit();
  });
  let flushing = false;
  app.on('before-quit', (event) => {
    if (!journal || flushing) return;
    event.preventDefault();
    flushing = true;
    journal.main('desktop.stopped');
    void Promise.allSettled([journal.flush(), floatOutput.stop()]).finally(() => app.quit());
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
