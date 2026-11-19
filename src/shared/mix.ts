import type { Track } from './media.js';
import { ONLINE_SOURCES } from './online.js';
import { musicSearchKey } from './russian.js';

export type MixType = 'library' | 'favorites' | 'recent';
export type LibraryGroup = 'artist' | 'album' | 'genre';
export interface GroupFilter { kind: LibraryGroup; id: string }

function labels(track: Track, kind: LibraryGroup): { id: string; label: string }[] {
  if (kind === 'genre') return (track.genres ?? []).map((label) => ({ id: musicSearchKey(label), label }));
  if (kind === 'artist') return track.artist === 'Неизвестный исполнитель' ? [] : [{ id: musicSearchKey(track.artist), label: track.artist }];
  if (track.album === 'Без альбома' || (track.online && track.album === ONLINE_SOURCES[track.online.source])) return [];
  const album = musicSearchKey(track.album);
  return album ? [{ id: JSON.stringify([album, musicSearchKey(track.artist)]), label: `${track.album} · ${track.artist}` }] : [];
}

export function tracksInGroup(tracks: readonly Track[], { kind, id }: GroupFilter) {
  return tracks.filter((track) => labels(track, kind).some((group) => group.id === id));
}

export function musicGroups(tracks: readonly Track[], kind: LibraryGroup, limit = Infinity) {
  const groups = new Map<string, { id: string; label: string; count: number }>();
  for (const track of tracks) {
    for (const { id, label } of labels(track, kind)) {
      if (!id) continue;
      const group = groups.get(id);
      if (group) group.count++;
      else groups.set(id, { id, label, count: 1 });
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru')).slice(0, limit);
}

export function makeMix(tracks: Track[], options: {
  type: MixType; favorites: ReadonlySet<string>; recent: readonly Track[]; disliked?: ReadonlySet<string>; group?: GroupFilter; offline: boolean; seed: number;
}): Track[] {
  const { type, favorites, recent, group, offline, seed, disliked } = options;
  const listened = new Set(recent.map(({ id }) => id));
  const source = type === 'recent' ? recent : type === 'favorites' ? tracks.filter(({ id }) => favorites.has(id)) : tracks;
  const candidates = group ? tracksInGroup(source, group) : source;
  let state = seed >>> 0;
  const random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
  const seen = new Set<string>();
  return candidates.filter(({ id, online }) => {
    if (seen.has(id) || disliked?.has(id) || (offline && online)) return false;
    seen.add(id);
    return true;
  }).map((track) => ({ track, rank: random() + (type === 'library' && favorites.has(track.id) ? 0.35 : 0)
      + (type === 'library' && listened.has(track.id) ? 0.17 : 0) }))
    .sort((a, b) => b.rank - a.rank).slice(0, 24).map(({ track }) => track);
}

export function shuffledMix(tracks: Track[], random = Math.random): Track[] {
  const order = [...tracks];
  for (let i = order.length - 1; i > 0; i--) {
    const next = Math.floor(random() * (i + 1));
    [order[i], order[next]] = [order[next], order[i]];
  }
  return order;
}

/** Personalize from the actual Luma profile, not demo seeds or a remote listening profile. */
export function homeRecommendations(collection: readonly Track[], recent: readonly Track[], favorites: ReadonlySet<string>, offline: boolean, disliked?: ReadonlySet<string>) {
  const available = (track: Track) => !track.demo && !disliked?.has(track.id) && !(offline && track.online);
  const listened = new Set(recent.map(({ id }) => id));
  const creators = new Set<string>();
  const genres = new Set<string>();
  for (const track of recent.filter(available).slice(0, 12)) {
    for (const { id } of labels(track, 'artist')) if (id) creators.add(id);
    for (const { id } of labels(track, 'genre')) if (id) genres.add(id);
  }
  const candidates = collection.filter((track) => available(track) && !listened.has(track.id));
  const related = candidates.map((track) => ({
    track,
    score: (labels(track, 'artist').some(({ id }) => creators.has(id)) ? 3 : 0)
      + (labels(track, 'genre').some(({ id }) => genres.has(id)) ? 1 : 0),
  })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || Number(favorites.has(b.track.id)) - Number(favorites.has(a.track.id)))
    .slice(0, 4).map(({ track }) => track);
  const similarIds = new Set(related.map(({ id }) => id));
  return {
    recent: recent.filter(available).slice(0, 4),
    related,
    discoveries: candidates.filter(({ id }) => !similarIds.has(id) && !favorites.has(id)).slice(0, 4),
  };
}
