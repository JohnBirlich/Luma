import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { BANDS, clamp } from '../shared/equalizer';
import type { EqualizerSettings } from '../shared/equalizer';
import type { Track } from '../shared/media';
import { recordDiagnostic } from '../data/diagnostics';

export type ReadSpectrum = (buffer: Uint8Array<ArrayBuffer>) => boolean;

interface Snapshot {
  playing: boolean;
  elapsed: number;
  duration: number;
  error: string;
}
const stopped: Snapshot = { playing: false, elapsed: 0, duration: 0, error: '' };
const linear = (db: number) => 10 ** (db / 20);

class AudioGraph {
  readonly context: AudioContext;
  readonly analyser: AnalyserNode;
  private preamp: GainNode;
  private master: GainNode;
  private filters: BiquadFilterNode[];

  constructor(audio: HTMLAudioElement) {
    this.context = new AudioContext();
    const source = this.context.createMediaElementSource(audio);
    this.preamp = this.context.createGain();
    this.master = this.context.createGain();
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.78;
    this.filters = BANDS.map(({ hz, type }) => {
      const filter = this.context.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = hz;
      filter.Q.value = 0.9;
      return filter;
    });
    const chain: AudioNode[] = [source, this.preamp, ...this.filters, this.analyser, this.master, this.context.destination];
    chain.slice(1).forEach((node, index) => chain[index].connect(node));
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

export function useAudio(volume: number, eq: EqualizerSettings, ended: RefObject<() => void>, trackStarted: (id: string) => void) {
  const ref = useRef<HTMLAudioElement>(null);
  const streamRef = useRef<HTMLAudioElement>(null);
  const graph = useRef<AudioGraph | null>(null);
  const graphUnavailable = useRef(false);
  const active = useRef<Track | null>(null);
  const token = useRef(0);
  const loadStarted = useRef(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(stopped);
  const settings = useRef({ volume, eq });
  const output = useCallback(() => active.current?.online ? streamRef.current : ref.current, []);
  const errorText = useCallback(() => active.current?.online
    ? 'Источник не воспроизводит этот трек. Проверьте сеть или откройте страницу записи.' : unavailable, []);

  useEffect(() => {
    settings.current = { volume, eq };
    if (graph.current) graph.current.update(eq, volume);
    else if (ref.current) ref.current.volume = volume;
    if (streamRef.current) streamRef.current.volume = volume;
  }, [volume, eq]);

  useEffect(() => {
    const cleanups = [ref.current, streamRef.current].flatMap((audio) => {
      if (!audio) return [];
      const listeners: Record<string, EventListener> = {
        play: () => {
          if (audio.paused) return;
          recordDiagnostic('audio.play');
          setSnapshot((previous) => ({ ...previous, playing: true }));
        },
        playing: () => { if (active.current && !audio.paused) trackStarted(active.current.id); },
        pause: () => {
          if (!audio.paused) return;
          recordDiagnostic('audio.pause');
          setSnapshot((previous) => ({ ...previous, playing: false }));
        },
        loadedmetadata: () => recordDiagnostic('audio.ready', { ms: performance.now() - loadStarted.current }),
        timeupdate: () => setSnapshot((previous) => ({ ...previous, elapsed: audio.currentTime })),
        durationchange: () => setSnapshot((previous) => ({
          ...previous, duration: Number.isFinite(audio.duration) ? audio.duration : active.current?.duration ?? 0,
        })),
        ended: () => {
          setSnapshot((previous) => ({ ...previous, playing: false }));
          ended.current();
        },
        error: () => {
          if (!audio.error) return;
          recordDiagnostic('audio.error', { code: audio.error.code });
          setSnapshot((previous) => ({ ...previous, playing: false, error: errorText() }));
        },
      };
      const bindings = Object.entries(listeners).map(([event, callback]) => {
        const guarded: EventListener = (value) => { if (active.current && output() === audio) callback(value); };
        audio.addEventListener(event, guarded);
        return () => audio.removeEventListener(event, guarded);
      });
      return [() => { bindings.forEach((unbind) => unbind()); audio.pause(); }];
    });
    return () => {
      cleanups.forEach((cleanup) => cleanup());
      if (graph.current) void graph.current.context.close().catch(() => undefined);
    };
  }, [ended, errorText, output, trackStarted]);

  const play = useCallback(() => {
    const audio = output();
    const track = active.current;
    if (!audio || !track) return;
    if (track.online && !audio.getAttribute('src')) {
      if (!navigator.onLine) {
        setSnapshot((previous) => ({ ...previous, playing: false, error: 'Устройство вне сети. Для онлайн-треков нужно подключение.' }));
        return;
      }
      loadStarted.current = performance.now();
      recordDiagnostic('audio.loading');
      // Start the external request only in response to actual playback, not a restored queue.
      audio.src = track.audioUrl;
    }
    if (!track.online) {
      if (!graph.current && !graphUnavailable.current) {
        try {
          const engine = new AudioGraph(audio);
          engine.update(settings.current.eq, settings.current.volume, true);
          audio.volume = 1;
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
      if (version !== token.current || audio.paused || audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      recordDiagnostic('audio.error', { code: 0 });
      setSnapshot({ ...stopped, duration: track.duration, error: 'Источник не ответил вовремя. Повторите попытку или откройте страницу записи.' });
    }, 15_000) : undefined;
    void audio.play().catch((error: unknown) => {
      if (version !== token.current || (error instanceof DOMException && error.name === 'AbortError')) return;
      const autoplayBlocked = error instanceof DOMException && error.name === 'NotAllowedError';
      recordDiagnostic(autoplayBlocked ? 'audio.blocked' : 'audio.error', { code: audio.error?.code ?? 0 });
      setSnapshot((previous) => ({
        ...previous, playing: false, error: autoplayBlocked ? 'Нажмите «Воспроизвести», чтобы начать.' : errorText(),
      }));
    }).finally(() => window.clearTimeout(deadline));
  }, [errorText, output]);

  const load = useCallback((track: Track | null, autoplay = false) => {
    if (track?.id !== active.current?.id || track?.audioUrl !== active.current?.audioUrl) {
      token.current++;
      const previous = output();
      previous?.pause();
      if (previous === streamRef.current && previous?.getAttribute('src')) {
        previous.removeAttribute('src');
        previous.load();
      }
      active.current = track;
      const audio = output();
      if (audio && !track?.online) {
        if (track) {
          loadStarted.current = performance.now();
          recordDiagnostic('audio.loading');
          audio.src = track.audioUrl;
        } else audio.removeAttribute('src');
        audio.load();
      }
      setSnapshot({ ...stopped, duration: track?.duration ?? 0 });
    }
    if (track && autoplay) play();
  }, [output, play]);

  const pause = useCallback(() => output()?.pause(), [output]);
  const toggle = useCallback(() => {
    if (output()?.paused) play();
    else pause();
  }, [output, play, pause]);
  const isPlaying = useCallback(() => {
    const audio = output();
    return Boolean(audio && !audio.paused && !audio.ended);
  }, [output]);
  const seek = useCallback((seconds: number, relative = false) => {
    const audio = output();
    if (!audio || !active.current || !Number.isFinite(seconds)) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : active.current.duration;
    if (duration <= 0) return;
    const time = clamp(relative ? audio.currentTime + seconds : seconds, 0, duration);
    audio.currentTime = time;
    setSnapshot((previous) => ({ ...previous, elapsed: time }));
  }, [output]);
  const position = useCallback(() => output()?.currentTime ?? 0, [output]);
  const readSpectrum = useCallback<ReadSpectrum>((buffer) => {
    const engine = graph.current;
    if (active.current?.online || !engine || engine.context.state !== 'running') return false;
    engine.analyser.getByteFrequencyData(buffer);
    return true;
  }, []);
  return { ...snapshot, ref, streamRef, load, play, pause, toggle, seek, isPlaying, position, readSpectrum };
}
