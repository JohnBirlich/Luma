import { ExternalLink } from 'lucide-react';
import { VK_ARTWORK_URL } from '../data/artwork';
import { useText } from '../i18n/context';
import { vkHistoryDestination, vkHistoryKey } from '../shared/vk-history';
import type { VkHistoryEntry } from '../shared/vk-history';
import { Artwork } from './Artwork';
import './vk-history.css';

export function VkHistoryRows({ entries, open }: { entries: readonly VkHistoryEntry[]; open?(url: string): void }) {
  const t = useText();
  return <ul className="vk-history-rows" aria-label={t('История VK Музыки')}>
    {entries.map((entry) => {
      const url = vkHistoryDestination(entry);
      return <li key={vkHistoryKey(entry)}>
        <button className="vk-history-track" type="button" aria-label={t('Открыть {0} в VK', entry.title)} disabled={!url || !open}
          onClick={() => { if (url) open?.(url); }}>
          <Artwork imageUrl={entry.artwork ?? VK_ARTWORK_URL} />
          <span className="vk-history-text"><strong title={entry.title}>{entry.title}</strong>{entry.artist && <small title={entry.artist}>{entry.artist}</small>}</span>
          <span className="vk-history-badge">VK</span><ExternalLink size={15} aria-hidden="true" />
        </button>
      </li>;
    })}
  </ul>;
}
