import { useEffect, useRef } from 'react';
import { Copy, Disc3, ExternalLink, Play, Plus, ThumbsDown } from 'lucide-react';
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
  /** Receives the cover key once a listen saved without a cover is resolved. */
  artwork?(entry: VkHistoryEntry, key: string): void;
}

/** How many saved listens ask VK for a missing cover at once, and how many per pass. */
const COVER_BATCH = 4;
const COVER_LIMIT = 12;

export function VkHistoryRows({ entries, open, actions }: { entries: readonly VkHistoryEntry[]; open?(url: string): void; actions?: VkHistoryActions }) {
  const t = useText();
  const asked = useRef(new Set<string>());
  // A saved listen keeps its cover by key. When the key was never stored — or its file
  // was swept — the cover is read once from the track's own page, so the shelf does not
  // keep a branded placeholder for rows that do have artwork on VK. The signature keeps
  // the effect from asking again on every render, and a failed link is not retried.
  const missingSignature = entries.filter((entry) => entry.link && !entry.artwork).map((entry) => entry.link).join('|');
  useEffect(() => {
    const bridge = window.luma?.vkSite;
    if (!bridge?.cover || !actions?.artwork || !missingSignature) return;
    let active = true;
    const missing = missingSignature.split('|').filter((link) => link && !asked.current.has(link)).slice(0, COVER_LIMIT);
    for (const link of missing) asked.current.add(link);
    const byLink = new Map(entries.flatMap((entry) => entry.link && !entry.artwork ? [[entry.link, entry] as const] : []));
    const run = async () => {
      let index = 0;
      const worker = async () => {
        while (active && index < missing.length) {
          const link = missing[index++];
          const key = await bridge.cover(link).catch(() => undefined);
          const entry = byLink.get(link);
          if (!active || !key || !entry) continue;
          actions.artwork!(entry, key);
        }
      };
      await Promise.all(Array.from({ length: Math.min(COVER_BATCH, missing.length) }, worker));
    };
    void run();
    return () => { active = false; };
  }, [actions, entries, missingSignature]);

  const playable = Boolean(actions?.play);
  return <ul className="vk-history-rows" aria-label={t('История VK Музыки')}>
    {entries.map((entry) => {
      const url = vkHistoryDestination(entry);
      const key = vkHistoryKey(entry);
      const disabled = !url || !(playable || open);
      const label = t(playable ? 'Включить {0} в VK Музыке' : 'Открыть {0} в VK', entry.title);
      const start = () => { if (actions?.play) actions.play(entry); else if (url) open?.(url); };
      const buttons: { label: string; icon: typeof Plus; run(): void }[] = [];
      if (actions?.addToLibrary) buttons.push({ label: t('Добавить в мою музыку'), icon: Plus, run: () => actions.addToLibrary!(entry) });
      if (actions?.dislike) buttons.push({ label: t('Не нравится'), icon: ThumbsDown, run: () => actions.dislike!(entry) });
      if (actions?.openAlbum) buttons.push({ label: t('Открыть альбом'), icon: Disc3, run: () => actions.openAlbum!(entry) });
      if (actions?.copyLink || url) buttons.push({ label: t('Скопировать ссылку'), icon: Copy, run: () => actions?.copyLink ? actions.copyLink(entry) : url && void navigator.clipboard.writeText(url).catch(() => {}) });
      return <li key={key} className="vk-history-row">
        <button className="vk-history-track" type="button" aria-label={label} disabled={disabled} onClick={start}>
          <Artwork imageUrl={entry.artwork && window.luma ? `luma://app/media/vk-listen/${entry.artwork}` : VK_ARTWORK_URL} />
          <span className="vk-history-text"><strong title={entry.title}>{entry.title}</strong>{entry.artist && <small title={entry.artist}>{entry.artist}</small>}</span>
          <span className="vk-history-badge">VK</span>
        </button>
        {buttons.length > 0 && <span className="vk-history-actions" role="group" aria-label={t('Действия с треком: {0}', entry.title)}>
          {buttons.map(({ label: name, icon: Icon, run }) => <button key={name} type="button" className="icon-button vk-history-action"
            title={name} aria-label={name} onClick={run}><Icon size={15} aria-hidden="true" /></button>)}
        </span>}
        <button type="button" className="icon-button vk-history-play" title={label} aria-label={label} disabled={disabled} onClick={start}>
          {playable ? <Play size={15} aria-hidden="true" /> : <ExternalLink size={15} aria-hidden="true" />}
        </button>
      </li>;
    })}
  </ul>;
}
