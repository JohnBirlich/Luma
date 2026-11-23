import type { Track } from './media.js';
import { appendToQueue } from './queue.js';
import type { QueueState } from './queue.js';
import { RADIO_LINEUP } from './radio-lineup.js';
import { radioStationCover } from './radio-artwork.js';
import { radioBrowserUuid, RADIO_BROWSER_MEDIA } from './radio-browser.js';

export const RADIO_GENRES = {
  all: 'Все жанры', dance: 'Танцевальная', pop: 'Поп', chill: 'Спокойная', indie: 'Рок и инди', jazz: 'Джаз',
  classical: 'Классика', talk: 'Разговорное', family: 'Детское', folk: 'Народное и шансон', hipHop: 'Хип-хоп',
} as const;
export type RadioGenre = Exclude<keyof typeof RADIO_GENRES, 'all'>;
export interface RadioListing {
  id: string;
  name: string;
  broadcaster?: string;
  genre: RadioGenre;
  page: string;
  stream?: string;
  logo?: string;
  cover: string;
  tint: string;
}
export interface Station extends RadioListing { stream: string }

const colors: Record<RadioGenre, string> = {
  dance: '#a691ff', pop: '#ffab78', chill: '#89cdbb', indie: '#eb8c8e', jazz: '#edbd78',
  classical: '#e8b9db', talk: '#92bffa', family: '#aadb9c', folk: '#e6bc77', hipHop: '#dba9ee',
};
const recordCdn = 'https://radiorecord.hostingradio.ru/';
const recordSite = 'https://www.radiorecord.ru/';
const recordLogos = `${recordSite}upload/stations_images/`;
const somaCdn = 'https://ice1.somafm.com/';
const somaLogos = 'https://api.somafm.com/logos/120/';
const record = (id: string, name: string, genre: RadioGenre, tint: string, stream = id): Station => ({
  id: `radio-record-${id}`, name, broadcaster: 'Radio Record', genre, tint,
  page: `${recordSite}station/${id}`, stream: `${recordCdn}${stream}96.aacp`, logo: `${recordLogos}${id}_image600_colored_fill.png`,
  cover: radioStationCover(`radio-record-${id}`, name),
});
const soma = (id: string, name: string, genre: RadioGenre, tint: string, ext = 'jpg'): Station => ({
  id: `radio-soma-${id}`, name, broadcaster: 'SomaFM', genre, tint,
  page: `https://somafm.com/${id}/`, stream: `${somaCdn}${id}-128-mp3`, logo: `${somaLogos}${id}120.${ext}`,
  cover: radioStationCover(`radio-soma-${id}`, name),
});

export const RADIO_DIRECTORY: readonly RadioListing[] = RADIO_LINEUP.map(([id, name, genre, page, stream]) => id === 'record'
  ? record('record', name, genre, '#f99a4d', 'rr_main')
  : { id: `radio-ru-${id}`, name, genre, tint: colors[genre],
    page: page.startsWith('https://') ? page : `https://radioplayer.ru/station/${page}`, ...(stream && { stream }),
    cover: radioStationCover(`radio-ru-${id}`, name) });

/** Preserve station IDs and the original optional selections across updates. */
export const EXTRA_STATIONS: readonly Station[] = [
  record('rus', 'Russian Mix', 'pop', '#7daafa'),
  record('sd90', 'Супердискотека 90-х', 'pop', '#f0ae74'),
  soma('groovesalad', 'Groove Salad', 'chill', '#9fce6c', 'png'),
  record('chil', 'Chill-Out', 'chill', '#70cdb3'),
  record('rock', 'Record Rock', 'indie', '#fa9e89'),
  record('deep', 'Deep', 'dance', '#9a8ee7'),
  soma('indiepop', 'Indie Pop Rocks!', 'indie', '#a2c8e8'),
  record('bighits', 'Big Hits', 'pop', '#ed95c5'),
  record('chillhouse', 'Chill House', 'dance', '#a386e8'),
  soma('dronezone', 'Drone Zone', 'chill', '#8bb9df'),
  soma('spacestation', 'Space Station Soma', 'chill', '#ddab9f'),
];
export const RADIO_LISTINGS = [...RADIO_DIRECTORY, ...EXTRA_STATIONS];
export const STATIONS: readonly Station[] = RADIO_LISTINGS.filter((item): item is Station => !!item.stream);
// Curated paths plus dedicated public stream origins; no wildcard HTTPS or user-supplied URLs.
const mediaPaths = STATIONS.map(({ stream }) => { const { origin, pathname } = new URL(stream); return `${origin}${pathname}`; });
export const RADIO_ORIGINS = { images: `${recordLogos} ${somaLogos}`, media: [...new Set(mediaPaths), RADIO_BROWSER_MEDIA].join(' ') };
export const STATION_IDS = new Set(RADIO_LISTINGS.map(({ id }) => id));
const STATION_PAGES = new Set(RADIO_LISTINGS.map(({ page }) => page));
const streamIndex = new Map(STATIONS.map(({ id }, index) => [id, index]));

/** The tuner follows directory order, including the extras, skipping browser-only stations. */
export function adjacentStationId(id: string | null, step: -1 | 1): string | null {
  const index = id === null ? undefined : streamIndex.get(id);
  if (index === undefined || STATIONS.length < 2) return null;
  return STATIONS[(index + step + STATIONS.length) % STATIONS.length].id;
}

/** When already on radio, replace its queue slot instead of adding every station visited. */
export function tuneStation(queue: QueueState, id: string): QueueState {
  const current = queue.currentId;
  const known = (value: string) => streamIndex.has(value) || !!radioBrowserUuid(value);
  if (!known(id) || id === current) return queue;
  if (current === null || !known(current) || queue.order.includes(id)) {
    return { ...appendToQueue(queue, [id]), currentId: id };
  }
  const replace = (order: string[]) => order.map((item) => item === current ? id : item);
  return { ...queue, order: replace(queue.order), currentId: id, beforeShuffle: queue.beforeShuffle && replace(queue.beforeShuffle) };
}

export function readStationIds(value: unknown) {
  const ids = Array.isArray(value) ? value.slice(0, STATION_IDS.size).filter((id): id is string => typeof id === 'string' && STATION_IDS.has(id)) : [];
  return [...new Set(ids)];
}
export const isStationPage = (value: unknown): value is string => typeof value === 'string' && STATION_PAGES.has(value);

export const stationTracks: Track[] = STATIONS.map(({ id, name, broadcaster, logo, cover, stream, page, tint }) => ({
  id, title: name, artist: broadcaster ?? name, album: broadcaster ?? '', artworkUrl: logo ?? cover,
  fallbackArtworkUrl: logo ? cover : undefined, audioUrl: stream, color: tint, duration: 0,
  online: { source: 'broadcast', page, license: '', licenseUrl: '' },
}));
