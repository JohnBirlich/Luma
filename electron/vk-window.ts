import { BrowserWindow, dialog, Menu, session, shell } from 'electron';
import type { BrowserWindowConstructorOptions } from 'electron';
import { isVkMusicDestination, isVkWebsiteUrl, VK_MUSIC_URL } from '../src/shared/vk.js';
import type { DesktopDiagnostics } from './diagnostics.js';

export const VK_SESSION = 'persist:luma-vk-web';

/** A separate first-party browser session. No preload, injected scripts, or access to Luma's files. */
export class VkWebsite {
  private root?: BrowserWindow;
  private windows = new Set<BrowserWindow>();
  private isolated?: Electron.Session;
  private destination = VK_MUSIC_URL;
  private revision = 0;

  constructor(private logs: DesktopDiagnostics) {}

  private options(parent: BrowserWindow): BrowserWindowConstructorOptions {
    return {
      parent, modal: true, title: 'VK Музыка — vk.ru', width: 1130, height: 810, minWidth: 480, minHeight: 390,
      backgroundColor: '#15171b',
      webPreferences: {
        partition: VK_SESSION, nodeIntegration: false, nodeIntegrationInSubFrames: false,
        contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false,
      },
    };
  }

  private protect(window: BrowserWindow, allowPopup: boolean) {
    this.windows.add(window);
    window.once('closed', () => this.windows.delete(window));
    const contents = window.webContents;
    const checkNavigation = (event: Electron.Event & { isMainFrame: boolean; url: string }) => {
      if (event.isMainFrame && !isVkWebsiteUrl(event.url)) event.preventDefault();
    };
    contents.on('will-frame-navigate', checkNavigation);
    contents.on('will-redirect', checkNavigation);
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => allowPopup && isVkWebsiteUrl(url)
      ? { action: 'allow', overrideBrowserWindowOptions: this.options(window) } : { action: 'deny' });
    contents.on('did-create-window', (popup) => this.protect(popup, false));
    window.on('page-title-updated', (event) => event.preventDefault());
    contents.on('did-navigate', (_event, url) => {
      if (isVkWebsiteUrl(url)) window.setTitle(`VK Музыка — ${new URL(url).hostname}`);
    });
    contents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
      if (mainFrame && code !== -3) this.logs.main('vk.websiteFailed', { code });
    });
    if (process.platform !== 'darwin') window.setMenu(Menu.buildFromTemplate([{
      label: 'VK Музыка', submenu: [
        { label: 'Назад', accelerator: 'Alt+Left', click: () => { if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack(); } },
        { label: 'Обновить', accelerator: 'Ctrl+R', click: () => contents.reload() },
        { label: 'Вернуться к выбранной музыке', click: () => {
          // If VK finished login on a profile/home screen, retry the saved music destination in the same session.
          void contents.loadURL(this.destination).catch(() => this.logs.main('vk.websiteFailed'));
        } },
        { label: 'Открыть в обычном браузере', click: () => {
          void shell.openExternal(this.destination).then(() => this.logs.main('vk.browserOpened'), () => this.logs.main('vk.browserFailed'));
        } },
        { label: 'Очистить сессию VK…', click: () => { void this.reset(window); } },
        { type: 'separator' }, { label: 'Закрыть окно', role: 'close' },
      ],
    }]));
  }

  private async reset(window: BrowserWindow) {
    try {
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning', title: 'Сессия VK', message: 'Выйти из VK в Luma?',
        detail: 'Удалятся данные входа только из этого окна. Закладки в Luma и вход в обычном браузере сохранятся.',
        buttons: ['Отмена', 'Очистить'], defaultId: 0, cancelId: 0,
      });
      if (response !== 1 || !this.isolated) return;
      const owner = this.root?.getParentWindow();
      this.root?.destroy();
      await this.isolated.clearStorageData();
      await this.isolated.clearCache();
      if (owner && !owner.isDestroyed()) await this.open(owner, VK_MUSIC_URL);
    } catch { this.logs.main('vk.websiteFailed'); }
  }

  async open(parent: BrowserWindow, url: unknown) {
    if (!isVkMusicDestination(url)) throw new Error('Unsupported VK Music destination');
    if (!this.isolated) {
      const isolated = this.isolated = session.fromPartition(VK_SESSION);
      isolated.setPermissionRequestHandler((_contents, _permission, reply) => reply(false));
      isolated.setPermissionCheckHandler(() => false);
      isolated.on('will-download', (event) => event.preventDefault());
    }
    let window = this.root;
    if (!window || window.isDestroyed()) {
      const owner = window = this.root = new BrowserWindow(this.options(parent));
      this.protect(owner, true);
      owner.once('closed', () => {
        if (this.root !== owner) return;
        this.root = undefined;
        for (const popup of this.windows) if (!popup.isDestroyed()) popup.destroy();
        if (!parent.isDestroyed() && !parent.webContents.isDestroyed()) parent.webContents.send('vk:website-state', false);
      });
      parent.webContents.send('vk:website-state', true);
    } else {
      window.focus();
      if (this.destination === url) return;
    }
    const revision = ++this.revision;
    this.destination = url;
    this.logs.main('vk.websiteOpening');
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([window.loadURL(url), new Promise<never>((_, reject) => { deadline = setTimeout(reject, 18_000); })]);
      if (this.revision === revision) this.logs.main('vk.websiteOpened');
    } catch (error) {
      if (this.revision !== revision || window.isDestroyed()) return;
      // A site-initiated first-party login/navigation can replace the initial load.
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_ABORTED'
        && isVkWebsiteUrl(window.webContents.getURL())) return;
      window.destroy();
      // Do not forward Electron's raw error (may contain private redirect URLs).
      throw new Error('VK Music website unavailable');
    } finally { clearTimeout(deadline); }
  }
}
