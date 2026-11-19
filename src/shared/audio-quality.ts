import type { UiLanguage } from './ui-language.js';
import type { Track } from './media.js';
import { cleanTrackText } from './russian.js';

export const STREAM_QUALITIES = {
  source: 'Как в каталоге', standard: 'MP3 VBR · высокое', economy: 'MP3 96 кбит/с · ~0.72 МБ/мин',
} as const;
export type StreamQuality = keyof typeof STREAM_QUALITIES;
export const NETWORK_MODES = { auto: 'Автоматически', normal: 'Wi-Fi / обычная сеть', metered: 'Сотовая / лимитная сеть' } as const;
export type NetworkMode = keyof typeof NETWORK_MODES;
export interface AudioQuality { normal: StreamQuality; metered: StreamQuality; network: NetworkMode }
export const defaultAudioQuality: AudioQuality = { normal: 'source', metered: 'economy', network: 'auto' };

function choice<const T extends string>(value: unknown, options: Record<T, string>, fallback: T): T {
  return typeof value === 'string' && Object.hasOwn(options, value) ? value as T : fallback;
}

export function readAudioQuality(value: unknown): AudioQuality {
  const row = value as Partial<AudioQuality> | null;
  return {
    normal: choice(row?.normal, STREAM_QUALITIES, defaultAudioQuality.normal),
    metered: choice(row?.metered, STREAM_QUALITIES, defaultAudioQuality.metered),
    network: choice(row?.network, NETWORK_MODES, defaultAudioQuality.network),
  };
}

// Chromium on desktop may expose neither type nor saveData. EffectiveType is bandwidth, not a metering signal.
export function isMetered(mode: NetworkMode, connection?: { saveData?: boolean; type?: string }) {
  return mode === 'metered' || (mode === 'auto' && (connection?.saveData === true || connection?.type === 'cellular'));
}

/** Apply Jamendo's two documented MP3 stream variants, never a download URL or a synthetic bitrate. */
export function streamUrl(track: Track, quality: StreamQuality) {
  if (track.online?.source !== 'jamendo' || quality === 'source') return track.audioUrl;
  const url = new URL(track.audioUrl);
  url.searchParams.set('format', quality === 'economy' ? 'mp31' : 'mp32');
  return url.href;
}

export interface AudioFormat { codec?: string; bitrate?: number; sampleRate?: number; bitsPerSample?: number }

export function readAudioFormat(value: unknown): AudioFormat | undefined {
  const row = value as Partial<AudioFormat> | null;
  const codec = cleanTrackText(row?.codec).slice(0, 48);
  const readPositive = (value: unknown, max: number) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max ? Math.round(value) : undefined;
  const bitrate = readPositive(row?.bitrate, 50e6);
  const sampleRate = readPositive(row?.sampleRate, 768_000);
  const bitsPerSample = readPositive(row?.bitsPerSample, 64);
  if (codec || bitrate || sampleRate || bitsPerSample) return { codec: codec || undefined, bitrate, sampleRate, bitsPerSample };
}

export function describeAudioFormat(format: AudioFormat | undefined, locale: string, language: UiLanguage = 'ru') {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false });
  return [format?.codec, format?.bitrate && `${number.format(format.bitrate / 1000)} ${language === 'en' ? 'kbps' : 'кбит/с'}`,
    format?.sampleRate && `${number.format(format.sampleRate / 1000)} ${language === 'en' ? 'kHz' : 'кГц'}`, format?.bitsPerSample && `${format.bitsPerSample} ${language === 'en' ? 'bit' : 'бит'}`].filter(Boolean).join(' · ');
}

export function describeStream(track: Track, url: string, language: UiLanguage = 'ru') {
  if (language === 'en') return track.online?.source === 'jamendo' ? new URL(url).searchParams.get('format') === 'mp31'
    ? 'MP3 96 kbps · ~0.72 MB/min' : 'MP3 VBR · variable bitrate'
    : `${new URL(url).pathname.split('.').pop()?.toUpperCase() ?? 'Original'} · source bitrate`;
  if (track.online?.source === 'jamendo') return new URL(url).searchParams.get('format') === 'mp31' ? STREAM_QUALITIES.economy : 'MP3 VBR · битрейт переменный';
  return `${new URL(url).pathname.split('.').pop()?.toUpperCase() ?? 'Оригинал'} · битрейт источника`;
}
