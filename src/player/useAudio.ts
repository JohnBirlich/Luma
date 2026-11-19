import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { BANDS, clamp } from '../shared/equalizer';
import type { EqualizerSettings } from '../shared/equalizer';
import { isMetered, streamUrl } from '../shared/audio-quality';
import type { AudioQuality } from '../shared/audio-quality';
import { FloatSink } from './float-sink';
import type { FloatStatus } from '../shared/float-output';
import { ListeningClock } from '../shared/lastfm';
import type { Track } from '../shared/media';
import { recordDiagnostic } from '../data/diagnostics';

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
interface Deck { audio: HTMLAudioElement; track: Track; listening?: ListeningClock }
function markListening(deck: Deck) {
  if (!window.luma?.lastfm || deck.audio.paused || deck.listening) return;
  deck.listening = ListeningClock.start(deck.track, Math.floor(Date.now() / 1000));
  if (deck.listening) {
    const duration = length(deck.audio, deck.track);
    window.luma.lastfm.record(deck.listening.now(duration));
    deck.listening.sample(deck.audio.currentTime, performance.now() / 1000, duration, deck.audio.playbackRate);
  }
}
const stopped: Snapshot = { playing: false, elapsed: 0, duration: 0, error: '' };
const linear = (db: number) => 10 ** (db / 20);

class AudioGraph {
  readonly context = new AudioContext();
  readonly analyser = this.context.createAnalyser();
  private preamp = this.context.createGain();
  readonly master = this.context.createGain();
  private decks = new Map<HTMLAudioElement, GainNode>();
  private filters = BANDS.map(({ hz, type }) => {
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    filter.Q.value = 0.9;
    return filter;
  });

  constructor(audio: HTMLAudioElement) {
    this.analyser.fftSize = 1024;
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
    set(this.preamp.gain, settings.enabled ? linear(settings.preamp) : 1);
    this.filters.forEach((filter, index) => set(filter.gain, settings.enabled ? settings.gains[index] : 0));
  }
}

const unavailable = 'Не удалось воспроизвести трек. Проверьте, не перемещён ли файл и поддерживается ли его формат.';
const length = (audio: HTMLAudioElement, track: Track) => Number.isFinite(audio.duration) ? audio.duration : track.duration;
function unload(audio: HTMLAudioElement) {
  audio.pause();
  if (audio.getAttribute('src')) { audio.removeAttribute('src'); audio.load(); }
}

export function useAudio(volume: number, eq: EqualizerSettings, quality: AudioQuality, nativeFloat: boolean, ended: RefObject<() => void>, trackStarted: (id: string) => void, transition: RefObject<Transition>) {
  const ref = useRef<HTMLAudioElement>(null);
  const blendRef = useRef<HTMLAudioElement>(null);
  const streamRef = useRef<HTMLAudioElement>(null);
  const graph = useRef<AudioGraph | null>(null);
  const graphUnavailable = useRef(false);
  const blendUnavailable = useRef(false);
  const active = useRef<Deck | null>(null);
  const candidate = useRef<(Deck & { starting: boolean }) | null>(null);
  const fading = useRef<{ audio: HTMLAudioElement; timeout: number } | null>(null);
  const token = useRef(0);
  const playIntent = useRef(0);
  const pendingOnline = useRef<Deck | null>(null);
  const loadStarted = useRef(0);
  const native = useRef<FloatSink | undefined>(undefined);
  const [floatStatus, setFloatStatus] = useState<FloatStatus>('system');
  const [snapshot, setSnapshot] = useState<Snapshot>(stopped);
  const settings = useRef({ volume, eq, quality });
  const errorText = useCallback(() => active.current?.track.online
    ? 'Источник не воспроизводит этот трек. Проверьте сеть или откройте страницу записи.' : unavailable, []);

  useEffect(() => {
    settings.current = { volume, eq, quality };
    if (graph.current) graph.current.update(eq, volume);
    else if (ref.current) ref.current.volume = volume;
    if (streamRef.current) streamRef.current.volume = volume;
  }, [volume, eq, quality]);

  useEffect(() => {
    const mixer = graph.current;
    const bridge = window.luma?.floatOutput;
    if (nativeFloat && snapshot.playing && active.current && !active.current.track.online && mixer && bridge) {
      native.current ??= new FloatSink(mixer.context, mixer.master, bridge, setFloatStatus);
      void native.current.set(true);
    } else if (native.current) void native.current.set(false);
  }, [nativeFloat, snapshot.playing, snapshot.stream?.id]);

  const cancelWarmup = useCallback(() => {
    const incoming = candidate.current;
    candidate.current = null;
    if (incoming) { unload(incoming.audio); graph.current?.gain(incoming.audio, 1); }
  }, []);
  const endFade = useCallback(() => {
    const outgoing = fading.current;
    fading.current = null;
    if (outgoing) {
      window.clearTimeout(outgoing.timeout);
      unload(outgoing.audio);
      graph.current?.gain(outgoing.audio, 1);
      if (active.current) graph.current?.gain(active.current.audio, 1);
    }
  }, []);
  const cancelTransitions = useCallback(() => { cancelWarmup(); endFade(); }, [cancelWarmup, endFade]);

  const advanceSmoothly = useCallback((deck: Deck) => {
    const { audio, track } = deck;
    const mixer = graph.current;
    const policy = transition.current;
    const outgoingDuration = length(audio, track);
    const remaining = outgoingDuration - audio.currentTime;
    if (!policy.seconds || track.online || fading.current || blendUnavailable.current || mixer?.context.state !== 'running'
      || audio.paused || audio.seeking || audio.playbackRate !== 1 || !Number.isFinite(remaining) || remaining < .22 || remaining > policy.seconds + 1.6) {
      cancelWarmup(); return;
    }
    const target = policy.next(track);
    const overlap = target ? Math.min(policy.seconds, outgoingDuration / 4, target.duration / 4) : 0;
    if (!target || target.online || target.id === track.id || !Number.isFinite(overlap) || overlap < 0.35 || remaining > overlap + 1.6) {
      cancelWarmup(); return;
    }
    let incoming = candidate.current;
    if (!incoming || incoming.track.id !== target.id || incoming.track.audioUrl !== target.audioUrl) {
      cancelWarmup();
      const idle = audio === ref.current ? blendRef.current : ref.current;
      if (!idle) return;
      try { mixer.connect(idle); } catch { blendUnavailable.current = true; return; }
      mixer.gain(idle, 0);
      incoming = { audio: idle, track: target, starting: false };
      candidate.current = incoming;
      idle.src = target.audioUrl;
      idle.preload = 'auto';
      idle.load();
    }
    if (incoming.starting || remaining > overlap || incoming.audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
    incoming.starting = true;
    const warm = incoming;
    void warm.audio.play().then(() => {
      if (candidate.current !== warm) return;
      const lastSeconds = outgoingDuration - audio.currentTime;
      const latest = transition.current;
      const wanted = latest.next(track);
      const duration = Math.min(lastSeconds, overlap, latest.seconds, length(warm.audio, warm.track) / 4);
      if (active.current !== deck || audio.paused || audio.seeking || warm.audio.paused || duration < .2
        || wanted?.id !== warm.track.id || wanted.audioUrl !== warm.track.audioUrl) { cancelWarmup(); return; }
      candidate.current = null;
      token.current++;
      active.current = warm;
      mixer.gain(audio, 1, 0, duration);
      mixer.gain(warm.audio, 0, 1, duration);
      fading.current = { audio, timeout: window.setTimeout(endFade, Math.ceil(duration * 1000) + 30) };
      setSnapshot({ ...stopped, playing: true, elapsed: warm.audio.currentTime, duration: length(warm.audio, warm.track) });
      latest.advance(warm.track.id);
      recordDiagnostic('audio.play');
      trackStarted(warm.track.id);
      markListening(warm);
    }).catch(() => { if (candidate.current === warm) cancelWarmup(); });
  }, [cancelWarmup, endFade, trackStarted, transition]);

  useEffect(() => {
    const cleanups = [ref.current, blendRef.current, streamRef.current].flatMap((audio) => {
      if (!audio) return [];
      const listeners: Record<string, (deck: Deck) => void> = {
        play: () => {
          if (audio.paused) return;
          recordDiagnostic('audio.play');
          setSnapshot((previous) => ({ ...previous, playing: true, loading: false }));
        },
        playing: (deck) => { if (!audio.paused) { trackStarted(deck.track.id); markListening(deck); } },
        seeking: (deck) => deck.listening?.interrupt(),
        waiting: (deck) => deck.listening?.interrupt(),
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
          setSnapshot((previous) => ({ ...previous, elapsed: audio.currentTime }));
          if (!audio.paused && !audio.seeking && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const event = deck.listening?.sample(audio.currentTime, performance.now() / 1000, length(audio, deck.track), audio.playbackRate);
            if (event) window.luma?.lastfm?.record(event);
          }
          advanceSmoothly(deck);
        },
        durationchange: ({ track }) => setSnapshot((previous) => ({ ...previous, duration: length(audio, track) })),
        ended: (deck) => {
          deck.listening = undefined;
          cancelTransitions();
          setSnapshot((previous) => ({ ...previous, playing: false, loading: false }));
          ended.current();
        },
        error: () => {
          if (!audio.error) return;
          cancelTransitions();
          recordDiagnostic('audio.error', { code: audio.error.code });
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
  }, [advanceSmoothly, cancelTransitions, ended, errorText, trackStarted]);

  const play = useCallback(async () => {
    const intent = ++playIntent.current;
    const deck = active.current;
    if (!deck) return;
    const { audio, track } = deck;
    if (track.online) {
      const hasSource = !!audio.getAttribute('src') && !audio.error;
      const retryOffline = hasSource && audio.paused && !navigator.onLine && !audio.src.startsWith('luma:');
      pendingOnline.current = deck;
      if (audio.paused) setSnapshot((previous) => ({ ...previous, loading: true, error: '' }));
      try {
        if (native.current) await native.current.set(false);
        if (intent !== playIntent.current || active.current !== deck) return;
        if (!hasSource || retryOffline) {
          const cached = track.online.source === 'wikimedia_audio' && window.luma?.streamCache
            ? await window.luma.streamCache.url(track).catch(() => null) : null;
          if (intent !== playIntent.current || active.current !== deck) return;
          if (!cached && !navigator.onLine && !hasSource) {
            setSnapshot((previous) => ({ ...previous, playing: false, loading: false, error: 'Устройство вне сети. Для онлайн-треков нужно подключение.' }));
            return;
          }
          if (cached || !hasSource) {
            loadStarted.current = performance.now();
            recordDiagnostic('audio.loading');
            // A restored queue never fetches audio until the user starts playing.
            const q = settings.current.quality;
            const connection = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
            const url = streamUrl(track, isMetered(q.network, connection) ? q.metered : q.normal);
            audio.src = cached ?? url;
            setSnapshot((previous) => ({ ...previous, stream: { id: track.id, url, cached: !!cached } }));
          }
        }
      } finally {
        if (intent === playIntent.current && pendingOnline.current === deck) pendingOnline.current = null;
      }
    }
    if (!track.online) {
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
      if (graph.current?.context.state === 'suspended') void graph.current.context.resume().catch(() => undefined);
    }
    if (audio.error) audio.load();
    if (audio.ended) audio.currentTime = 0;
    setSnapshot((previous) => ({ ...previous, error: '' }));
    const version = token.current;
    const deadline = track.online ? window.setTimeout(() => {
      if (intent !== playIntent.current || version !== token.current || audio.paused || audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
      unload(audio);
      recordDiagnostic('audio.error', { code: 0 });
      setSnapshot({ ...stopped, duration: track.duration, error: 'Источник не ответил вовремя. Повторите попытку или откройте страницу записи.' });
    }, 15_000) : undefined;
    void audio.play().catch((error: unknown) => {
      if (intent !== playIntent.current || version !== token.current || (error instanceof DOMException && error.name === 'AbortError')) return;
      const autoplayBlocked = error instanceof DOMException && error.name === 'NotAllowedError';
      recordDiagnostic(autoplayBlocked ? 'audio.blocked' : 'audio.error', { code: audio.error?.code ?? 0 });
      setSnapshot((previous) => ({
        ...previous, playing: false, loading: false, error: autoplayBlocked ? 'Нажмите «Воспроизвести», чтобы начать.' : errorText(),
      }));
    }).finally(() => window.clearTimeout(deadline));
  }, [errorText]);

  const load = useCallback((track: Track | null, autoplay = false) => {
    const previous = active.current;
    if (track?.id !== previous?.track.id || track?.audioUrl !== previous?.track.audioUrl) {
      token.current++;
      playIntent.current++;
      pendingOnline.current = null;
      cancelTransitions();
      active.current = null;
      if (previous) unload(previous.audio);
      const audio = track?.online ? streamRef.current : ref.current;
      if (audio && track) {
        active.current = { track, audio };
        if (!track.online) {
          loadStarted.current = performance.now();
          recordDiagnostic('audio.loading');
          audio.preload = 'metadata';
          audio.src = track.audioUrl;
          audio.load();
        }
      }
      setSnapshot({ ...stopped, duration: track?.duration ?? 0 });
    }
    if (track && autoplay) play();
  }, [cancelTransitions, play]);

  const pause = useCallback(() => {
    playIntent.current++;
    pendingOnline.current = null;
    cancelTransitions();
    active.current?.audio.pause();
    setSnapshot((previous) => previous.loading ? { ...previous, loading: false } : previous);
    void native.current?.set(false);
  }, [cancelTransitions]);
  const toggle = useCallback(() => {
    if (active.current?.audio.paused && !pendingOnline.current) play();
    else pause();
  }, [play, pause]);
  const isPlaying = useCallback(() => {
    const audio = active.current?.audio;
    return Boolean(audio && !audio.paused && !audio.ended);
  }, []);
  const seek = useCallback((seconds: number, relative = false) => {
    const deck = active.current;
    if (!deck || !Number.isFinite(seconds)) return;
    cancelTransitions();
    const duration = length(deck.audio, deck.track);
    if (duration <= 0) return;
    const time = clamp(relative ? deck.audio.currentTime + seconds : seconds, 0, duration);
    deck.audio.currentTime = time;
    setSnapshot((previous) => ({ ...previous, elapsed: time }));
  }, [cancelTransitions]);
  const position = useCallback(() => active.current?.audio.currentTime ?? 0, []);
  const readSpectrum = useCallback<ReadSpectrum>((buffer) => {
    const engine = graph.current;
    if (active.current?.track.online || !engine || engine.context.state !== 'running') return false;
    engine.analyser.getByteFrequencyData(buffer);
    return true;
  }, []);
  return { ...snapshot, floatStatus, ref, blendRef, streamRef, load, play, pause, toggle, seek, isPlaying, position, readSpectrum, cancelTransitions };
}
