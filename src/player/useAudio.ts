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
  const graph = useRef<AudioGraph | null>(null);
  const graphUnavailable = useRef(false);
  const active = useRef<Track | null>(null);
  const token = useRef(0);
  const loadStarted = useRef(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(stopped);
  const settings = useRef({ volume, eq });

  useEffect(() => {
    settings.current = { volume, eq };
    if (graph.current) graph.current.update(eq, volume);
    else if (ref.current) ref.current.volume = volume;
  }, [volume, eq]);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    const listeners: Record<string, EventListener> = {
      play: () => {
        recordDiagnostic('audio.play');
        setSnapshot((previous) => ({ ...previous, playing: true }));
      },
      playing: () => { if (active.current && !audio.paused) trackStarted(active.current.id); },
      pause: () => {
        recordDiagnostic('audio.pause');
        setSnapshot((previous) => ({ ...previous, playing: false }));
      },
      loadedmetadata: () => { if (active.current) recordDiagnostic('audio.ready', { ms: performance.now() - loadStarted.current }); },
      timeupdate: () => setSnapshot((previous) => ({ ...previous, elapsed: audio.currentTime })),
      durationchange: () => setSnapshot((previous) => ({
        ...previous, duration: Number.isFinite(audio.duration) ? audio.duration : active.current?.duration ?? 0,
      })),
      ended: () => {
        setSnapshot((previous) => ({ ...previous, playing: false }));
        ended.current();
      },
      error: () => {
        if (!active.current) return;
        recordDiagnostic('audio.error', { code: audio.error?.code ?? 0 });
        setSnapshot((previous) => ({ ...previous, playing: false, error: unavailable }));
      },
    };
    Object.entries(listeners).forEach(([event, callback]) => audio.addEventListener(event, callback));
    return () => {
      Object.entries(listeners).forEach(([event, callback]) => audio.removeEventListener(event, callback));
      audio.pause();
      if (graph.current) void graph.current.context.close().catch(() => undefined);
    };
  }, [ended, trackStarted]);

  const play = useCallback(() => {
    const audio = ref.current;
    if (!audio || !active.current) return;
    if (!graph.current && !graphUnavailable.current) {
      try {
        const engine = new AudioGraph(audio);
        engine.update(settings.current.eq, settings.current.volume, true);
        audio.volume = 1;
        graph.current = engine;
      } catch {
        // Playback is still available on platforms without a Web Audio graph.
        graphUnavailable.current = true;
        recordDiagnostic('audio.graphUnavailable');
      }
    }
    if (graph.current?.context.state === 'suspended') void graph.current.context.resume().catch(() => undefined);
    if (audio.error) audio.load();
    if (audio.ended) audio.currentTime = 0;
    setSnapshot((previous) => ({ ...previous, error: '' }));
    const version = token.current;
    void audio.play().catch((error: unknown) => {
      if (version !== token.current || (error instanceof DOMException && error.name === 'AbortError')) return;
      const autoplayBlocked = error instanceof DOMException && error.name === 'NotAllowedError';
      recordDiagnostic(autoplayBlocked ? 'audio.blocked' : 'audio.error', { code: audio.error?.code ?? 0 });
      setSnapshot((previous) => ({
        ...previous, playing: false, error: autoplayBlocked ? 'Нажмите «Воспроизвести», чтобы начать.' : unavailable,
      }));
    });
  }, []);

  const load = useCallback((track: Track | null, autoplay = false) => {
    const audio = ref.current;
    if (!audio) return;
    if (track?.id !== active.current?.id || track?.audioUrl !== active.current?.audioUrl) {
      token.current++;
      audio.pause();
      active.current = track;
      if (track) {
        loadStarted.current = performance.now();
        recordDiagnostic('audio.loading');
        audio.src = track.audioUrl;
      } else audio.removeAttribute('src');
      setSnapshot({ ...stopped, duration: track?.duration ?? 0 });
      audio.load();
    }
    if (track && autoplay) play();
  }, [play]);

  const pause = useCallback(() => ref.current?.pause(), []);
  const toggle = useCallback(() => {
    if (ref.current?.paused) play();
    else pause();
  }, [play, pause]);
  const isPlaying = useCallback(() => Boolean(ref.current && !ref.current.paused && !ref.current.ended), []);
  const seek = useCallback((seconds: number, relative = false) => {
    const audio = ref.current;
    if (!audio || !active.current || !Number.isFinite(seconds)) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : active.current.duration;
    if (duration <= 0) return;
    const time = clamp(relative ? audio.currentTime + seconds : seconds, 0, duration);
    audio.currentTime = time;
    setSnapshot((previous) => ({ ...previous, elapsed: time }));
  }, []);
  const position = useCallback(() => ref.current?.currentTime ?? 0, []);
  const readSpectrum = useCallback<ReadSpectrum>((buffer) => {
    const engine = graph.current;
    if (!engine || engine.context.state !== 'running') return false;
    engine.analyser.getByteFrequencyData(buffer);
    return true;
  }, []);
  return { ...snapshot, ref, load, play, pause, toggle, seek, isPlaying, position, readSpectrum };
}
