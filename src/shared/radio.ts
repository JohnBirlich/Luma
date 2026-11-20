import type { Track } from './media.js';

export const RADIO_GENRES = { all: 'Все станции', dance: 'Танцевальная', pop: 'Поп', chill: 'Спокойная', indie: 'Рок и инди' } as const;
export type RadioGenre = Exclude<keyof typeof RADIO_GENRES, 'all'>;
export interface Station {
  id: string;
  name: string;
  broadcaster: string;
  genre: RadioGenre;
  page: string;
  stream: string;
  logo: string;
  tint: string;
}

const recordCdn = 'https://radiorecord.hostingradio.ru/';
const recordSite = 'https://www.radiorecord.ru/';
const recordLogos = `${recordSite}upload/stations_images/`;
const somaCdn = 'https://ice1.somafm.com/';
const somaLogos = 'https://api.somafm.com/logos/120/';
const record = (id: string, name: string, genre: RadioGenre, tint: string, stream = id): Station => ({
  id: `radio-record-${id}`, name, broadcaster: 'Radio Record', genre, tint,
  page: `${recordSite}station/${id}`, stream: `${recordCdn}${stream}96.aacp`, logo: `${recordLogos}${id}_image600_colored_fill.png`,
});
const soma = (id: string, name: string, genre: RadioGenre, tint: string, ext = 'jpg'): Station => ({
  id: `radio-soma-${id}`, name, broadcaster: 'SomaFM', genre, tint,
  page: `https://somafm.com/${id}/`, stream: `${somaCdn}${id}-128-mp3`, logo: `${somaLogos}${id}120.${ext}`,
});

/** A small, static selection from the broadcasters' publicly listed channels, not a VK feed. */
export const STATIONS: readonly Station[] = [
  record('record', 'Record', 'dance', '#f99a4d', 'rr_main'),
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
export const RADIO_ORIGINS = {
  images: `${recordLogos} ${somaLogos}`,
  media: `${recordCdn} ${somaCdn}`,
};
export const STATION_IDS = new Set(STATIONS.map((station) => station.id));
export function readStationIds(value: unknown) {
  const ids = Array.isArray(value) ? value.slice(0, STATIONS.length).filter((id): id is string => typeof id === 'string' && STATION_IDS.has(id)) : [];
  return [...new Set(ids)];
}
export const isStationPage = (value: unknown): value is string => STATIONS.some(({ page }) => value === page);

export const stationTracks: Track[] = STATIONS.map(({ id, name, broadcaster, logo, stream, page, tint }) => ({
  id, title: name, artist: broadcaster, album: broadcaster, artworkUrl: logo, audioUrl: stream, color: tint, duration: 0,
  online: { source: 'broadcast', page, license: '', licenseUrl: '' },
}));
