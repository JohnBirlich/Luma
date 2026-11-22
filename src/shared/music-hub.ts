import type { Track } from './media.js';
import { musicSearchKey } from './russian.js';

export const HUB_QUEUE_LIMIT = 24;

/** Explicit discovery excludes dislikes; the user's own lists/search never hide those tracks. */
export function hubMusic(collection: readonly Track[], recent: readonly Track[], disliked: ReadonlySet<string>, offline: boolean, favorites: ReadonlySet<string> = new Set()) {
  const allowed = (track: Track) => !disliked.has(track.id) && (!offline || !track.online);
  const available = collection.filter(allowed);
  const personal = available.filter(({ demo }) => !demo);
  const demos = available.filter(({ demo }) => demo);
  const history = recent.filter((track) => !track.demo && allowed(track));
  const heard = new Set(history.map(({ id }) => id));
  const seed = history[0];
  const related = seed ? similarRecordings(personal, seed, favorites) : [];
  return { personal, demos, history, related, seed, discoveries: personal.filter(({ id }) => !heard.has(id)) };
}

export function similarRecordings(tracks: readonly Track[], seed: Track, favorites: ReadonlySet<string> = new Set()) {
  const artist = musicSearchKey(seed.artist);
  const hasArtist = Boolean(artist && seed.artist !== 'Неизвестный исполнитель');
  const genres = new Set(seed.genres?.map(musicSearchKey));
  return tracks.flatMap((track) => {
    if (track.id === seed.id) return [];
    const rank = (hasArtist && musicSearchKey(track.artist) === artist ? 4 : 0)
      + (track.genres?.some((name) => genres.has(musicSearchKey(name))) ? 1 : 0);
    return rank ? [{ track, rank: rank * 2 + Number(favorites.has(track.id)) }] : [];
  }).sort((a, b) => b.rank - a.rank).slice(0, 9).map(({ track }) => track);
}
