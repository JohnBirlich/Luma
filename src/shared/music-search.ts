import { cleanTrackText } from './russian.js';

export const MUSIC_SERVICES = {
  vk: { name: 'VK Музыка', mark: 'VK', tone: '#90baff', origin: 'https://vk.ru', path: '/audio', param: 'q' },
  yandex: { name: 'Яндекс Музыка', mark: 'Я', tone: '#f8d36f', origin: 'https://music.yandex.ru', path: '/search', param: 'text' },
  spotify: { name: 'Spotify', mark: 'S', tone: '#85dfa5', origin: 'https://open.spotify.com', path: '/search/' },
  zaycev: { name: 'Зайцев.Нет', mark: 'З', tone: '#f7c197', origin: 'https://zaycev.net', path: '/search', param: 'query_search' },
  lastfm: { name: 'Last.fm', mark: 'lf', tone: '#ff9d9e', origin: 'https://www.last.fm', path: '/search/tracks', param: 'q' },
  youtube: { name: 'YouTube Music', mark: '▶', tone: '#ffa9ac', origin: 'https://music.youtube.com', path: '/search', param: 'q' },
  soundcloud: { name: 'SoundCloud', mark: '≋', tone: '#ffb487', origin: 'https://soundcloud.com', path: '/search/sounds', param: 'q' },
  bandcamp: { name: 'Bandcamp', mark: '▰', tone: '#9cdee6', origin: 'https://bandcamp.com', path: '/search', param: 'q' },
} as const;
export type MusicService = keyof typeof MUSIC_SERVICES;

export function serviceSearchUrl(service: unknown, value: unknown): string | undefined {
  if (typeof service !== 'string' || !Object.hasOwn(MUSIC_SERVICES, service) || typeof value !== 'string' || value.length > 512) return;
  const query = cleanTrackText(value).slice(0, 160).trim();
  if (query.length < 2 || !/[\p{L}\p{N}]/u.test(query)) return;
  const item = MUSIC_SERVICES[service as MusicService];
  const url = new URL(item.path, item.origin);
  if ('param' in item) url.searchParams.set(item.param, query);
  else url.pathname += encodeURIComponent(query.replace(/[\uD800-\uDFFF]/gu, '\uFFFD'));
  if (service === 'yandex') url.searchParams.set('type', 'tracks');
  if (service === 'zaycev') url.searchParams.set('type', 'all');
  return url.href;
}
