import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowUpRight, ChevronDown, Copy, Globe2 } from 'lucide-react';
import { useText } from '../i18n/context';
import { MUSIC_SITES, musicSites, musicSiteUrl } from '../shared/music-sites';
import { SourceLink } from './OnlineMusic';

export function MusicSites({ query }: { query: string }) {
  const t = useText();
  const text = query.trim();
  const [clipboard, setClipboard] = useState<{ text: string; ok: boolean }>();
  return <details className="hub-shelf music-sites">
    <summary><Globe2 size={17} aria-hidden="true" /><strong>{t('Открыть на музыкальных сайтах')}</strong>
      <span className="hub-badge">{t('В браузере')}</span><ChevronDown className="music-sites-arrow" size={16} aria-hidden="true" /></summary>
    <p className="hub-note">{t('Из этих сервисов Luma не получает результаты. Ссылки откроются только по вашему нажатию.')}</p>
    <ul className="music-site-grid">{musicSites.map((id) => {
      const site = MUSIC_SITES[id], target = musicSiteUrl(id, text);
      return <li key={id}>
        <SourceLink url={target} className="music-site" label={t('Открыть {0} в браузере', t(site.name))}>
          <span className="music-site-mark" aria-hidden="true" style={{ '--site-color': site.color } as CSSProperties}>{site.mark}</span>
          <span className="music-site-copy"><strong>{t(site.name)}</strong><small>{target !== site.home ? t('Запрос на сайте') : t('Открыть сайт')}</small></span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </SourceLink>
      </li>;
    })}</ul>
    {text && <div className="hub-topline music-sites-copy">
      <small>{t('Если запрос не подставился, вставьте его в поиск на сайте.')}</small>
      <button type="button" className="text-button" onClick={async () => {
        try { await navigator.clipboard.writeText(text); setClipboard({ text, ok: true }); }
        catch { setClipboard({ text, ok: false }); }
      }}><Copy size={14} />{t('Скопировать запрос')}</button>
      {clipboard?.text === text && <small role="status">{t(clipboard.ok ? 'Запрос скопирован.' : 'Не удалось скопировать запрос.')}</small>}
    </div>}
  </details>;
}
