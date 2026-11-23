import { dialog, session, WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { LEGACY_VK_SESSION, VK_MUSIC_URL } from '../src/shared/vk.js';
import { VK_SITE_PARTITION, VK_TRANSPORT, readVkNowPlaying, readVkSiteAppearance, vkMusicPage, vkSeekRatio, vkSignInPage, vkSignInUrl, vkSiteEntry, vkSiteUrl, vkViewBounds } from '../src/shared/vk-site.js';
import type { VkPlaybackAction, VkSiteAppearance, VkSiteState } from '../src/shared/vk-site.js';
import { vkAppearanceScript } from './vk-appearance.js';
import { inspectVkPlayer } from './vk-player.js';

interface VkView {
  id: number; owner: BrowserWindow; view: WebContentsView; entry: string; shown: boolean; foreground: boolean;
  windowVisible: boolean; minimized: boolean;
  appearance: VkSiteAppearance; state: VkSiteState; revision: number; reading: boolean; confirming: boolean; qrStarted: boolean; returnToEntry: boolean; unbind(): void;
  poll?: ReturnType<typeof setInterval>; timer?: ReturnType<typeof setTimeout>;
}
const world = 1481;
const preload = fileURLToPath(new URL('./vk-media-preload.cjs', import.meta.url));
// The page-side adapter accepts only fixed action names and a bounded fraction, never script from the renderer.
const playback = (action?: VkPlaybackAction | 'seek', ratio?: number, useElement = false) =>
  `globalThis.__lumaVkPlayback?.(...${JSON.stringify([action, ratio, useElement])})`;

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

  private inForeground(active: VkView) {
    return active.foreground && active.windowVisible && !active.minimized;
  }

  private visibility(active: VkView) {
    const show = this.inForeground(active) && active.shown && !active.confirming && active.state.phase === 'ready';
    active.view.setVisible(show);
    // Only the already-selected, verified music document can outlive its native slot.
    if (!active.view.webContents.isDestroyed()) active.view.webContents.setAudioMuted(!this.musicReady(active) || !(show || active.state.engaged));
  }

  layout(owner: BrowserWindow, id: unknown, value: unknown, foreground: unknown) {
    const active = this.active;
    if (!active || active.id !== id || active.owner !== owner || typeof foreground !== 'boolean') return;
    if (!foreground && active.foreground) {
      if (!this.musicPageReady(active)) { this.dispose(active); return; }
      // Catch the first play even if the listener immediately switches to Now Playing.
      void this.readTrack(active);
    }
    active.foreground = foreground;
    this.layoutView(active, foreground ? value : null);
  }

  setAppearance(owner: BrowserWindow, id: unknown, value: unknown) {
    const active = this.active, appearance = readVkSiteAppearance(value);
    if (this.resetting || !active || active.owner !== owner || active.id !== id || !appearance || active.view.webContents.isDestroyed()) return false;
    active.appearance = appearance;
    this.applyAppearance(active);
    return true;
  }

  private applyAppearance(active: VkView) {
    const contents = active.view.webContents;
    if (active.state.phase !== 'ready' || contents.isDestroyed()) return;
    const code = vkAppearanceScript(active.state.signIn ? 'standard' : active.appearance, contents.getURL());
    if (code) void contents.executeJavaScriptInIsolatedWorld(world, [{ code }]).catch(() => {});
  }

  close(owner?: BrowserWindow, id?: unknown) {
    const active = this.active;
    if (!active || (owner && (active.owner !== owner || active.id !== id))) return;
    this.dispose(active);
  }

  private dispose(active: VkView, announce = true) {
    if (announce) this.publish(active, { phase: 'closed', track: undefined, engaged: undefined });
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
    if (!active.foreground) { this.dispose(active); return; }
    this.publish(active, { phase: 'failed', track: undefined, engaged: undefined });
    this.visibility(active);
  }

  private navigate(active: VkView, url: string) {
    if (this.active !== active || !vkSiteUrl(url) || active.view.webContents.isDestroyed()) return;
    void active.view.webContents.loadURL(url).catch((error: unknown) => {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ERR_ABORTED')) this.fail(active);
    });
  }

  open(owner: BrowserWindow, id: unknown, url: unknown, bounds: unknown, mode: unknown = 'standard') {
    const appearance = readVkSiteAppearance(mode);
    if (this.resetting || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || !vkSiteEntry(url) || !appearance || owner.isMinimized()) throw new Error('VK view is unavailable');
    this.close();
    const view = new WebContentsView({ webPreferences: { preload, session: this.partition(), nodeIntegration: false, nodeIntegrationInSubFrames: false,
      contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false, disableHtmlFullscreenWindowResize: true } });
    view.setBackgroundColor('#171820');
    const contents = view.webContents;
    const close = () => this.close(owner, id);
    const navigation = (event: Electron.Event & { isMainFrame: boolean; isSameDocument: boolean }) => { if (event.isMainFrame && !event.isSameDocument) close(); };
    const syncWindow = () => {
      if (this.active !== active) return;
      if ((!active.windowVisible || active.minimized) && !active.state.engaged) close();
      else this.visibility(active);
    };
    // The native event can arrive before synchronous window queries reflect the change.
    const minimize = () => { active.minimized = true; syncWindow(); };
    const restore = () => { active.minimized = false; syncWindow(); };
    const hide = () => { active.windowVisible = false; syncWindow(); };
    const show = () => { active.windowVisible = true; syncWindow(); };
    const active: VkView = { id, owner, view, entry: url, appearance, shown: false, foreground: true, revision: 0, reading: false, confirming: false, qrStarted: false, returnToEntry: false,
      windowVisible: owner.isVisible(), minimized: false,
      state: { host: '', phase: 'loading', back: false, signIn: false }, unbind() {
        owner.removeListener('minimize', minimize);
        owner.removeListener('hide', hide);
        owner.removeListener('restore', restore);
        owner.removeListener('show', show);
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
      // The start event can precede the navigation guard. A blocked external link
      // leaves the existing document and its playback in place, not in "loading".
      const safe = vkSiteUrl(dest);
      if (!safe) return;
      // Don't load a new page silently over the retained session (in particular, a login page).
      if (!this.inForeground(active)) { this.dispose(active); return; }
      clearTimeout(active.timer);
      active.revision++;
      this.publish(active, { phase: 'loading', host: safe.hostname, signIn: vkSignInPage(safe), track: undefined, engaged: undefined });
      this.visibility(active);
      active.timer = setTimeout(() => {
        if (active.view.webContents.isDestroyed()) return;
        active.view.webContents.stop(); this.fail(active);
      }, 18_000);
    });
    contents.on('did-navigate-in-page', (_event, _url, main) => {
      if (!main || this.active !== active) return;
      active.revision++;
      this.visibility(active);
      if (active.state.phase === 'ready') void this.readyPage(active, true);
    });
    contents.on('did-finish-load', () => void this.readyPage(active));
    contents.on('did-fail-load', (_event, code, _description, _dest, main) => { if (main && code !== -3) this.fail(active); });
    contents.on('render-process-gone', () => this.fail(active));
    contents.on('media-started-playing', () => void this.readTrack(active));
    contents.on('media-paused', () => void this.readTrack(active));
    owner.on('minimize', minimize).on('restore', restore).on('hide', hide).on('show', show);
    owner.once('closed', close);
    owner.webContents.on('did-start-navigation', navigation);
    owner.contentView.addChildView(view);
    this.layoutView(active, bounds);
    this.navigate(active, url);
    active.poll = setInterval(() => void this.readTrack(active), 500);
  }

  private startQr(active: VkView) {
    const login = vkSignInUrl(active.entry);
    if (!login || active.qrStarted) return false;
    active.qrStarted = active.returnToEntry = true;
    this.navigate(active, login);
    return true;
  }

  private async readyPage(active: VkView, inPage = false) {
    const contents = active.view.webContents;
    if (this.active !== active || contents.isDestroyed() || active.state.phase === 'failed') return;
    clearTimeout(active.timer);
    const safe = vkSiteUrl(contents.getURL());
    if (!safe) { this.fail(active); return; }
    const revision = active.revision;
    const music = vkMusicPage(safe.href);
    let signIn = vkSignInPage(safe);
    if (music && !signIn) {
      const snapshot = await contents.executeJavaScriptInIsolatedWorld(world, [{ code: inspectVkPlayer() }]).catch(() => undefined);
      if (!this.isLive(active, revision)) return;
      signIn = snapshot?.signedOut === true;
    }
    if ((!music || signIn) && !this.inForeground(active)) {
      this.dispose(active); return;
    }
    // Let VK handle security checks as-is. Only choose QR on a recognized signed-out
    // landing page, once per view. Returning accounts load their music link directly.
    if (signIn && !/^\/(?:authcheck|challenge|captcha)(?:[./]|$)/i.test(safe.pathname) && this.startQr(active)) return;
    if (!signIn && active.returnToEntry && (music || safe.pathname === '/feed')) {
      active.returnToEntry = false;
      // VK usually follows `to`. Preserve an explicit track, playlist or search if it
      // instead returns to the feed or generic audio page. Load a fresh document when
      // an auth page becomes music via SPA navigation, for the early player observer.
      if (inPage || safe.pathname === '/feed' || (safe.href !== active.entry && safe.pathname === '/audio' && !safe.search)) {
        this.navigate(active, active.entry);
        return;
      }
    }
    this.publish(active, { phase: 'ready', host: safe.hostname, signIn, back: contents.navigationHistory.canGoBack(),
      ...((!music || signIn) && { track: undefined, engaged: undefined }) });
    this.applyAppearance(active);
    this.visibility(active);
    void this.readTrack(active);
  }

  private isLive(active: VkView, revision: number) {
    return this.active === active && !active.view.webContents.isDestroyed() && active.revision === revision && active.state.phase !== 'failed';
  }

  private musicPageReady(active: VkView) {
    const contents = active.view.webContents;
    return this.active === active && active.state.phase === 'ready' && !active.state.signIn && !contents.isDestroyed() && vkMusicPage(contents.getURL());
  }

  private musicReady(active: VkView) {
    return !active.confirming && this.musicPageReady(active);
  }

  private async readTrack(active: VkView) {
    if (!this.musicReady(active) || !(active.foreground || active.state.engaged) || active.reading) return;
    active.reading = true;
    const revision = active.revision;
    try {
      const contents = active.view.webContents;
      const [snapshot, media] = await Promise.all([
        contents.executeJavaScriptInIsolatedWorld(world, [{ code: inspectVkPlayer() }]),
        contents.executeJavaScript(playback()).catch(() => undefined),
      ]);
      if (!this.musicReady(active) || active.revision !== revision) return;
      if (snapshot?.signedOut === true) {
        if (!this.inForeground(active)) { this.dispose(active); return; }
        this.publish(active, { signIn: true, track: undefined, engaged: undefined });
        this.visibility(active);
        this.applyAppearance(active);
        this.startQr(active);
        return;
      }
      const visible = readVkNowPlaying(snapshot);
      const track = snapshot && readVkNowPlaying({ ...visible,
        playing: typeof media?.playing === 'boolean' ? media.playing : visible?.playing,
        previous: media?.previous === true || visible?.previous, toggle: media?.toggle === true || visible?.toggle,
        next: media?.next === true || visible?.next, timeline: media?.timeline,
      });
      const engaged = track?.playing ? true : active.state.engaged;
      if (!active.foreground && !engaged) { this.dispose(active); return; }
      const started = engaged !== active.state.engaged;
      this.publish(active, { track, engaged });
      if (started) this.visibility(active);
    } catch {
      // Navigation can replace the frame before the read finishes.
      if (this.isLive(active, revision) && !active.foreground && !active.state.engaged) this.dispose(active);
    }
    finally { active.reading = false; }
  }

  async command(owner: BrowserWindow, id: unknown, action: unknown, fraction?: unknown) {
    const active = this.active, contents = active?.view.webContents;
    if (this.resetting || !active || active.owner !== owner || active.id !== id || !contents || contents.isDestroyed()) return false;
    const foreground = this.inForeground(active) && active.shown;
    if (action === 'back' && foreground && contents.navigationHistory.canGoBack()) { contents.navigationHistory.goBack(); return true; }
    if (action === 'music' && foreground && !active.state.signIn) { this.navigate(active, VK_MUSIC_URL); return true; }
    if (action === 'reload' && foreground) {
      if (vkSiteUrl(contents.getURL())) contents.reload();
      else this.navigate(active, active.entry);
      return true;
    }
    const canControl = () => this.musicReady(active) && ((this.inForeground(active) && active.shown) || active.state.engaged);
    if (!canControl()) return false;
    const revision = active.revision;
    const stillHere = () => canControl() && active.revision === revision;
    try {
      if (action === 'seek') {
        const ratio = vkSeekRatio(fraction);
        return ratio !== undefined && active.state.track?.timeline?.seek === true
          && await contents.executeJavaScript(playback('seek', ratio), true) === true;
      }
      if (action !== 'pause' && !VK_TRANSPORT.some((value) => value === action)) return false;
      const transport = action as VkPlaybackAction;
      if (transport !== 'pause' && !active.state.track?.[transport]) return false;
      if (await contents.executeJavaScript(playback(transport), true).catch(() => false) === true) return true;
      if (!stillHere()) return false;
      if (await contents.executeJavaScriptInIsolatedWorld(world, [{ code: inspectVkPlayer(transport) }], true) === true) return true;
      return (transport === 'toggle' || transport === 'pause') && stillHere() && await contents.executeJavaScript(playback(transport, undefined, true), true) === true;
    } catch { return false; }
    finally { void this.readTrack(active); }
  }

  async clear(owner: BrowserWindow, id: unknown, message: Electron.MessageBoxOptions) {
    const active = this.active;
    if (this.resetting || !active || active.owner !== owner || active.id !== id) return false;
    this.resetting = active.confirming = true;
    this.visibility(active);
    try {
      if ((await dialog.showMessageBox(owner, message)).response !== 1 || this.active !== active) return false;
      // Destroy the guest before clearing storage so it cannot write old sign-in data back.
      // The React pane reopens the official sign-in page after the request completes.
      this.publish(active, { phase: 'loading', host: '', back: false, signIn: false, track: undefined, engaged: undefined });
      this.dispose(active, false);
      for (const isolated of [this.partition(), session.fromPartition(LEGACY_VK_SESSION)]) {
        await isolated.closeAllConnections();
        await isolated.clearStorageData();
        await isolated.clearAuthCache();
        await isolated.clearCache();
        isolated.flushStorageData();
      }
      return true;
    } finally {
      this.resetting = false;
      if (this.active === active) { active.confirming = false; this.visibility(active); }
    }
  }
}
