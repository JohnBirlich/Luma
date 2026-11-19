import { BrowserWindow, Menu, session, shell } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import { isVkWebsiteUrl, VK_MUSIC_URL } from '../src/shared/vk.js';
import type { DesktopDiagnostics } from './diagnostics.js';

export const VK_SESSION = 'persist:luma-vk-web';

/** VK owns the page, playback and sign-in. No preload, host bridge or credentials cross this boundary. */
export class VkWebsite {
  private owner?: BrowserWindow;
  private windows = new Set<BrowserWindow>();
  private configured = false;

  constructor(private logs: DesktopDiagnostics) {}

  private options(): BrowserWindowConstructorOptions {
    return {
      title: 'VK Музыка — vk.ru', width: 1120, height: 800, minWidth: 500, minHeight: 420,
      backgroundColor: '#101116',
      webPreferences: {
        partition: VK_SESSION, nodeIntegration: false, nodeIntegrationInSubFrames: false,
        contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false,
      },
    };
  }

  private protect(owner: BrowserWindow, allowPopup: boolean) {
    this.windows.add(owner);
    owner.on('closed', () => this.windows.delete(owner));
    const contents = owner.webContents;
    contents.on('will-frame-navigate', (event) => {
      if (event.isMainFrame && !isVkWebsiteUrl(event.url)) event.preventDefault();
    });
    contents.on('will-redirect', (event) => {
      if (event.isMainFrame && !isVkWebsiteUrl(event.url)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => allowPopup && isVkWebsiteUrl(url)
      ? { action: 'allow', overrideBrowserWindowOptions: this.options() }
      : { action: 'deny' });
    contents.on('did-create-window', (popup) => this.protect(popup, false));

    // Do not use a page-provided title next to an account prompt. Show the actual host instead.
    owner.on('page-title-updated', (event) => event.preventDefault());
    contents.on('did-navigate', (_event, url) => {
      if (isVkWebsiteUrl(url)) owner.setTitle(`VK Музыка — ${new URL(url).hostname}`);
    });
    contents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3) this.logs.main('vk.websiteFailed', { code });
    });
    if (process.platform !== 'darwin') owner.setMenu(Menu.buildFromTemplate([{
      label: 'VK Музыка', submenu: [
        { label: 'Назад', accelerator: 'Alt+Left', click: () => { if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack(); } },
        { label: 'Обновить', accelerator: 'Ctrl+R', click: () => contents.reload() },
        { label: 'Открыть музыку в браузере', click: () => { void shell.openExternal(VK_MUSIC_URL).catch(() => this.logs.main('vk.websiteFailed')); } },
        { type: 'separator' }, { label: 'Закрыть окно', role: 'close' },
      ],
    }]));
  }

  async open() {
    if (this.owner && !this.owner.isDestroyed()) {
      if (this.owner.isMinimized()) this.owner.restore();
      this.owner.focus();
      return;
    }
    if (!this.configured) {
      const isolated = session.fromPartition(VK_SESSION);
      isolated.setPermissionRequestHandler((_contents, _permission, reply) => reply(false));
      isolated.setPermissionCheckHandler(() => false);
      isolated.on('will-download', (event) => event.preventDefault());
      this.configured = true;
    }
    const owner = new BrowserWindow(this.options());
    this.owner = owner;
    this.protect(owner, true);
    owner.once('closed', () => {
      if (this.owner === owner) this.owner = undefined;
      for (const item of this.windows) item.destroy();
    });
    this.logs.main('vk.websiteOpening');
    try {
      await owner.loadURL(VK_MUSIC_URL);
      this.logs.main('vk.websiteOpened');
    } catch {
      if (owner.isDestroyed()) return;
      owner.destroy();
      // Do not forward Electron's raw network error (it may contain private redirect URLs).
      throw new Error('VK Music website unavailable');
    }
  }

  close() {
    for (const item of this.windows) item.destroy();
  }
}
