// Browser destinations only. No site scripts, login sessions or private APIs in the renderer.
export const MUSIC_SITES = {
  vk: { name: 'VK Музыка', home: 'https://vk.ru/music', color: '#4b8bfc', mark: 'VK', search: true },
  mail: { name: 'Музыка Mail.ru', home: 'https://my.mail.ru/music', color: '#4f95ff', mark: '@', search: true },
  yandex: { name: 'Яндекс Музыка', home: 'https://music.yandex.ru/', color: '#ffb747', mark: 'Я', search: true },
  zvuch: { name: 'Zvuch', home: 'https://wwv.zvuch.com/', color: '#7addb9', mark: 'Z', search: false },
  drive: { name: 'DriveMusic', home: 'https://www.drivemusic.club/', color: '#f38b9c', mark: 'D', search: false },
  muzika: { name: 'Muzika.fun', home: 'https://w1.muzika.fun/', color: '#cb9bfc', mark: 'M', search: false },
} as const;
export type MusicSite = keyof typeof MUSIC_SITES;
export const musicSites = Object.keys(MUSIC_SITES) as MusicSite[];

function searchText(value: string) {
  // URLSearchParams normalizes malformed Unicode before encodeURIComponent is used for paths.
  const q = new URLSearchParams([['q', value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 140)]]).get('q')!;
  return q === '..' || q.length < 2 ? '' : q;
}
export function musicSiteUrl(site: MusicSite, query: string) {
  const text = searchText(query);
  if (!text) return MUSIC_SITES[site].home;
  switch (site) {
    case 'vk': return `https://vk.ru/audio?${new URLSearchParams({ q: text })}`;
    case 'mail': return `${MUSIC_SITES.mail.home}/search/${encodeURIComponent(text)}`;
    case 'yandex': return `${MUSIC_SITES.yandex.home}search?${new URLSearchParams({ text, type: 'tracks' })}`;
    default: return MUSIC_SITES[site].home;
  }
}

/** Only canonical destinations generated above may cross IPC. */
export function isMusicSiteUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  if (musicSites.some((id) => value === MUSIC_SITES[id].home)) return true;
  try {
    const url = new URL(value);
    if (url.origin === 'https://vk.ru') return value === musicSiteUrl('vk', url.searchParams.get('q') ?? '');
    if (url.origin === 'https://music.yandex.ru') return value === musicSiteUrl('yandex', url.searchParams.get('text') ?? '');
    if (url.origin === 'https://my.mail.ru' && url.pathname.startsWith('/music/search/')) {
      return value === musicSiteUrl('mail', decodeURIComponent(url.pathname.slice('/music/search/'.length)));
    }
  } catch { /* Bad URL or escape. */ }
  return false;
}
