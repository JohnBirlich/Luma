import { dialog, net, session, WebContentsView } from 'electron';
import type { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { LEGACY_VK_SESSION } from '../src/shared/vk.js';
import { proxyRules, vkMusicUrlFor } from '../src/shared/labs.js';
import type { LabSettings } from '../src/shared/labs.js';
import { VK_SITE_PARTITION, VK_TRANSPORT, readVkCollection, readVkCollectionName, readVkNowPlaying, vkArtworkPixels, vkArtworkUrl, vkMusicPage, vkSeekRatio, vkSignInPage, vkSignInUrl, vkSiteEntry, vkSiteUrl, vkViewBounds, withVkDomain } from '../src/shared/vk-site.js';
import type { VkNowPlaying, VkPlaybackAction, VkSiteState } from '../src/shared/vk-site.js';
import { vkAppearanceScript } from './vk-appearance.js';
import { inspectVkPlayer } from './vk-player.js';
import { inspectVkAlbum, inspectVkCollection } from './vk-collection.js';
import { fetchVkArtwork } from './vk-artwork.js';
import type { VkArtwork } from './vk-artwork.js';
import { vkCoverKey } from './vk-cover-cache.js';
import type { VkCoverCache } from './vk-cover-cache.js';

interface CurrentCover { key: string; id: string; cancel: AbortController; image?: VkArtwork }

interface VkView {
  id: number; owner: BrowserWindow; view: WebContentsView; entry: string; shown: boolean; foreground: boolean;
  windowVisible: boolean; minimized: boolean;
  state: VkSiteState; revision: number; reading: boolean; confirming: boolean; qrStarted: boolean; returnToEntry: boolean; unbind(): void;
  cover?: CurrentCover;
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
  /** Cover keys already written to disk and therefore safe to publish. */
  private readonly cached = new Set<string>();

  constructor(private readonly covers?: VkCoverCache, private readonly lab?: { readonly value: LabSettings }) {}

  private get settings(): LabSettings {
    return this.lab?.value ?? { vkDomain: 'vk.ru', unencryptedStorage: false, proxy: { enabled: false, host: '', port: '' } };
  }

  /** The experimental proxy applies to the VK profile only, never to Luma's own requests. */
  private applyProxy() {
    const rules = proxyRules(this.settings.proxy);
    void this.partition().setProxy(rules ? { proxyRules: rules } : { mode: 'direct' }).catch(() => {});
  }

  artwork(id: string) {
    const active = this.active;
    if (active?.cover?.id === id && this.musicPageReady(active)) return active.cover.image;
  }

  private dropCover(active: VkView) {
    active.cover?.cancel.abort();
    active.cover = undefined;
  }

  private publishTrack(active: VkView, track: VkNowPlaying | undefined, engaged: boolean | undefined, candidates: unknown) {
    // Sharpest first: the page reports every rendition it can see, including the
    // small thumbnail it happens to draw, and the largest one is the one to keep.
    const urls = engaged && track?.title && Array.isArray(candidates)
      ? [...new Set(candidates.slice(0, 12).flatMap(value => vkArtworkUrl(value) ?? []))]
        .map((url, index) => ({ url, index, pixels: vkArtworkPixels(url) }))
        .sort((a, b) => b.pixels - a.pixels || a.index - b.index)
        .slice(0, 4).map(({ url }) => url) : [];
    const key = urls.length ? JSON.stringify([track?.title, track?.artist, urls]) : '';
    if (key !== (active.cover?.key ?? '')) {
      this.dropCover(active);
      if (key) {
        const cover: CurrentCover = { key, id: randomUUID(), cancel: new AbortController() };
        active.cover = cover;
        void this.loadCover(active, cover, urls);
      }
    }
    this.publish(active, { track, engaged, cover: active.cover?.image ? `luma://app/media/vk-cover/${active.cover.id}` : undefined });
    // A page that starts playing outside its native slot is still silent until the
    // audio is unmuted again, and only engagement can move it out of that state.
    if (engaged) this.visibility(active);
  }

  private async loadCover(active: VkView, cover: CurrentCover, urls: string[]) {
    const signal = AbortSignal.any([cover.cancel.signal, AbortSignal.timeout(6_000)]);
    for (const src of urls) {
      const image = await fetchVkArtwork(net.fetch, src, signal);
      if (signal.aborted || active.cover !== cover || !this.musicPageReady(active)) return;
      if (!image) continue;
      // Store first: a saved listen may ask for this key the moment it is
      // published, and a 404 would only recover after the section re-mounted.
      const key = vkCoverKey(src);
      await this.covers?.put(key, image);
      if (signal.aborted || active.cover !== cover || !this.musicPageReady(active)) return;
      cover.image = image;
      if (this.covers) this.cached.add(key);
      const track = active.state.track;
      if (this.cached.has(key) && track) this.publish(active, { track: { ...track, artwork: key } });
      this.publish(active, { cover: `luma://app/media/vk-cover/${cover.id}` });
      return;
    }
  }

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

  private applyAppearance(active: VkView) {
    const contents = active.view.webContents;
    if (active.state.phase !== 'ready' || contents.isDestroyed()) return;
    const code = vkAppearanceScript(contents.getURL(), active.state.signIn);
    if (code) void contents.executeJavaScriptInIsolatedWorld(world, [{ code }]).catch(() => {});
  }

  close(owner?: BrowserWindow, id?: unknown) {
    const active = this.active;
    if (!active || (owner && (active.owner !== owner || active.id !== id))) return;
    this.dispose(active);
  }

  private dispose(active: VkView, announce = true) {
    this.dropCover(active);
    if (announce) this.publish(active, { phase: 'closed', track: undefined, engaged: undefined, cover: undefined });
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
    this.dropCover(active);
    this.publish(active, { phase: 'failed', track: undefined, engaged: undefined, cover: undefined });
    this.visibility(active);
  }

  private navigate(active: VkView, url: string) {
    if (this.active !== active || !vkSiteUrl(url) || active.view.webContents.isDestroyed()) return;
    void active.view.webContents.loadURL(withVkDomain(url, this.settings.vkDomain) ?? url).catch((error: unknown) => {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ERR_ABORTED')) this.fail(active);
    });
  }

  open(owner: BrowserWindow, id: unknown, url: unknown, bounds: unknown) {
    if (this.resetting || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || !vkSiteEntry(url) || owner.isMinimized()) throw new Error('VK view is unavailable');
    this.close();
    // The experimental domain switch and proxy are applied before the first request.
    const entry = withVkDomain(url, this.settings.vkDomain) ?? url;
    this.applyProxy();
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
    const active: VkView = { id, owner, view, entry, shown: false, foreground: true, revision: 0, reading: false, confirming: false, qrStarted: false, returnToEntry: false,
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
      this.dropCover(active);
      this.publish(active, { phase: 'loading', host: safe.hostname, signIn: vkSignInPage(safe), track: undefined, engaged: undefined, cover: undefined });
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
    if (!music || signIn) this.dropCover(active);
    this.publish(active, { phase: 'ready', host: safe.hostname, signIn, back: contents.navigationHistory.canGoBack(),
      ...((!music || signIn) && { track: undefined, engaged: undefined, cover: undefined }) });
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
        this.dropCover(active);
        this.publish(active, { signIn: true, track: undefined, engaged: undefined, cover: undefined });
        this.visibility(active);
        this.applyAppearance(active);
        this.startQr(active);
        return;
      }
      // A saved listen keeps an opaque key into the bounded cover cache, so no
      // VK address ever leaves this process. Only cached keys are published.
      const source = Array.isArray(snapshot?.artwork) ? snapshot.artwork.map(vkArtworkUrl).find(Boolean) : undefined;
      const key = source && vkCoverKey(source);
      const cover = key && this.cached.has(key) ? key : undefined;
      const visible = readVkNowPlaying({ ...snapshot, artwork: cover });
      const track = snapshot && readVkNowPlaying({ ...visible,
        playing: typeof media?.playing === 'boolean' ? media.playing : visible?.playing,
        previous: media?.previous === true || visible?.previous, toggle: media?.toggle === true || visible?.toggle,
        next: media?.next === true || visible?.next,
        timeline: media?.timeline?.seek || !visible?.timeline ? media?.timeline : visible.timeline,
        volume: media?.muted === true ? 0 : visible?.volume ?? media?.volume,
        canMute: snapshot.canMute === true || media?.canMute === true,
      });
      // A guest that is hidden behind Luma can still be read for its transport but
      // not always for every switch, so a known mode or feedback state stays
      // published for the same track instead of flickering away between polls.
      const previous = active.state.track;
      if (track && previous && previous.title === track.title && previous.artist === track.artist) {
        track.shuffle ??= previous.shuffle;
        track.repeat ??= previous.repeat;
        track.favorite ??= previous.favorite;
        track.liked ??= previous.liked;
        track.disliked ??= previous.disliked;
        track.canMute ||= previous.canMute;
      }
      const engaged = track?.playing ? true : active.state.engaged;
      if (!active.foreground && !engaged) { this.dispose(active); return; }
      const started = engaged !== active.state.engaged;
      this.publishTrack(active, track, engaged, snapshot?.artwork);
      if (started) this.visibility(active);
    } catch {
      // Navigation can replace the frame before the read finishes.
      if (this.isLive(active, revision) && !active.foreground && !active.state.engaged) this.dispose(active);
    }
    finally { active.reading = false; }
  }

  /**
   * Starts one of VK's own catalogue entries in the loaded music page. Unlike the
   * transport commands this is allowed while the page is not on screen: the point
   * of the control is to play VK music from Luma's own screens.
   */
  async collection(owner: BrowserWindow, id: unknown, kind: unknown, name?: unknown) {
    const active = this.active, contents = active?.view.webContents;
    const action = readVkCollection(kind);
    if (!action || !active || active.owner !== owner || active.id !== id || this.resetting || !contents || contents.isDestroyed()) return false;
    const literal = action === 'genre' || action === 'mood' ? readVkCollectionName(name) : undefined;
    if ((action === 'genre' || action === 'mood') && !literal) return false;
    if (!active.windowVisible || active.minimized) return false;
    // A background start keeps Luma's own screen in front, so the guest was opened
    // without bounds. Its catalogue only lays out inside a real viewport, so give it
    // the window's size while it stays invisible.
    if (!active.shown) {
      const [w, h] = active.owner.getContentSize();
      active.view.setBounds({ x: 0, y: 0, width: Math.max(1024, w), height: Math.max(720, h) });
      active.view.setVisible(false);
    }
    // Any page of the guest can be the one on screen; the catalogue only exists on
    // the music page, so the guest is sent there and given time to load it.
    if (!this.musicReady(active)) {
      this.navigate(active, vkMusicUrlFor(this.settings.vkDomain));
      const deadline = Date.now() + 12_000;
      while (!this.musicReady(active) && this.active === active && !contents.isDestroyed() && Date.now() < deadline) {
        await new Promise((resolve) => { setTimeout(resolve, 250); });
      }
      if (!this.musicReady(active)) return false;
    }
    const revision = active.revision;
    const wasForeground = active.foreground;
    try {
      const result: unknown = await contents.executeJavaScriptInIsolatedWorld(world, [{ code: inspectVkCollection(action, literal) }], true);
      const point = result && typeof result === 'object' ? (result as { point?: { x?: unknown; y?: unknown } }).point : undefined;
      const x = Math.round(Number(point?.x)), y = Math.round(Number(point?.y));
      if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return false;
      if (active.revision !== revision || contents.isDestroyed()) return false;
      // The press has to be read back: only a reported playing track may keep the
      // guest alive after Luma's window stops laying it out.
      active.foreground = true;
      contents.sendInputEvent({ type: 'mouseMove', x, y });
      contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      for (let attempt = 0; attempt < 10 && !active.state.engaged; attempt++) {
        await new Promise((resolve) => { setTimeout(resolve, 500); });
        if (this.active !== active || active.revision !== revision) return false;
        active.foreground = true;
        await this.readTrack(active);
      }
      const started = active.state.engaged === true;
      if (!started) { active.foreground = wasForeground; this.visibility(active); }
      return started;
    } catch { return false; }
  }

  /**
   * Starts a saved VK listen on its own page without taking Luma's screen away. The
   * guest is given a viewport but stays invisible, and VK's transport is pressed with
   * a replayed input event, exactly like a catalogue card is.
   */
  async playTrack(owner: BrowserWindow, id: unknown, url: unknown) {
    const active = this.active, contents = active?.view.webContents;
    if (!active || active.owner !== owner || active.id !== id || this.resetting || !contents || contents.isDestroyed()) { console.log('[probe] playTrack no session'); return false; }
    if (!active.windowVisible || active.minimized || !vkSiteEntry(url)) { console.log('[probe] playTrack guarded', active.windowVisible, active.minimized, !!vkSiteEntry(url)); return false; }
    const onPage = contents.getURL() === url;
    console.log('[probe] playTrack start', contents.getURL(), 'onPage', onPage, 'shown', active.shown, 'fg', active.foreground);
    if (onPage && active.state.track?.playing) return true;
    if (!active.shown) {
      const [w, h] = active.owner.getContentSize();
      active.view.setBounds({ x: 0, y: 0, width: Math.max(1024, w), height: Math.max(720, h) });
      active.view.setVisible(false);
    }
    const revision = active.revision, wasForeground = active.foreground;
    // A silent navigation is only kept while the view counts as foreground; the press
    // needs the same state, and the read-back is what keeps it alive afterwards.
    active.foreground = true;
    const finish = (started: boolean) => {
      console.log('[probe] playTrack finish', contents.getURL(), started);
      if (!started) active.foreground = wasForeground;
      if (this.active === active) this.visibility(active);
      return started;
    };
    if (!onPage || !this.musicPageReady(active)) {
      this.navigate(active, url);
      const deadline = Date.now() + 15_000;
      while (this.active === active && !contents.isDestroyed() && !this.musicPageReady(active) && active.state.phase !== 'failed' && Date.now() < deadline) {
        await new Promise((resolve) => { setTimeout(resolve, 250); });
      }
      if (this.active !== active || contents.isDestroyed() || !this.musicPageReady(active)) {
        console.log('[probe] playTrack nav failed', contents.isDestroyed(), active.state.phase, contents.getURL());
        return finish(false);
      }
      console.log('[probe] playTrack page ready', contents.getURL());
    }
    // The press is replayed like a catalogue card's: VK only reacts to a real input event.
    for (let attempt = 0; attempt < 5; attempt++) {
      if (active.revision !== revision && active.state.track?.playing) break;
      const result: unknown = await contents.executeJavaScriptInIsolatedWorld(world,
        [{ code: inspectVkPlayer('toggle', undefined, 'trusted') }], true).catch(() => undefined);
      const point = result && typeof result === 'object' ? (result as { point?: { x?: unknown; y?: unknown } }).point : undefined;
      const x = Math.round(Number(point?.x)), y = Math.round(Number(point?.y));
      if (Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0 && this.active === active) {
        contents.sendInputEvent({ type: 'mouseMove', x, y });
        contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
        contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      }
      for (let wait = 0; wait < 6; wait++) {
        await new Promise((resolve) => { setTimeout(resolve, 500); });
        if (this.active !== active || contents.isDestroyed()) return false;
        if (active.state.track?.playing === true) return finish(true);
        active.foreground = true;
        await this.readTrack(active);
      }
    }
    return finish(active.state.track?.playing === true);
  }

  /** Opens the album of the track that is open in the guest, with a real press. */
  async album(owner: BrowserWindow, id: unknown) {
    const active = this.active, contents = active?.view.webContents;
    if (!active || active.owner !== owner || active.id !== id || this.resetting || !contents || contents.isDestroyed()) return false;
    if (!active.windowVisible || active.minimized || !this.musicReady(active)) return false;
    const revision = active.revision;
    try {
      const result: unknown = await contents.executeJavaScriptInIsolatedWorld(world, [{ code: inspectVkAlbum() }], true);
      const point = result && typeof result === 'object' ? (result as { point?: { x?: unknown; y?: unknown } }).point : undefined;
      const x = Math.round(Number(point?.x)), y = Math.round(Number(point?.y));
      if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return false;
      if (this.active !== active || active.revision !== revision || contents.isDestroyed()) return false;
      contents.sendInputEvent({ type: 'mouseMove', x, y });
      contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      return true;
    } catch { return false; }
  }

  async command(owner: BrowserWindow, id: unknown, action: unknown, fraction?: unknown) {
    const active = this.active, contents = active?.view.webContents;
    if (this.resetting || !active || active.owner !== owner || active.id !== id || !contents || contents.isDestroyed()) return false;
    const foreground = this.inForeground(active) && active.shown;
    if (action === 'back' && foreground && contents.navigationHistory.canGoBack()) { contents.navigationHistory.goBack(); return true; }
    if (action === 'music' && foreground && !active.state.signIn) { this.navigate(active, vkMusicUrlFor(this.settings.vkDomain)); return true; }
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
      const track = active.state.track;
      const fromDom = async (command: VkPlaybackAction | 'seek', ratio?: number, gesture: 'click' | 'pointer' | 'trusted' = 'click') => {
        if (!stillHere()) return false;
        const result: unknown = await contents.executeJavaScriptInIsolatedWorld(world, [{ code: inspectVkPlayer(command, ratio, gesture) }], true);
        if (result === true) return true;
        // A trusted gesture comes back as a point: the host replays it as genuine
        // input so a handler that ignores scripted clicks still receives a press.
        const point = gesture === 'trusted' && result && typeof result === 'object' ? (result as { point?: { x?: unknown; y?: unknown } }).point : undefined;
        const x = Math.round(Number(point?.x)), y = Math.round(Number(point?.y));
        if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return false;
        if (contents.isDestroyed()) return false;
        contents.sendInputEvent({ type: 'mouseMove', x, y });
        contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
        contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
        return true;
      };
      const fromMedia = (command: VkPlaybackAction | 'seek', ratio?: number) => contents.executeJavaScript(playback(command, ratio), true).catch(() => false);
      if (action === 'seek') {
        const ratio = vkSeekRatio(fraction);
        return ratio !== undefined && track?.timeline?.seek === true && ((await fromMedia('seek', ratio)) === true || await fromDom('seek', ratio));
      }
      if (action === 'volume' || action === 'mute') {
        const ratio = vkSeekRatio(fraction);
        if (track?.volume === undefined || (action === 'volume' ? ratio === undefined : !track.canMute)) return false;
        return await fromDom(action, ratio) || (stillHere() && (await fromMedia(action, ratio)) === true);
      }
      const modes = ['shuffle', 'repeat', 'favorite', 'like', 'dislike'] as const;
      const toggle = (modes as readonly unknown[]).includes(action) ? action as typeof modes[number] : undefined;
      if (toggle) {
        // The published snapshot is a poll behind the rendered player, so a stale
        // "not offered" flag must not refuse a control that is on screen.
        const field = toggle === 'like' ? 'liked' : toggle === 'dislike' ? 'disliked' : toggle;
        const read = async () => readVkNowPlaying(await contents.executeJavaScriptInIsolatedWorld(world, [{ code: inspectVkPlayer() }])
          .catch(() => undefined))?.[field];
        const before = await read();
        // A verified change is published at once, so the card answers the press
        // instead of waiting for the next poll of a player that may be hidden.
        const publishMode = (value: unknown) => {
          const current = active.state.track;
          if (!current) return;
          if (field === 'repeat') {
            if (value === 'off' || value === 'one' || value === 'all') this.publish(active, { track: { ...current, repeat: value } });
          } else if (typeof value === 'boolean') {
            this.publish(active, { track: { ...current, [field]: value } as VkNowPlaying });
          }
        };
        const settled = async () => {
          const after = await read();
          if (after === before) return false;
          publishMode(after);
          return true;
        };
        // Without a readable state the switch cannot be verified, so it gets a
        // single faithful gesture instead of two presses that could cancel out.
        if (!await fromDom(toggle, undefined, before === undefined ? 'trusted' : 'pointer')) return false;
        if (before === undefined) return true;
        // VK applies a mode locally but a feedback mark after a server round trip,
        // so the first press is given time before it is ever repeated.
        for (const pause of [340, 260]) {
          await delay(pause);
          if (await settled()) return true;
        }
        // Scripted clicks are ignored by some builds; replay it as genuine input.
        if (!await fromDom(toggle, undefined, 'trusted')) return false;
        await delay(460);
        return await settled();
      }
      if (action !== 'pause' && !VK_TRANSPORT.some((value) => value === action)) return false;
      const transport = action as typeof VK_TRANSPORT[number] | 'pause';
      if (transport !== 'pause' && !track?.[transport]) return false;
      if (await fromMedia(transport) === true || await fromDom(transport)) return true;
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
      this.publish(active, { phase: 'loading', host: '', back: false, signIn: false, track: undefined, engaged: undefined, cover: undefined });
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
