import { readOnlineShelf } from '../shared/online';
import type { OnlineTrack } from '../shared/online';
import { clamp, defaultEqualizer, PRESETS } from '../shared/equalizer';
import type { EqualizerSettings } from '../shared/equalizer';
import type { QueueState, Repeat } from '../shared/queue';
import { defaultAppearance, defaultPlayback, readAppearance, readPlayback } from '../shared/customization';
import type { Appearance, PlaybackPreferences } from '../shared/customization';

import { defaultAudioQuality, readAudioQuality } from '../shared/audio-quality';
import type { AudioQuality } from '../shared/audio-quality';

export interface Preferences {
  volume: number;
  lastVolume: number;
  showDemos: boolean;
  equalizer: EqualizerSettings;
  appearance: Appearance;
  playback: PlaybackPreferences;
  audioQuality: AudioQuality;
  autoLyrics: boolean;
  exportLyrics: boolean;
  queue?: QueueState;
  resumeRepeat: Repeat;
  resumeShuffle: boolean;
  favorites: string[];
  disliked: string[];
  recent: string[];
  onlineTracks: OnlineTrack[];
  onlineRefs: OnlineTrack[];
}

const KEY = 'luma-player:v1';
export const RECENT_LIMIT = 60;
const defaults: Preferences = {
  volume: 0.75, lastVolume: 0.75, showDemos: true, equalizer: defaultEqualizer, appearance: defaultAppearance,
  playback: defaultPlayback, audioQuality: defaultAudioQuality, autoLyrics: false, exportLyrics: false,
  resumeRepeat: 'off', resumeShuffle: false, favorites: [], disliked: [], recent: [], onlineTracks: [], onlineRefs: [],
};
const readRepeat = (value: unknown): Repeat => value === 'all' || value === 'one' ? value : 'off';
const validIds = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.every((id) => typeof id === 'string');
export function readFavorites(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128))] : [];
}
export function rememberTrack(ids: string[], id: string): string[] {
  return ids[0] === id ? ids : [id, ...ids.filter((item) => item !== id)].slice(0, RECENT_LIMIT);
}
const numeric = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;

export function decodePreferences(value: string | null): Preferences {
  try {
    const data = JSON.parse(value ?? 'null') as Partial<Preferences> | null;
    if (!data || typeof data !== 'object') return defaults;
    const eq = data.equalizer;
    const disliked = readFavorites(data.disliked);
    const excluded = new Set(disliked);
    const queue = data.queue;
    const playback = readPlayback(data.playback);
    const resumeRepeat = playback.rememberRepeat ? readRepeat(data.resumeRepeat ?? queue?.repeat) : 'off';
    const beforeShuffle = validIds(queue?.beforeShuffle) ? queue.beforeShuffle : null;
    const resumeShuffle = playback.rememberShuffle && (data.resumeShuffle ?? Boolean(beforeShuffle)) === true;
    const preset = eq?.preset ?? 'flat';
    return {
      volume: numeric(data.volume, defaults.volume, 0, 1),
      lastVolume: numeric(data.lastVolume, defaults.lastVolume, 0.01, 1),
      showDemos: data.showDemos !== false,
      appearance: readAppearance(data.appearance),
      favorites: readFavorites(data.favorites).filter((id) => !excluded.has(id)), disliked,
      recent: readFavorites(data.recent).slice(0, RECENT_LIMIT),
      onlineTracks: readOnlineShelf(data.onlineTracks),
      onlineRefs: readOnlineShelf(data.onlineRefs),
      playback,
      audioQuality: readAudioQuality(data.audioQuality),
      autoLyrics: data.autoLyrics === true,
      exportLyrics: data.exportLyrics === true,
      resumeRepeat, resumeShuffle,
      equalizer: {
        enabled: eq?.enabled === true,
        preset: preset === 'custom' || Object.hasOwn(PRESETS, preset) ? preset : 'flat',
        preamp: numeric(eq?.preamp, 0, -12, 12),
        gains: Array.from({ length: 5 }, (_, index) => numeric(eq?.gains?.[index], 0, -12, 12)),
      },
      queue: playback.rememberQueue && queue && validIds(queue.order) ? {
        order: !resumeShuffle && beforeShuffle ? beforeShuffle : queue.order,
        currentId: typeof queue.currentId === 'string' ? queue.currentId : null,
        beforeShuffle: resumeShuffle ? beforeShuffle : null,
        repeat: resumeRepeat,
      } : undefined,
    };
  } catch { return defaults; }
}

export function readPreferences(): Preferences {
  try { return decodePreferences(localStorage.getItem(KEY)); } catch { return defaults; }
}

export function activeOnlineRefs({ onlineTracks, onlineRefs, recent, favorites, queue }: Preferences) {
  const keep = new Set([...recent, ...favorites, ...(queue?.order ?? [])]);
  const saved = new Set(onlineTracks.map(({ id }) => id));
  return onlineRefs.filter(({ id }) => keep.has(id) && !saved.has(id));
}

export function encodePreferences(preferences: Preferences, current: QueueState) {
  const { rememberQueue, rememberShuffle, rememberRepeat } = preferences.playback;
  const resumeRepeat = rememberRepeat ? current.repeat : 'off';
  const resumeShuffle = rememberShuffle && current.beforeShuffle !== null;
  const queue = rememberQueue ? {
    order: resumeShuffle ? current.order : current.beforeShuffle ?? current.order,
    currentId: current.currentId, beforeShuffle: resumeShuffle ? current.beforeShuffle : null, repeat: resumeRepeat,
  } : undefined;
  const stored = { ...preferences, resumeRepeat, resumeShuffle, queue };
  return JSON.stringify({ ...stored, onlineRefs: activeOnlineRefs(stored) });
}

export function savePreferences(preferences: Preferences, queue: QueueState) {
  try { localStorage.setItem(KEY, encodePreferences(preferences, queue)); }
  catch { /* Private/embedded contexts can block storage. */ }
}
