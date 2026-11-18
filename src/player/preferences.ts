import { clamp, defaultEqualizer, PRESETS } from '../shared/equalizer';
import type { EqualizerSettings } from '../shared/equalizer';
import type { QueueState } from '../shared/queue';

export interface Preferences {
  volume: number;
  lastVolume: number;
  showDemos: boolean;
  equalizer: EqualizerSettings;
  queue?: QueueState;
}

const KEY = 'luma-player:v1';
const defaults: Preferences = { volume: 0.75, lastVolume: 0.75, showDemos: true, equalizer: defaultEqualizer };
const validIds = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.every((id) => typeof id === 'string');
const numeric = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;

export function readPreferences(): Preferences {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Preferences> | null;
    if (!data || typeof data !== 'object') return defaults;
    const eq = data.equalizer;
    const queue = data.queue;
    const preset = eq?.preset ?? 'flat';
    return {
      volume: numeric(data.volume, defaults.volume, 0, 1),
      lastVolume: numeric(data.lastVolume, defaults.lastVolume, 0.01, 1),
      showDemos: data.showDemos !== false,
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

export function savePreferences(preferences: Preferences) {
  try { localStorage.setItem(KEY, JSON.stringify(preferences)); } catch { /* Private/embedded contexts can block storage. */ }
}
