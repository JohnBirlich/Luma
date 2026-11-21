import { History } from 'lucide-react';
import { useText } from '../i18n/context';

export interface SearchHistoryProps {
  searchHistory: readonly string[];
  rememberSearch(query: string): void;
  clearSearchHistory(): void;
}

export function SearchHistory({ history, select, clear }: { history: readonly string[]; select(value: string): void; clear(): void }) {
  const t = useText();
  if (!history.length) return null;
  return <details className="search-history">
    <summary><History size={15} aria-hidden="true" />{t('История поиска')}</summary>
    <div className="search-history-entries">
      {history.map((query) => <button key={query} className="button outline-button" type="button" onClick={() => select(query)}>{query}</button>)}
      <button className="text-button" type="button" onClick={clear}>{t('Очистить историю поиска')}</button>
    </div>
  </details>;
}
