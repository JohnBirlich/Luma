import { dialog, session, WebContentsView } from 'electron';
import type { BrowserWindow, Rectangle } from 'electron';
import { isVkMusicDestination, isVkWebsiteUrl } from '../src/shared/vk.js';
import type { VkWebsiteState } from '../src/shared/vk.js';
import type { DesktopDiagnostics } from './diagnostics.js';

export const VK_SESSION = 'persist:luma-vk-web';

/** The first-party site is an isolated view in the main window, never a privileged Luma renderer. */
export class VkWebsite {
  private view?: WebContentsView;
  private parent?: BrowserWindow;
  private isolated?: Electron.Session;
  private resetPending = false;
  private destination = '';
  private loading = false;
  private failed = false;
  private deadline?: ReturnType<typeof setTimeout>;
  private unbind?: () => void;

  constructor(private logs: DesktopDiagnostics) {}

  private partition() {
    if (!this.isolated) {
      const isolated = this.isolated = session.fromPartition(VK_SESSION);
      isolated.setPermissionRequestHandler((_contents, _permission, reply) => reply(false));
      isolated.setPermissionCheckHandler(() => false);
      isolated.on('will-download', (event) => event.preventDefault());
    }
    return this.isolated;
  }

  private publish() {
    const owner = this.parent;
    const contents = this.view?.webContents;
    if (!owner || owner.isDestroyed() || owner.webContents.isDestroyed() || !contents || contents.isDestroyed()) return;
    const url = contents.getURL();
    const state: VkWebsiteState = {
      host: isVkWebsiteUrl(url) ? new URL(url).hostname : '',
      loading: this.loading, failed: this.failed, canGoBack: contents.navigationHistory.canGoBack(),
    };
    // The UI receives only the verified origin, never page text, cookies or the path/query of a redirect.
    owner.webContents.send('vk:website-state', state);
  }

  layout(owner: BrowserWindow, value: unknown) {
    const { x, y, width, height } = (value ?? {}) as Partial<Rectangle>;
    if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number'
      || ![x, y, width, height].every((part) => Number.isFinite(part) && part >= 0 && part < 100_000)) return;
    if (this.parent !== owner || !this.view) return;
    // The slot comes from the trusted renderer in CSS pixels; view bounds use DIP.
    const zoom = owner.webContents.getZoomFactor();
    const [w, h] = owner.getContentSize();
    const left = Math.min(w, Math.round(x * zoom));
    const top = Math.min(h, Math.round(y * zoom));
    this.view.setBounds({ x: left, y: top, width: Math.min(w - left, Math.round(width * zoom)), height: Math.min(h - top, Math.round(height * zoom)) });
  }

  close() {
    this.unbind?.();
    this.unbind = undefined;
    clearTimeout(this.deadline);
    const view = this.view;
    const parent = this.parent;
    this.view = undefined;
    this.parent = undefined;
    if (!view) return;
    if (parent && !parent.isDestroyed()) parent.contentView.removeChildView(view);
    const contents = view.webContents;
    if (!contents.isDestroyed()) { contents.setAudioMuted(true); contents.close({ waitForBeforeUnload: false }); }
  }

  private fail(view: WebContentsView, code?: number) {
    if (this.view !== view) return;
    clearTimeout(this.deadline);
    this.loading = false;
    this.failed = true;
    view.setVisible(false);
    if (!view.webContents.isDestroyed()) view.webContents.setAudioMuted(true);
    this.logs.main('vk.websiteFailed', code === undefined ? {} : { code });
    this.publish();
  }

  private startNavigation(view: WebContentsView) {
    clearTimeout(this.deadline);
    this.loading = true;
    this.failed = false;
    view.setVisible(true);
    view.webContents.setAudioMuted(false);
    this.deadline = setTimeout(() => {
      if (this.view !== view || view.webContents.isDestroyed()) return;
      view.webContents.stop();
      this.fail(view);
    }, 18_000);
    this.publish();
  }

  private navigate(view: WebContentsView, url: string) {
    const contents = view.webContents;
    if (contents.isDestroyed() || !isVkWebsiteUrl(url)) return;
    const result = contents.loadURL(url);
    void result.catch((error: unknown) => {
      // A normal site-initiated redirect can supersede this request. Navigation events manage loading.
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_ABORTED') return;
      if (this.loading && !contents.isDestroyed()) this.fail(view);
    });
  }

  open(parent: BrowserWindow, url: unknown, bounds: unknown) {
    if (this.resetPending || !isVkMusicDestination(url)) throw new Error('VK view is unavailable');
    this.close();
    this.destination = url;
    this.parent = parent;
    const view = this.view = new WebContentsView({ webPreferences: {
      session: this.partition(), nodeIntegration: false, nodeIntegrationInSubFrames: false,
      contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false, disableHtmlFullscreenWindowResize: true,
    } });
    view.setBackgroundColor('#15171b');
    const contents = view.webContents;
    const checkNavigation = (event: Electron.Event & { isMainFrame: boolean; url: string }) => {
      if (event.isMainFrame && !isVkWebsiteUrl(event.url)) event.preventDefault();
    };
    contents.on('will-frame-navigate', checkNavigation);
    contents.on('will-redirect', checkNavigation);
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      // A first-party link can be followed in the view; the site cannot create a desktop window.
      if (isVkWebsiteUrl(url)) setImmediate(() => { if (this.view === view) this.navigate(view, url); });
      return { action: 'deny' };
    });
    contents.on('did-start-navigation', (event) => { if (event.isMainFrame && !event.isSameDocument) this.startNavigation(view); });
    contents.on('did-navigate', () => this.publish());
    contents.on('did-navigate-in-page', (_event, _url, main) => { if (main) this.publish(); });
    contents.on('did-finish-load', () => {
      if (this.view !== view || !isVkWebsiteUrl(contents.getURL())) return;
      clearTimeout(this.deadline);
      this.loading = false;
      this.failed = false;
      this.logs.main('vk.websiteOpened');
      this.publish();
    });
    contents.on('did-fail-load', (_event, code, _description, _url, main) => { if (main && code !== -3) this.fail(view, code); });
    contents.on('render-process-gone', () => this.fail(view));
    const close = () => { if (this.view === view) this.close(); };
    const reload = (event: Electron.Event & { isMainFrame: boolean; isSameDocument: boolean }) => { if (event.isMainFrame && !event.isSameDocument) close(); };
    parent.once('closed', close);
    parent.webContents.on('did-start-navigation', reload);
    this.unbind = () => {
      parent.removeListener('closed', close);
      if (!parent.isDestroyed() && !parent.webContents.isDestroyed()) parent.webContents.removeListener('did-start-navigation', reload);
    };
    parent.contentView.addChildView(view);
    this.layout(parent, bounds);
    this.logs.main('vk.websiteOpening');
    this.navigate(view, url);
  }

  command(owner: BrowserWindow, action: unknown) {
    const view = this.view;
    if (!view || this.parent !== owner || view.webContents.isDestroyed()) return;
    const contents = view.webContents;
    if (action === 'back' && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    if (action === 'return') this.navigate(view, this.destination);
    if (action === 'reload') this.navigate(view, isVkWebsiteUrl(contents.getURL()) ? contents.getURL() : this.destination);
  }

  async reset(owner: BrowserWindow) {
    if (this.resetPending) return false;
    this.resetPending = true;
    try {
      const { response } = await dialog.showMessageBox(owner, {
        type: 'warning', title: 'Сессия VK', message: 'Сбросить данные входа VK в Luma?',
        detail: 'Вход в обычном браузере и сохранённые плейлисты Luma останутся.',
        buttons: ['Отмена', 'Сбросить'], defaultId: 0, cancelId: 0,
      });
      if (response !== 1) return false;
      this.close();
      const store = this.partition();
      await store.closeAllConnections();
      await store.clearStorageData();
      await store.clearAuthCache();
      await store.clearCache();
      store.flushStorageData();
      return true;
    } finally { this.resetPending = false; }
  }
}
