import { clamp, defaultEqualizer, PRESETS } from '../shared/equalizer';
import type { EqualizerSettings } from '../shared/equalizer';
import type { QueueState } from '../shared/queue';
import { defaultAppearance, defaultPlayback, readAppearance, readPlayback } from '../shared/customization';
import type { Appearance, PlaybackPreferences } from '../shared/customization';

export interface Preferences {
  volume: number;
  lastVolume: number;
  showDemos: boolean;
  equalizer: EqualizerSettings;
  appearance: Appearance;
  playback: PlaybackPreferences;
  queue?: QueueState;
  favorites: string[];
  recent: string[];
}

const KEY = 'luma-player:v1';
export const RECENT_LIMIT = 60;
const defaults: Preferences = { volume: 0.75, lastVolume: 0.75, showDemos: true, equalizer: defaultEqualizer, appearance: defaultAppearance, playback: defaultPlayback, favorites: [], recent: [] };
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
    const queue = data.queue;
    const preset = eq?.preset ?? 'flat';
    return {
      volume: numeric(data.volume, defaults.volume, 0, 1),
      lastVolume: numeric(data.lastVolume, defaults.lastVolume, 0.01, 1),
      showDemos: data.showDemos !== false,
      appearance: readAppearance(data.appearance),
      favorites: readFavorites(data.favorites),
      recent: readFavorites(data.recent).slice(0, RECENT_LIMIT),
      playback: readPlayback(data.playback),
      equalizer: {
        enabled: eq?.enabled === true,
        preset: preset === 'custom' || Object.hasOwn(PRESETS, preset) ? preset : 'flat',
        preamp: numeric(eq?.preamp, 0, -12, 12),
        gains: Array.from({ length: 5 }, (_, index) => numeric(eq?.gains?.[index], 0, -12, 12)),
      },
      queue: queue && validIds(queue.order) ? {
        order: queue.order,
        currentId: typeof queue.currentId === 'string' ? queue.currentId : null,
        beforeShuffle: validIds(queue.beforeShuffle) ? queue.beforeShuffle : null,
        repeat: queue.repeat === 'all' || queue.repeat === 'one' ? queue.repeat : 'off',
      } : undefined,
    };
  } catch { return defaults; }
}

export function readPreferences(): Preferences {
  try { return decodePreferences(localStorage.getItem(KEY)); } catch { return defaults; }
}

export function savePreferences(preferences: Preferences) {
  try { localStorage.setItem(KEY, JSON.stringify(preferences)); } catch { /* Private/embedded contexts can block storage. */ }
}
