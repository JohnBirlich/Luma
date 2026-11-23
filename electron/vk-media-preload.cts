import electron = require('electron');
const { contextBridge } = electron;
import type { VkTransport } from '../src/shared/vk-site.js';

// Runs before VK's scripts, in the guest's page world. The hook only observes standard media
// APIs and calls the same handlers VK provides for system media controls. It exposes no IPC or
// Electron capabilities, reads no credentials, and never installs hooks on login / QR pages.
function installVkPlayback() {
  if (window.top !== window || location.protocol !== 'https:' || location.port
    || !['vk.ru', 'vk.com', 'm.vk.ru', 'm.vk.com', 'music.vk.ru', 'music.vk.com'].includes(location.hostname)) return;
  const musicPage = () => /^\/(?:audio(?:-?\d+_\d+)?\/?|audios-?\d+\/?|music(?:\/.*)?)$/.test(location.pathname);
  // VK can move from the authenticated feed to music without loading a new document.
  if ((!musicPage() && location.pathname !== '/feed') || !navigator.mediaSession) return;

  const media = navigator.mediaSession;
  const handlers = new Map<MediaSessionAction, MediaSessionActionHandler>();
  const actions = new Set<MediaSessionAction>(['play', 'pause', 'nexttrack', 'previoustrack', 'seekto']);
  const setActionHandler = media.setActionHandler;
  media.setActionHandler = function (action, handler) {
    setActionHandler.call(this, action, handler);
    if (this !== media || !actions.has(action)) return;
    if (handler) handlers.set(action, handler);
    else handlers.delete(action);
  };

  let clock: { metadata: MediaMetadata | null; duration: number; position: number; rate: number; time: number } | undefined;
  if (typeof media.setPositionState === 'function') {
    const setPositionState = media.setPositionState;
    media.setPositionState = function (state) {
      setPositionState.call(this, state);
      if (this !== media) return;
      const duration = state?.duration;
      clock = typeof duration === 'number' && duration > 0 && duration <= 86_400
        ? { metadata: media.metadata, duration, position: state?.position ?? 0, rate: state?.playbackRate ?? 1, time: performance.now() }
        : undefined;
    };
  }

  // Some players keep their Audio element detached. Observe play without changing its result or
  // retaining a stream URL. If several connected audio elements are active, don't guess a target.
  let lastAudio: WeakRef<HTMLAudioElement> | undefined;
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const result = play.call(this);
    if (this instanceof HTMLAudioElement && musicPage()) lastAudio = new WeakRef(this);
    return result;
  };
  const currentAudio = () => {
    const remembered = lastAudio?.deref();
    const candidates = [...document.querySelectorAll('audio')];
    if (remembered && !candidates.includes(remembered)) candidates.push(remembered);
    const active = candidates.filter((audio) => !audio.paused && !audio.ended);
    return active.length === 1 ? active[0]
      : active.length === 0 ? remembered ?? (candidates.length === 1 ? candidates[0] : undefined) : undefined;
  };
  const supports = (action: MediaSessionAction) => handlers.has(action);
  const run = (action: MediaSessionAction, extra?: { seekTime: number }) => {
    const handler = handlers.get(action);
    if (!handler) return false;
    handler({ action, ...extra });
    return true;
  };

  Object.defineProperty(globalThis, '__lumaVkPlayback', { value(action?: VkTransport | 'seek', ratio?: number, useElement = false) {
    if (!musicPage()) return;
    const audio = currentAudio();
    const playing = media.playbackState === 'playing' || (media.playbackState === 'none' && audio?.paused === false && !audio.ended);
    const toggle = playing ? 'pause' : 'play';
    const duration = audio?.duration;
    const elementTime = audio && typeof duration === 'number' && duration > 0 && duration <= 86_400 ? { duration, position: audio.currentTime } : undefined;
    const sessionTime = clock?.metadata === media.metadata && clock ? {
      duration: clock.duration,
      position: clock.position + (playing ? (performance.now() - clock.time) * clock.rate / 1000 : 0),
    } : undefined;
    const timing = elementTime ?? sessionTime;
    const canUseAudio = !!audio && audio.readyState > 0 && !audio.error;
    const canSeekAudio = canUseAudio && !!elementTime && audio.seekable.length > 0;
    if (!action) return {
      ...(media.playbackState !== 'none' || audio ? { playing } : {}),
      previous: supports('previoustrack'), toggle: supports(toggle) || canUseAudio, next: supports('nexttrack'),
      timeline: timing && { ...timing, seek: supports('seekto') || canSeekAudio },
    };
    if (action === 'previous') return run('previoustrack');
    if (action === 'next') return run('nexttrack');
    if (action === 'toggle') {
      if (!useElement) return run(toggle);
      if (!canUseAudio) return false;
      if (playing) { audio.pause(); return true; }
      return audio.play().then(() => true, () => false);
    }
    if (action !== 'seek' || typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) return false;
    const handlerDuration = sessionTime?.duration ?? elementTime?.duration;
    if (handlerDuration !== undefined && run('seekto', { seekTime: ratio * handlerDuration })) return true;
    if (canSeekAudio) {
      const seconds = ratio * elementTime.duration;
      const ranges = audio.seekable;
      for (let i = 0; i < ranges.length; i++) {
        if (seconds >= ranges.start(i) && seconds <= ranges.end(i)) { audio.currentTime = seconds; return true; }
      }
    }
    return false;
  } });
}

if (process.isMainFrame) {
  try { contextBridge.executeInMainWorld({ func: installVkPlayback }); }
  catch { /* If the runtime can't install media hooks, the scoped visible player still works. */ }
}
