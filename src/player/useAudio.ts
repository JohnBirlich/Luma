import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { clamp, dbToLinear, effectivePreamp, EQ_BAND_COUNT, EQ_REFERENCE_RATE, filterHz } from '../shared/equalizer';
import type { EqualizerSettings } from '../shared/equalizer';
import { isMetered, streamUrl } from '../shared/audio-quality';
import { fadeProgress, trackOverlap } from '../shared/crossfade';
import type { AudioQuality } from '../shared/audio-quality';
import { FloatSink } from './float-sink';
import type { FloatStatus } from '../shared/float-output';
import { ListeningClock } from '../shared/lastfm';
import type { Track } from '../shared/media';
import { recordDiagnostic } from '../data/diagnostics';

export const SPECTRUM_FFT_SIZE = 1024;
export type ReadSpectrum = (buffer: Uint8Array<ArrayBuffer>) => boolean;

interface Snapshot {
  playing: boolean;
  loading?: boolean;
  elapsed: number;
  duration: number;
  error: string;
  stream?: { id: string; url: string; cached: boolean };
}
interface Transition {
  seconds: number;
  next(current: Track): Track | undefined;
  advance(id: string): void;
}
interface Deck { audio: HTMLAudioElement; track: Track; listening?: ListeningClock; requested?: boolean; stream?: Snapshot['stream'] }
interface Warmup extends Deck { starting: boolean; source: string }
interface Fade { outgoing: Deck; incoming: Deck; seconds: number; start?: number; timeout: number; interval?: number }
function markListening(deck: Deck) {
  if ((!window.luma?.lastfm && !window.luma?.musicServices) || deck.track.online?.source === 'broadcast' || deck.audio.paused || deck.listening) return;
  deck.listening = ListeningClock.start(deck.track, Math.floor(Date.now() / 1000));
  if (deck.listening) {
    const duration = length(deck.audio, deck.track);
    window.luma?.lastfm?.record(deck.listening.now(duration));
    deck.listening.sample(deck.audio.currentTime, performance.now() / 1000, duration, deck.audio.playbackRate);
  }
}
const stopped: Snapshot = { playing: false, elapsed: 0, duration: 0, error: '' };

class AudioGraph {
  readonly context = new AudioContext();
  readonly analyser = this.context.createAnalyser();
  private preamp = this.context.createGain();
  readonly master = this.context.createGain();
  private decks = new Map<HTMLAudioElement, GainNode>();
  private filters = Array.from({ length: EQ_BAND_COUNT }, () => this.context.createBiquadFilter());
  private equalizer?: EqualizerSettings;

  constructor(audio: HTMLAudioElement) {
    this.analyser.fftSize = SPECTRUM_FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0.61;
    const chain: AudioNode[] = [this.preamp, ...this.filters, this.analyser, this.master, this.context.destination];
    chain.slice(1).forEach((node, index) => chain[index].connect(node));
    this.connect(audio);
  }

  connect(audio: HTMLAudioElement) {
    const existing = this.decks.get(audio);
    if (existing) return existing.gain;
    const source = this.context.createMediaElementSource(audio);
    const level = this.context.createGain();
    source.connect(level).connect(this.preamp);
    this.decks.set(audio, level);
    audio.volume = 1;
    return level.gain;
  }

  has(audio: HTMLAudioElement) { return this.decks.has(audio); }

  gain(audio: HTMLAudioElement, start: number, fadeTo?: number, seconds = 0) {
    const parameter = this.decks.get(audio)?.gain;
    if (!parameter) return;
    const time = this.context.currentTime;
    parameter.cancelScheduledValues(time);
    parameter.setValueAtTime(start, time);
    if (fadeTo !== undefined) parameter.linearRampToValueAtTime(fadeTo, time + seconds);
  }

  update(settings: EqualizerSettings, volume: number, immediate = false) {
    const set = (parameter: AudioParam, value: number) => {
      if (immediate) parameter.value = value;
      else parameter.setTargetAtTime(value, this.context.currentTime, 0.025);
    };
    set(this.master.gain, volume);
    if (this.equalizer === settings) return;
    this.equalizer = settings;
    const rate = this.context.sampleRate;
    set(this.preamp.gain, dbToLinear(effectivePreamp(settings, rate)));
    this.filters.forEach((filter, index) => {
      const band = settings.bands[index];
      const active = settings.enabled && band.enabled;
      // Zero-gain peaking is transparent, unlike zero-gain notch. It is the per-slot bypass.
      const type = active ? band.type : 'peaking';
      if (filter.type !== type) filter.type = type;
      set(filter.frequency, filterHz(band.hz, rate));
      set(filter.Q, band.q);
      set(filter.gain, active ? band.gain : 0);
    });
  }
}

const unavailable = 'Не удалось воспроизвести трек. Проверьте, не перемещён ли файл и поддерживается ли его формат.';
const length = (audio: HTMLAudioElement, track: Track) => track.online?.source === 'broadcast' ? 0 : Number.isFinite(audio.duration) ? audio.duration : track.duration;
function unload(audio: HTMLAudioElement) {
  audio.pause();
  if (audio.getAttribute('src')) { audio.removeAttribute('src'); audio.load(); }
}

export function useAudio(volume: number, eq: EqualizerSettings, quality: AudioQuality, nativeFloat: boolean, ended: RefObject<() => void>, trackStarted: (id: string) => void, transition: RefObject<Transition>, recover: RefObject<(track: Track) => boolean>, beforePlay: () => Promise<void> | undefined) {
  const ref = useRef<HTMLAudioElement>(null);
  const blendRef = useRef<HTMLAudioElement>(null);
  const streamRef = useRef<HTMLAudioElement>(null);
  const streamBlendRef = useRef<HTMLAudioElement>(null);
  const graph = useRef<AudioGraph | null>(null);
  const graphUnavailable = useRef(false);
  const active = useRef<Deck | null>(null);
  const candidate = useRef<Warmup | null>(null);
  const warmFailure = useRef<{ outgoing: Deck; id: string; source: string } | null>(null);
  const fading = useRef<Fade | null>(null);
  const token = useRef(0);
  const playIntent = useRef(0);
  const pendingOnline = useRef<Deck | null>(null);
  const loadStarted = useRef(0);
  const native = useRef<FloatSink | undefined>(undefined);
  const [floatStatus, setFloatStatus] = useState<FloatStatus>('system');
  const [snapshot, setSnapshot] = useState<Snapshot>(stopped);
  const settings = useRef({ volume, eq, quality, nativeFloat });
  const errorText = useCallback(() => active.current?.track.online?.source === 'broadcast'
    ? 'Не удалось подключиться к эфиру. Повторите попытку или откройте сайт станции.' : active.current?.track.online
    ? 'Источник не воспроизводит этот трек. Проверьте сеть или откройте страницу записи.' : unavailable, []);

  const recoverSource = useCallback((deck: Deck) => {
    if (active.current !== deck || !deck.requested || !deck.track.online || deck.track.online.source === 'broadcast') return false;
    deck.requested = false;
    return recover.current(deck.track);
  }, [recover]);

  const gain = useCallback((audio: HTMLAudioElement, level: number) => {
    if (graph.current?.has(audio)) graph.current.gain(audio, level);
    else audio.volume = settings.current.volume * level;
  }, []);

  // Use WebAudio ramps for files and element gain for network audio. A WebAudio
  // media source would silence streams that don't support CORS.
  const updateElementVolumes = useCallback(() => {
    const fade = fading.current;
    const progress = fade?.start === undefined ? 0 : fadeProgress(performance.now() - fade.start, fade.seconds);
    for (const audio of [ref.current, blendRef.current, streamRef.current, streamBlendRef.current]) {
      if (!audio || graph.current?.has(audio)) continue;
      const level = audio === fade?.incoming.audio ? progress : audio === fade?.outgoing.audio ? 1 - progress
        : audio === candidate.current?.audio ? 0 : 1;
      audio.volume = settings.current.volume * level;
    }
  }, []);
  useEffect(() => {
    const mixer = graph.current;
    const bridge = window.luma?.floatOutput;
    const outgoing = fading.current?.outgoing;
    const localPlaying = snapshot.playing || (outgoing && !outgoing.track.online && !outgoing.audio.paused);
    if (nativeFloat && localPlaying && active.current && !active.current.track.online && mixer && bridge) {
      native.current ??= new FloatSink(mixer.context, mixer.master, bridge, setFloatStatus);
      void native.current.set(true);
    } else if (native.current) void native.current.set(false);
  }, [nativeFloat, snapshot.playing, snapshot.loading, snapshot.stream?.id]);

  const cancelWarmup = useCallback(() => {
    const incoming = candidate.current;
    candidate.current = null;
    if (incoming) { unload(incoming.audio); gain(incoming.audio, 1); }
  }, [gain]);
  const endFade = useCallback(() => {
    const fade = fading.current;
    fading.current = null;
    if (!fade) return;
    window.clearTimeout(fade.timeout);
    window.clearInterval(fade.interval);
    unload(fade.outgoing.audio);
    gain(fade.outgoing.audio, 1);
    if (active.current) gain(active.current.audio, 1);
  }, [gain]);
  const cancelTransitions = useCallback(() => { cancelWarmup(); endFade(); }, [cancelWarmup, endFade]);

  useEffect(() => {
    const prior = settings.current;
    settings.current = { volume, eq, quality, nativeFloat };
    if (candidate.current && (prior.quality.normal !== quality.normal || prior.quality.metered !== quality.metered
      || prior.quality.network !== quality.network || prior.nativeFloat !== nativeFloat)) cancelWarmup();
    const fade = fading.current;
    if (nativeFloat && fade && !!fade.outgoing.track.online !== !!fade.incoming.track.online) endFade();
    graph.current?.update(eq, volume);
    updateElementVolumes();
  }, [cancelWarmup, endFade, volume, eq, quality, nativeFloat, updateElementVolumes]);

  const idleDeck = useCallback((track: Track, outgoing?: HTMLAudioElement) => track.online
    ? outgoing === streamRef.current ? streamBlendRef.current : streamRef.current
    : outgoing === ref.current ? blendRef.current : ref.current, []);
  const prepareFile = useCallback((audio: HTMLAudioElement, track: Track, preload: 'metadata' | 'auto') => {
    audio.preload = preload;
    audio.src = track.audioUrl;
    audio.load();
  }, []);
  const meteredNetwork = useCallback(() => {
    const connection = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
    return isMetered(settings.current.quality.network, connection);
  }, []);
  const preferredStream = useCallback((track: Track) => {
    const q = settings.current.quality;
    return streamUrl(track, meteredNetwork() ? q.metered : q.normal);
  }, [meteredNetwork]);
  const resolveStream = useCallback(async (track: Track) => {
    const cached = track.online?.source === 'wikimedia_audio' && window.luma?.streamCache
      ? await window.luma.streamCache.url(track).catch(() => null) : null;
    return { url: preferredStream(track), cached };
  }, [preferredStream]);
  const connectFile = useCallback((audio: HTMLAudioElement) => {
    if (!graph.current || graph.current.has(audio)) return;
    try { graph.current.connect(audio); }
    catch { recordDiagnostic('audio.graphUnavailable'); }
  }, []);
  const prepareMixer = useCallback((audio: HTMLAudioElement) => {
    if (!graph.current && !graphUnavailable.current) {
      try {
        const engine = new AudioGraph(audio);
        engine.update(settings.current.eq, settings.current.volume, true);
        graph.current = engine;
      } catch {
        graphUnavailable.current = true;
        recordDiagnostic('audio.graphUnavailable');
      }
    }
    connectFile(audio);
    if (graph.current?.context.state === 'suspended') void graph.current.context.resume().catch(() => undefined);
  }, [connectFile]);
  const canOverlap = useCallback((deck: Deck, target: Track) => {
    return deck.track.id !== target.id && deck.track.audioUrl !== target.audioUrl
      && !deck.audio.paused && !deck.audio.ended && !deck.audio.seeking && !deck.audio.error
      && deck.audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && deck.audio.playbackRate === 1
      && Number.isFinite(deck.audio.duration) && deck.audio.duration > 0
      && deck.track.online?.source !== 'broadcast' && target.online?.source !== 'broadcast'
      // Don't route network audio around an active exclusive output.
      && !(settings.current.nativeFloat && !!deck.track.online !== !!target.online)
      && !(target.online && (meteredNetwork() || !navigator.onLine));
  }, [meteredNetwork]);
  const beginFade = useCallback((fade: Fade) => {
    if (fading.current !== fade || active.current !== fade.incoming || fade.start !== undefined) return;
    const a = fade.outgoing, b = fade.incoming;
    const mixer = graph.current;
    const duration = trackOverlap(transition.current.seconds, a.audio.duration, b.audio.duration, a.audio.duration - a.audio.currentTime);
    if (!duration || !canOverlap(a, b.track) || b.audio.paused || (settings.current.nativeFloat
      && !b.track.online && (!mixer?.has(a.audio) || !mixer.has(b.audio)))) { endFade(); return; }
    window.clearTimeout(fade.timeout);
    fade.seconds = duration;
    fade.start = performance.now();
    if (mixer?.has(a.audio)) mixer.gain(a.audio, 1, 0, duration);
    if (mixer?.has(b.audio)) mixer.gain(b.audio, 0, 1, duration);
    if (!mixer?.has(a.audio) || !mixer?.has(b.audio)) {
      updateElementVolumes();
      fade.interval = window.setInterval(updateElementVolumes, 30);
    }
    fade.timeout = window.setTimeout(endFade, Math.ceil(duration * 1000) + 24);
  }, [canOverlap, endFade, transition, updateElementVolumes]);

  const advanceSmoothly = useCallback((deck: Deck) => {
    const { audio, track } = deck;
    const policy = transition.current;
    const outgoingDuration = audio.duration;
    const remaining = outgoingDuration - audio.currentTime;
    if (!policy.seconds || fading.current || !Number.isFinite(remaining) || remaining < .22 || remaining > policy.seconds + 1.6) {
      cancelWarmup(); return;
    }
    const target = policy.next(track);
    const overlap = target ? trackOverlap(policy.seconds, outgoingDuration, target.duration || outgoingDuration) : 0;
    if (!target || !overlap || !canOverlap(deck, target) || remaining > overlap + 1.6) { cancelWarmup(); return; }
    const source = preferredStream(target);
    const failed = warmFailure.current;
    if (failed?.outgoing === deck && failed.id === target.id && failed.source === source) { cancelWarmup(); return; }
    let incoming = candidate.current;
    if (!incoming || incoming.track.id !== target.id || incoming.source !== source) {
      cancelWarmup();
      const idle = idleDeck(target, audio);
      if (!idle) return;
      if (!target.online) prepareMixer(idle);
      if (!target.online && settings.current.nativeFloat && (!graph.current?.has(audio) || !graph.current.has(idle))) return;
      gain(idle, 0);
      const warm: Warmup = incoming = { audio: idle, track: target, starting: false, source };
      candidate.current = incoming;
      if (target.online) {
        void resolveStream(target).then(({ url, cached }) => {
          if (candidate.current !== warm || active.current !== deck) return;
          if (url !== warm.source || !canOverlap(deck, target)) { cancelWarmup(); return; }
          warm.stream = { id: target.id, url, cached: !!cached };
          idle.preload = 'auto';
          idle.src = cached ?? url;
          idle.load();
        }).catch(() => {
          if (candidate.current !== warm) return;
          warmFailure.current = { outgoing: deck, id: target.id, source };
          cancelWarmup();
        });
      } else prepareFile(idle, target, 'auto');
    }
    const failWarmup = () => { warmFailure.current = { outgoing: deck, id: target.id, source }; cancelWarmup(); };
    if (incoming.audio.error) { failWarmup(); return; }
    if (incoming.starting || incoming.audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
    const decodedOverlap = trackOverlap(policy.seconds, outgoingDuration, incoming.audio.duration);
    if (!decodedOverlap) { failWarmup(); return; }
    if (remaining > decodedOverlap) return;
    incoming.starting = true;
    const warm = incoming;
    void warm.audio.play().then(() => {
      if (candidate.current !== warm) return;
      const latest = transition.current;
      const wanted = latest.next(track);
      const duration = trackOverlap(latest.seconds, audio.duration, warm.audio.duration, audio.duration - audio.currentTime);
      if (active.current !== deck || !canOverlap(deck, warm.track) || warm.audio.paused || !duration
        || wanted?.id !== warm.track.id || preferredStream(wanted) !== warm.source) { cancelWarmup(); return; }
      warmFailure.current = null;
      candidate.current = null;
      token.current++;
      active.current = warm;
      warm.requested = true;
      const fade = fading.current = { outgoing: deck, incoming: warm, seconds: duration, timeout: 0 };
      beginFade(fade);
      setSnapshot({ ...stopped, playing: true, elapsed: warm.audio.currentTime, duration: length(warm.audio, warm.track), stream: warm.stream });
      latest.advance(warm.track.id);
      recordDiagnostic('audio.play');
      trackStarted(warm.track.id);
      markListening(warm);
    }).catch(() => { if (candidate.current === warm) failWarmup(); });
  }, [beginFade, cancelWarmup, canOverlap, gain, idleDeck, preferredStream, prepareFile, prepareMixer, resolveStream, trackStarted, transition]);

  useEffect(() => {
    const cleanups = [ref.current, blendRef.current, streamRef.current, streamBlendRef.current].flatMap((audio) => {
      if (!audio) return [];
      const listeners: Record<string, (deck: Deck) => void> = {
        play: ({ track }) => {
          if (audio.paused || track.online?.source === 'broadcast') return;
          recordDiagnostic('audio.play');
          setSnapshot((previous) => ({ ...previous, playing: true, loading: false }));
        },
        playing: (deck) => {
          if (audio.paused) return;
          if (deck.track.online?.source === 'broadcast') {
            recordDiagnostic('audio.play');
            setSnapshot((previous) => ({ ...previous, playing: true, loading: false }));
          } else { trackStarted(deck.track.id); markListening(deck); }
        },
        seeking: (deck) => {
          deck.listening?.interrupt();
          if (audio.seeking) cancelTransitions();
        },
        waiting: (deck) => {
          deck.listening?.interrupt();
          if (fading.current?.start !== undefined && audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) endFade();
        },
        ratechange: (deck) => deck.listening?.interrupt(),
        pause: (deck) => {
          deck.listening?.interrupt();
          if (!audio.paused) return;
          cancelTransitions();
          recordDiagnostic('audio.pause');
          setSnapshot((previous) => ({ ...previous, playing: false, loading: false }));
        },
        loadedmetadata: () => recordDiagnostic('audio.ready', { ms: performance.now() - loadStarted.current }),
        timeupdate: (deck) => {
          if (deck.track.online?.source === 'broadcast') return;
          setSnapshot((previous) => ({ ...previous, elapsed: audio.currentTime }));
          if (!audio.paused && !audio.seeking && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const event = deck.listening?.sample(audio.currentTime, performance.now() / 1000, length(audio, deck.track), audio.playbackRate);
            if (event) {
              window.luma?.lastfm?.record(event);
              if (!deck.track.online) window.luma?.musicServices?.recordLocalListen(deck.track.id, event);
            }
          }
          advanceSmoothly(deck);
        },
        durationchange: ({ track }) => setSnapshot((previous) => ({ ...previous, duration: length(audio, track) })),
        ended: (deck) => {
          deck.requested = false;
          deck.listening = undefined;
          cancelTransitions();
          setSnapshot((previous) => ({ ...previous, playing: false, loading: false }));
          if (deck.track.online?.source !== 'broadcast') ended.current();
          else unload(audio);
        },
        error: (deck) => {
          if (!audio.error) return;
          cancelTransitions();
          recordDiagnostic('audio.error', { code: audio.error.code });
          if (recoverSource(deck)) return;
          setSnapshot((previous) => ({ ...previous, playing: false, loading: false, error: errorText() }));
        },
      };
      const bindings = Object.entries(listeners).map(([event, callback]) => {
        const guarded = () => { if (active.current?.audio === audio) callback(active.current); };
        audio.addEventListener(event, guarded);
        return () => audio.removeEventListener(event, guarded);
      });
      return [() => { bindings.forEach((unbind) => unbind()); audio.pause(); }];
    });
    return () => {
      active.current = null;
      cancelTransitions();
      cleanups.forEach((cleanup) => cleanup());
      const mixer = graph.current;
      if (native.current) void native.current.close().then(() => mixer?.context.close()).catch(() => {});
      else if (mixer) void mixer.context.close().catch(() => {});
    };
  }, [advanceSmoothly, cancelTransitions, endFade, ended, errorText, recoverSource, trackStarted]);

  const play = useCallback(async () => {
    const intent = ++playIntent.current;
    const deck = active.current;
    if (!deck) return;
    // Hand off from an embedded source before asking Chromium or native output to play.
    const handoff = beforePlay();
    if (handoff) {
      try { await handoff; }
      catch {
        if (intent === playIntent.current) {
          endFade();
          setSnapshot((previous) => ({ ...previous, loading: false, error: 'Не удалось отключить воспроизведение VK.' }));
        }
        return;
      }
      if (intent !== playIntent.current || active.current !== deck) return;
    }
    const { audio, track } = deck;
    deck.requested = true;
    if (track.online) {
      const hasSource = !!audio.getAttribute('src') && !audio.error;
      const retryOffline = hasSource && audio.paused && !navigator.onLine && !audio.src.startsWith('luma:');
      pendingOnline.current = deck;
      if (audio.paused) setSnapshot((previous) => ({ ...previous, loading: true, error: '' }));
      try {
        if (native.current) await native.current.set(false);
        if (intent !== playIntent.current || active.current !== deck) return;
        if (!hasSource || retryOffline) {
          const { cached, url } = await resolveStream(track);
          if (intent !== playIntent.current || active.current !== deck) return;
          if (!cached && !navigator.onLine && !hasSource) {
            endFade();
            if (recoverSource(deck)) return;
            setSnapshot((previous) => ({ ...previous, playing: false, loading: false, error: 'Устройство вне сети. Для онлайн-треков нужно подключение.' }));
            return;
          }
          if (cached || !hasSource) {
            loadStarted.current = performance.now();
            recordDiagnostic('audio.loading');
            // A restored queue never fetches audio until the user starts playing.
            audio.src = cached ?? url;
            deck.stream = { id: track.id, url, cached: !!cached };
            setSnapshot((previous) => ({ ...previous, stream: deck.stream }));
          }
        }
      } finally {
        if (intent === playIntent.current && pendingOnline.current === deck) pendingOnline.current = null;
      }
    }
    if (!track.online) {
      prepareMixer(audio);
      // Connecting a new file deck normalizes its element volume. Set its real
      // starting gain before Chromium can make the incoming track audible.
      if (fading.current?.incoming === deck && fading.current.start === undefined) gain(audio, 0);
    }
    if (audio.error) audio.load();
    if (audio.ended) audio.currentTime = 0;
    setSnapshot((previous) => ({ ...previous, error: '' }));
    const version = token.current;
    const deadline = track.online ? window.setTimeout(() => {
      if (intent !== playIntent.current || version !== token.current || audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
      endFade();
      unload(audio);
      recordDiagnostic('audio.error', { code: 0 });
      if (recoverSource(deck)) return;
      setSnapshot({ ...stopped, duration: track.duration, error: track.online?.source === 'broadcast' ? errorText() : 'Источник не ответил вовремя. Повторите попытку или откройте страницу записи.' });
    }, 15_000) : undefined;
    void audio.play().then(() => {
      const fade = fading.current;
      if (intent === playIntent.current && fade?.incoming === deck) beginFade(fade);
    }).catch((error: unknown) => {
      if (intent !== playIntent.current || version !== token.current || (error instanceof DOMException && error.name === 'AbortError')) return;
      endFade();
      const autoplayBlocked = error instanceof DOMException && error.name === 'NotAllowedError';
      recordDiagnostic(autoplayBlocked ? 'audio.blocked' : 'audio.error', { code: audio.error?.code ?? 0 });
      if (autoplayBlocked) deck.requested = false;
      else if (recoverSource(deck)) return;
      setSnapshot((previous) => ({
        ...previous, playing: false, loading: false, error: autoplayBlocked ? 'Нажмите «Воспроизвести», чтобы начать.' : errorText(),
      }));
    }).finally(() => window.clearTimeout(deadline));
  }, [beforePlay, beginFade, endFade, errorText, gain, prepareMixer, recoverSource, resolveStream]);

  const load = useCallback((track: Track | null, autoplay = false) => {
    const previous = active.current;
    if (track?.id !== previous?.track.id || track?.audioUrl !== previous?.track.audioUrl) {
      token.current++;
      playIntent.current++;
      pendingOnline.current = null;
      warmFailure.current = null;
      cancelTransitions();
      const duration = track && previous && autoplay && canOverlap(previous, track)
        ? trackOverlap(transition.current.seconds, previous.audio.duration, track.duration || previous.audio.duration,
          previous.audio.duration - previous.audio.currentTime) : 0;
      const audio = track && idleDeck(track, duration ? previous?.audio : undefined);
      active.current = null;
      if (!duration && previous) unload(previous.audio);
      if (audio && track) {
        const deck = active.current = { track, audio };
        if (!track.online) {
          connectFile(audio);
          loadStarted.current = performance.now();
          recordDiagnostic('audio.loading');
          prepareFile(audio, track, duration ? 'auto' : 'metadata');
        }
        gain(audio, duration ? 0 : 1);
        if (duration && previous) {
          // A slow or failed source must not keep playing the outgoing track
          // indefinitely. Ordinary loading continues after this brief grace period.
          fading.current = { outgoing: previous, incoming: deck, seconds: duration, timeout: window.setTimeout(endFade, 1700) };
        }
      } else if (previous) unload(previous.audio);
      setSnapshot({ ...stopped, loading: duration > 0, duration: track?.duration ?? 0 });
    }
    if (track && autoplay) void play();
  }, [canOverlap, cancelTransitions, connectFile, endFade, gain, idleDeck, play, prepareFile, transition]);

  const pause = useCallback(() => {
    playIntent.current++;
    pendingOnline.current = null;
    cancelTransitions();
    const deck = active.current;
    if (deck) deck.requested = false;
    if (deck?.track.online?.source === 'broadcast') {
      unload(deck.audio);
      setSnapshot(stopped);
    } else deck?.audio.pause();
    setSnapshot((previous) => previous.loading ? { ...previous, loading: false } : previous);
    void native.current?.set(false);
  }, [cancelTransitions]);
  const toggle = useCallback(() => {
    if (active.current?.audio.paused && !pendingOnline.current && !snapshot.loading) play();
    else pause();
  }, [play, pause, snapshot.loading]);
  const isPlaying = useCallback(() => {
    const audio = active.current?.audio;
    return Boolean(audio && !audio.paused && !audio.ended);
  }, []);
  const seek = useCallback((seconds: number, relative = false) => {
    const deck = active.current;
    if (!deck || !Number.isFinite(seconds) || deck.track.online?.source === 'broadcast') return;
    cancelTransitions();
    const duration = length(deck.audio, deck.track);
    if (duration <= 0) return;
    const time = clamp(relative ? deck.audio.currentTime + seconds : seconds, 0, duration);
    try { deck.audio.currentTime = time; } catch { return; }
    setSnapshot((previous) => ({ ...previous, elapsed: time }));
  }, [cancelTransitions]);
  const position = useCallback(() => active.current?.track.online?.source === 'broadcast' ? 0 : active.current?.audio.currentTime ?? 0, []);
  const readSpectrum = useCallback<ReadSpectrum>((buffer) => {
    const engine = graph.current;
    if (!active.current || active.current.track.online || active.current.audio.paused || !engine || engine.context.state !== 'running') return false;
    engine.analyser.getByteFrequencyData(buffer);
    return true;
  }, []);
  return { ...snapshot, floatStatus, sampleRate: graph.current?.context.sampleRate ?? EQ_REFERENCE_RATE, ref, blendRef, streamRef, streamBlendRef, load, play, pause, toggle, seek, isPlaying, position, readSpectrum, cancelTransitions };
}
