import type { Track } from './media.js';
import { musicSearchKey } from './russian.js';

export function readIsrc(value: unknown): string | undefined {
  const tags = Array.isArray(value) ? value.slice(0, 8) : [value];
  const distinct = new Set(tags.flatMap((tag) => {
    if (typeof tag !== 'string' || tag.length > 24) return [];
    const code = tag.trim().replaceAll('-', '').toUpperCase();
    return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(code) ? [code] : [];
  }));
  return distinct.size === 1 ? distinct.values().next().value : undefined;
}

const unknownNames = new Set(['', 'неизвестный исполнитель', 'без названия', 'unknown artist', 'untitled']);
type Names = Pick<Track, 'title' | 'artist'>;
export function recordingKey({ title, artist }: Names) {
  return JSON.stringify([musicSearchKey(title), musicSearchKey(artist)]);
}

function knownName({ title, artist }: Names) {
  return !unknownNames.has(musicSearchKey(title)) && !unknownNames.has(musicSearchKey(artist));
}

const noAlbum = new Set(['', 'без альбома', 'unknown album', 'jamendo', 'wikimedia commons', 'internet archive · netlabels', 'audius']);
function albumName(track: Track) {
  const name = musicSearchKey(track.album);
  return noAlbum.has(name) ? '' : name;
}

export function recordingEvidence(left: Track, right: Track): 'verified' | 'choice' | undefined {
  if (left.demo || right.demo || left.online?.source === 'broadcast' || right.online?.source === 'broadcast'
    || !knownName(left) || !knownName(right) || recordingKey(left) !== recordingKey(right)
    || !Number.isFinite(left.duration) || !Number.isFinite(right.duration) || Math.min(left.duration, right.duration) < 10
    || Math.abs(left.duration - right.duration) > 2) return;
  const first = readIsrc(left.isrc), second = readIsrc(right.isrc);
  const firstAlbum = albumName(left), secondAlbum = albumName(right);
  if (firstAlbum && secondAlbum && firstAlbum !== secondAlbum) return;
  if (first && second) return first === second ? 'verified' : undefined;
  if (firstAlbum && firstAlbum === secondAlbum) return 'choice';
}

/** Online hits keep their own identities and actions. A bundle never changes saved track IDs. */
export function bundleRecordings(online: readonly Track[], local: readonly Track[]) {
  const bundles: Track[][] = [], byRecording = new Map<string, Track[][]>();
  const bundledIds = new Set<string>(), onlineIds = new Set(online.map(({ id }) => id));
  for (const item of [...online, ...local]) {
    if (bundledIds.has(item.id)) continue;
    const key = recordingKey(item);
    const pool = byRecording.get(key);
    // Compare all members: loose duration matching must not form transitive chains.
    const compatible = pool?.find((group) => group.every((member) => recordingEvidence(member, item)));
    if (compatible) compatible.push(item);
    else if (onlineIds.has(item.id)) {
      const group = [item];
      bundles.push(group);
      if (pool) pool.push(group);
      else byRecording.set(key, [group]);
    } else continue;
    bundledIds.add(item.id);
  }
  return { bundles: bundles.map((group) => [...group.filter(({ online }) => !online), ...group.filter(({ online }) => online)]), bundledIds };
}

/** Don't start another stream or guess between multiple local files on a provider failure. */
export function verifiedLocalReplacement(track: Track, files: readonly Track[]) {
  if (!track.online || track.online.source === 'broadcast') return;
  const copies = files.filter((file) => !file.online && file.id !== track.id && recordingEvidence(track, file) === 'verified');
  return copies.length === 1 ? copies[0] : undefined;
}
