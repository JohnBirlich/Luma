import { dialog, session, WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';
import { LEGACY_VK_SESSION, VK_MUSIC_URL } from '../src/shared/vk.js';
import { VK_SITE_PARTITION, VK_TRANSPORT, readVkNowPlaying, vkMusicPage, vkSiteEntry, vkSiteUrl, vkViewBounds } from '../src/shared/vk-site.js';
import type { VkSiteState, VkTransport } from '../src/shared/vk-site.js';
import { inspectVkPlayer } from './vk-player.js';

interface VkView {
  id: number; owner: BrowserWindow; view: WebContentsView; entry: string; shown: boolean;
  state: VkSiteState; revision: number; reading: boolean; unbind(): void;
  poll?: ReturnType<typeof setInterval>; timer?: ReturnType<typeof setTimeout>;
}
const world = 1481;

export class VkSite {
  private active?: VkView;
  private isolated?: Electron.Session;
  private resetting = false;

  private partition() {
    if (!this.isolated) {
      const isolated = this.isolated = session.fromPartition(VK_SITE_PARTITION);
      isolated.setPermissionRequestHandler((_contents, _permission, reply) => reply(false));
      isolated.setPermissionCheckHandler(() => false);
      isolated.on('will-download', (event) => event.preventDefault());
    }
    return this.isolated;
  }

  private publish(active: VkView, change: Partial<VkSiteState>) {
    if (this.active !== active || active.owner.isDestroyed() || active.owner.webContents.isDestroyed()) return;
    const next = { ...active.state, ...change };
    if (JSON.stringify(next) === JSON.stringify(active.state)) return;
    active.state = next;
    active.owner.webContents.send('vk-site:state', active.id, next);
  }

  private layoutView(active: VkView, value: unknown) {
    if (active.view.webContents.isDestroyed()) return;
    const [w, h] = active.owner.getContentSize();
    const bounds = vkViewBounds(value, active.owner.webContents.getZoomFactor(), w, h);
    active.shown = !!bounds;
    if (bounds) active.view.setBounds(bounds);
    this.visibility(active);
  }

  private visibility(active: VkView) {
    const show = active.shown && active.state.phase !== 'failed';
    active.view.setVisible(show);
    if (!active.view.webContents.isDestroyed()) active.view.webContents.setAudioMuted(!show);
  }

  layout(owner: BrowserWindow, id: unknown, value: unknown) {
    const active = this.active;
    if (active && active.id === id && active.owner === owner) this.layoutView(active, value);
  }

  close(owner?: BrowserWindow, id?: unknown) {
    const active = this.active;
    if (!active || (owner && (active.owner !== owner || active.id !== id))) return;
    this.publish(active, { phase: 'closed', track: undefined });
    this.active = undefined;
    active.unbind();
    clearTimeout(active.timer);
    clearInterval(active.poll);
    const { owner: parent, view } = active;
    if (!parent.isDestroyed()) parent.contentView.removeChildView(view);
    const contents = view.webContents;
    if (!contents.isDestroyed()) { contents.setAudioMuted(true); contents.close({ waitForBeforeUnload: false }); }
  }

  private fail(active: VkView) {
    if (this.active !== active) return;
    clearTimeout(active.timer);
    this.publish(active, { phase: 'failed', track: undefined });
    this.visibility(active);
  }

  private navigate(active: VkView, url: string) {
    if (this.active !== active || !vkSiteUrl(url) || active.view.webContents.isDestroyed()) return;
    void active.view.webContents.loadURL(url).catch((error: unknown) => {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ERR_ABORTED')) this.fail(active);
    });
  }

  open(owner: BrowserWindow, id: unknown, url: unknown, bounds: unknown) {
    if (this.resetting || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || !vkSiteEntry(url) || owner.isMinimized()) throw new Error('VK view is unavailable');
    this.close();
    const view = new WebContentsView({ webPreferences: { session: this.partition(), nodeIntegration: false, nodeIntegrationInSubFrames: false,
      contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false, disableHtmlFullscreenWindowResize: true } });
    view.setBackgroundColor('#171820');
    const contents = view.webContents;
    const close = () => this.close(owner, id);
    const navigation = (event: Electron.Event & { isMainFrame: boolean; isSameDocument: boolean }) => { if (event.isMainFrame && !event.isSameDocument) close(); };
    const active: VkView = { id, owner, view, entry: url, shown: false, revision: 0, reading: false,
      state: { host: '', phase: 'loading', back: false }, unbind() {
        owner.removeListener('minimize', close);
        owner.removeListener('hide', close);
        owner.removeListener('closed', close);
        if (!owner.isDestroyed() && !owner.webContents.isDestroyed()) owner.webContents.removeListener('did-start-navigation', navigation);
      } };
    this.active = active;
    const guard = (event: Electron.Event & { isMainFrame: boolean; url: string }) => {
      const subframe = /^https:\/\/|^about:(?:blank|srcdoc)$/i.test(event.url);
      if (!(event.isMainFrame ? vkSiteUrl(event.url) : subframe)) event.preventDefault();
    };
    contents.on('will-frame-navigate', guard);
    contents.on('will-redirect', guard);
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url: dest, postBody }) => {
      if (!postBody && vkSiteUrl(dest)) setImmediate(() => this.navigate(active, dest));
      return { action: 'deny' };
    });
    contents.on('did-start-navigation', ({ isMainFrame, isSameDocument, url: dest }) => {
      if (!isMainFrame || isSameDocument || this.active !== active) return;
      clearTimeout(active.timer);
      active.revision++;
      this.publish(active, { phase: 'loading', host: vkSiteUrl(dest)?.hostname ?? '', track: undefined });
      this.visibility(active);
      active.timer = setTimeout(() => {
        if (active.view.webContents.isDestroyed()) return;
        active.view.webContents.stop(); this.fail(active);
      }, 18_000);
    });
    const syncLocation = () => {
      const safe = vkSiteUrl(contents.getURL());
      if (!safe) return this.fail(active);
      this.publish(active, { host: safe.hostname, back: contents.navigationHistory.canGoBack(), ...(!vkMusicPage(safe.href) && { track: undefined }) });
    };
    contents.on('did-navigate', syncLocation);
    contents.on('did-navigate-in-page', (_event, _url, main) => { if (main) { active.revision++; syncLocation(); } });
    contents.on('did-finish-load', () => {
      if (this.active !== active || !vkSiteUrl(contents.getURL())) return;
      clearTimeout(active.timer);
      this.publish(active, { phase: 'ready' });
      this.visibility(active);
      void this.readTrack(active);
    });
    contents.on('did-fail-load', (_event, code, _description, _dest, main) => { if (main && code !== -3) this.fail(active); });
    contents.on('render-process-gone', () => this.fail(active));
    contents.on('media-started-playing', () => void this.readTrack(active));
    contents.on('media-paused', () => void this.readTrack(active));
    owner.on('minimize', close);
    owner.on('hide', close);
    owner.once('closed', close);
    owner.webContents.on('did-start-navigation', navigation);
    owner.contentView.addChildView(view);
    this.layoutView(active, bounds);
    this.navigate(active, url);
    active.poll = setInterval(() => void this.readTrack(active), 650);
  }

  private canRead(active: VkView) {
    const contents = active.view.webContents;
    return this.active === active && active.shown && active.state.phase === 'ready' && !contents.isDestroyed() && vkMusicPage(contents.getURL());
  }

  private async readTrack(active: VkView) {
    if (!this.canRead(active) || active.reading) return;
    active.reading = true;
    const revision = active.revision;
    try {
      const data = await active.view.webContents.executeJavaScriptInIsolatedWorld(world, [{ code: inspectVkPlayer() }]);
      if (this.canRead(active) && active.revision === revision) this.publish(active, { track: readVkNowPlaying(data) });
    } catch { /* Navigation can replace the frame before the read finishes. */ }
    finally { active.reading = false; }
  }

  async command(owner: BrowserWindow, id: unknown, action: unknown) {
    const active = this.active, contents = active?.view.webContents;
    if (!active || active.owner !== owner || active.id !== id || !contents || contents.isDestroyed()) return false;
    if (action === 'back' && contents.navigationHistory.canGoBack()) { contents.navigationHistory.goBack(); return true; }
    if (action === 'music') { this.navigate(active, VK_MUSIC_URL); return true; }
    if (action === 'reload') {
      if (vkSiteUrl(contents.getURL())) contents.reload();
      else this.navigate(active, active.entry);
      return true;
    }
    if (!VK_TRANSPORT.includes(action as VkTransport) || !this.canRead(active)) return false;
    try {
      const clicked = await contents.executeJavaScriptInIsolatedWorld(world, [{ code: inspectVkPlayer(action as VkTransport) }], true);
      void this.readTrack(active);
      return clicked === true;
    } catch { return false; }
  }


  async clear(owner: BrowserWindow, message: Electron.MessageBoxOptions) {
    if (this.resetting) return false;
    this.resetting = true;
    try {
      // Native dialogs should never be shown over a live third-party view.
      this.close();
      if ((await dialog.showMessageBox(owner, message)).response !== 1) return false;
      for (const isolated of [this.partition(), session.fromPartition(LEGACY_VK_SESSION)]) {
        await isolated.closeAllConnections();
        await isolated.clearStorageData();
        await isolated.clearAuthCache();
        await isolated.clearCache();
        isolated.flushStorageData();
      }
      return true;
    } finally { this.resetting = false; }
  }
}
