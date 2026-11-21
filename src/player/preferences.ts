import { readStationIds, STATION_IDS } from '../shared/radio';
import { readLumaPlaylists } from '../shared/luma-playlists';
import type { LumaPlaylist } from '../shared/luma-playlists';
import { readUiLanguage } from '../shared/ui-language';
import type { UiLanguage } from '../shared/ui-language';
import { readOnlineShelf } from '../shared/online';
import type { OnlineTrack } from '../shared/online';
import { clamp, defaultEqualizer, readEqualizer } from '../shared/equalizer';
import type { EqualizerSettings } from '../shared/equalizer';
import type { QueueState, Repeat } from '../shared/queue';
import { defaultAppearance, defaultPlayback, readAppearance, readPlayback } from '../shared/customization';
import type { Appearance, PlaybackPreferences } from '../shared/customization';
import { defaultKaraokeStyle, readKaraokeStyle } from '../shared/karaoke-style';
import type { KaraokeStyle } from '../shared/karaoke-style';

import { defaultAudioQuality, readAudioQuality } from '../shared/audio-quality';
import type { AudioQuality } from '../shared/audio-quality';

export interface Preferences {
  volume: number;
  lastVolume: number;
  showDemos: boolean;
  uiLanguage: UiLanguage;
  nativeFloat: boolean;
  equalizer: EqualizerSettings;
  appearance: Appearance;
  playback: PlaybackPreferences;
  audioQuality: AudioQuality;
  autoLyrics: boolean;
  karaokeStyle: KaraokeStyle;
  autoCatalogSearch: boolean;
  exportLyrics: boolean;
  queue?: QueueState;
  resumeRepeat: Repeat;
  resumeShuffle: boolean;
  favorites: string[];
  disliked: string[];
  recent: string[];
  stationIds: string[];
  playlists: LumaPlaylist[];
  onlineTracks: OnlineTrack[];
  onlineRefs: OnlineTrack[];
}

const KEY = 'luma-player:v1';
export const RECENT_LIMIT = 60;
const defaults: Preferences = {
  volume: 0.75, lastVolume: 0.75, showDemos: true, uiLanguage: 'ru', nativeFloat: false, equalizer: defaultEqualizer, appearance: defaultAppearance,
  playback: defaultPlayback, audioQuality: defaultAudioQuality, autoLyrics: false, karaokeStyle: defaultKaraokeStyle, autoCatalogSearch: true, exportLyrics: false,
  resumeRepeat: 'off', resumeShuffle: false, favorites: [], disliked: [], recent: [], stationIds: [], playlists: [], onlineTracks: [], onlineRefs: [],
};
const readRepeat = (value: unknown): Repeat => value === 'all' || value === 'one' ? value : 'off';
const validIds = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.every((id) => typeof id === 'string');
export function readFavorites(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128 && !STATION_IDS.has(id)))] : [];
}
export function rememberTrack(ids: string[], id: string): string[] {
  return ids[0] === id || STATION_IDS.has(id) ? ids : [id, ...ids.filter((item) => item !== id)].slice(0, RECENT_LIMIT);
}
const numeric = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;

export function decodePreferences(value: string | null): Preferences {
  try {
    const data = JSON.parse(value ?? 'null') as Partial<Preferences> | null;
    if (!data || typeof data !== 'object') return defaults;
    const disliked = readFavorites(data.disliked);
    const excluded = new Set(disliked);
    const queue = data.queue;
    const playback = readPlayback(data.playback);
    const resumeRepeat = playback.rememberRepeat ? readRepeat(data.resumeRepeat ?? queue?.repeat) : 'off';
    const beforeShuffle = validIds(queue?.beforeShuffle) ? queue.beforeShuffle : null;
    const resumeShuffle = playback.rememberShuffle && (data.resumeShuffle ?? Boolean(beforeShuffle)) === true;
    return {
      volume: numeric(data.volume, defaults.volume, 0, 1),
      lastVolume: numeric(data.lastVolume, defaults.lastVolume, 0.01, 1),
      showDemos: data.showDemos !== false,
      uiLanguage: readUiLanguage(data.uiLanguage),
      nativeFloat: data.nativeFloat === true,
      appearance: readAppearance(data.appearance),
      favorites: readFavorites(data.favorites).filter((id) => !excluded.has(id)), disliked,
      recent: readFavorites(data.recent).slice(0, RECENT_LIMIT),
      stationIds: readStationIds(data.stationIds),
      playlists: readLumaPlaylists(data.playlists),
      onlineTracks: readOnlineShelf(data.onlineTracks),
      onlineRefs: readOnlineShelf(data.onlineRefs),
      playback,
      audioQuality: readAudioQuality(data.audioQuality),
      autoLyrics: data.autoLyrics === true,
      karaokeStyle: readKaraokeStyle(data.karaokeStyle),
      autoCatalogSearch: data.autoCatalogSearch !== false,
      exportLyrics: data.exportLyrics === true,
      resumeRepeat, resumeShuffle,
      equalizer: readEqualizer(data.equalizer),
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

export function activeOnlineRefs({ onlineTracks, onlineRefs, recent, favorites, queue, playlists }: Preferences) {
  const keep = new Set([...recent, ...favorites, ...(queue?.order ?? []), ...playlists.flatMap(({ trackIds }) => trackIds)]);
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

/** Keep all recording references needed by the replacement queue and existing profile. */
export function catalogQueueRefs(preferences: Preferences, queue: QueueState, tracks: readonly OnlineTrack[]) {
  const refs = activeOnlineRefs({ ...preferences, queue });
  const known = new Set([...preferences.onlineTracks, ...refs].map(({ id }) => id));
  for (const track of tracks) {
    if (known.has(track.id)) continue;
    refs.push(track);
    known.add(track.id);
  }
  return refs;
}
