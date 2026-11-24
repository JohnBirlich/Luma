import { ExternalLink, Play } from 'lucide-react';
import { VK_ARTWORK_URL } from '../data/artwork';
import { useText } from '../i18n/context';
import { vkHistoryDestination, vkHistoryKey } from '../shared/vk-history';
import type { VkHistoryEntry } from '../shared/vk-history';
import { Artwork } from './Artwork';
import './vk-history.css';

export function VkHistoryRows({ entries, open, play }: { entries: readonly VkHistoryEntry[]; open?(url: string): void; play?(entry: VkHistoryEntry): void }) {
  const t = useText();
  return <ul className="vk-history-rows" aria-label={t('История VK Музыки')}>
    {entries.map((entry) => {
      const url = vkHistoryDestination(entry);
      return <li key={vkHistoryKey(entry)}>
        <button className="vk-history-track" type="button" aria-label={t('Включить {0} в VK Музыке', entry.title)} disabled={!url || !(play || open)}
          onClick={() => { if (play) play(entry); else if (url) open?.(url); }}>
          <Artwork imageUrl={entry.artwork && window.luma ? `luma://app/media/vk-listen/${entry.artwork}` : VK_ARTWORK_URL} />
          <span className="vk-history-text"><strong title={entry.title}>{entry.title}</strong>{entry.artist && <small title={entry.artist}>{entry.artist}</small>}</span>
          <span className="vk-history-badge">VK</span>
          {play ? <Play size={15} aria-hidden="true" /> : <ExternalLink size={15} aria-hidden="true" />}
        </button>
      </li>;
    })}
  </ul>;
}
