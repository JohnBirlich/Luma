import { useEffect, useRef, useState } from 'react';
import { Copy, Disc3, ExternalLink, MoreVertical, Play, Plus, ThumbsDown } from 'lucide-react';
import { VK_ARTWORK_URL } from '../data/artwork';
import { useText } from '../i18n/context';
import { vkHistoryDestination, vkHistoryKey } from '../shared/vk-history';
import type { VkHistoryEntry } from '../shared/vk-history';
import { Artwork } from './Artwork';
import './vk-history.css';

export interface VkHistoryActions {
  /** Starts the track inside the guest without leaving Luma's own screen. */
  play?(entry: VkHistoryEntry): void;
  /** VK's own «Добавить в мою музыку». */
  addToLibrary?(entry: VkHistoryEntry): void;
  dislike?(entry: VkHistoryEntry): void;
  openAlbum?(entry: VkHistoryEntry): void;
  copyLink?(entry: VkHistoryEntry): void;
}

export function VkHistoryRows({ entries, open, actions }: { entries: readonly VkHistoryEntry[]; open?(url: string): void; actions?: VkHistoryActions }) {
  const t = useText();
  const [menu, setMenu] = useState<string>();
  const rows = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && rows.current?.contains(target) && (target as HTMLElement).closest('.vk-history-menu, [aria-haspopup="menu"]')) return;
      setMenu(undefined);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(undefined); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [menu]);
  const playable = Boolean(actions?.play);
  return <ul className="vk-history-rows" aria-label={t('История VK Музыки')} ref={rows}>
    {entries.map((entry) => {
      const url = vkHistoryDestination(entry);
      const key = vkHistoryKey(entry);
      const items: { label: string; icon: typeof Plus; run(): void }[] = [];
      if (actions?.addToLibrary) items.push({ label: t('Добавить в мою музыку'), icon: Plus, run: () => actions.addToLibrary!(entry) });
      if (actions?.dislike) items.push({ label: t('Не нравится'), icon: ThumbsDown, run: () => actions.dislike!(entry) });
      if (actions?.openAlbum) items.push({ label: t('Открыть альбом'), icon: Disc3, run: () => actions.openAlbum!(entry) });
      if (actions?.copyLink || url) items.push({ label: t('Скопировать ссылку'), icon: Copy, run: () => actions?.copyLink ? actions.copyLink(entry) : url && void navigator.clipboard.writeText(url).catch(() => {}) });
      return <li key={key} className={menu === key ? 'vk-history-row-menu' : undefined}>
        <button className="vk-history-track" type="button" aria-label={t(playable ? 'Включить {0} в VK Музыке' : 'Открыть {0} в VK', entry.title)}
          disabled={!url || !(playable || open)} onClick={() => { if (actions?.play) actions.play(entry); else if (url) open?.(url); }}>
          <Artwork imageUrl={entry.artwork && window.luma ? `luma://app/media/vk-listen/${entry.artwork}` : VK_ARTWORK_URL} />
          <span className="vk-history-text"><strong title={entry.title}>{entry.title}</strong>{entry.artist && <small title={entry.artist}>{entry.artist}</small>}</span>
          <span className="vk-history-badge">VK</span>
          {playable ? <Play size={15} aria-hidden="true" /> : <ExternalLink size={15} aria-hidden="true" />}
        </button>
        {items.length > 0 && <button type="button" className="icon-button vk-history-more" aria-haspopup="menu" aria-expanded={menu === key}
          aria-label={t('Действия с треком: {0}', entry.title)} onClick={() => setMenu(menu === key ? undefined : key)}><MoreVertical size={16} /></button>}
        {menu === key && <div className="vk-history-menu" role="menu" aria-label={t('Действия с треком')}>
          {items.map(({ label, icon: Icon, run }) => <button key={label} type="button" role="menuitem" onClick={() => { setMenu(undefined); run(); }}>
            <Icon size={16} aria-hidden="true" />{label}</button>)}
        </div>}
      </li>;
    })}
  </ul>;
}
