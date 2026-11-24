import { useMemo } from 'react';
import { Headphones, History, Library, Music2, Sparkles } from 'lucide-react';
import { useText } from '../i18n/context';
import { formatCount } from '../shared/customization';
import type { ListeningStats } from '../player/preferences';

export interface StatisticsData {
  stats: ListeningStats;
  localCount: number;
  onlineCount: number;
  playlistCount: number;
  favoriteCount: number;
  recentCount: number;
  vkRecentCount: number;
  fullNumbers: boolean;
}

/** H:MM:SS for short totals, hours with one decimal once the count is large. */
function duration(seconds: number, language: string) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours >= 100) {
    const format = new Intl.NumberFormat(language, { maximumFractionDigits: 1 });
    return `${format.format(total / 3600)} ${language === 'en' ? 'h' : 'ч'}`;
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${hours}:${pad(minutes)}:${pad(total % 60)}`;
}

export function Statistics({ data }: { data: StatisticsData }) {
  const t = useText();
  const number = (value: number) => formatCount(value, data.fullNumbers, t.language);
  const since = useMemo(() => {
    if (!data.stats.since) return undefined;
    const date = new Date(data.stats.since);
    return Number.isNaN(date.getTime()) ? undefined : new Intl.DateTimeFormat(t.language, { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
  }, [data.stats.since, t.language]);
  const total = data.stats.localListens + data.stats.vkListens;
  const groups: Array<{ icon: typeof Headphones; label: string; rows: Array<[string, string]> }> = [
    {
      icon: Headphones, label: t('Прослушано'), rows: [
        [t('Локальные треки'), number(data.stats.localListens)],
        [t('Треки из VK Музыки'), number(data.stats.vkListens)],
        [t('Всего треков'), number(total)],
        [t('Время в плеере'), duration(data.stats.seconds, t.language)],
        ...(since ? [[t('Считаем с'), since] as [string, string]] : []),
      ],
    },
    {
      icon: Library, label: t('Медиатека'), rows: [
        [t('Файлы на устройстве'), number(data.localCount)],
        [t('Онлайн-треки'), number(data.onlineCount)],
        [t('Плейлисты'), number(data.playlistCount)],
        [t('В избранном'), number(data.favoriteCount)],
      ],
    },
    {
      icon: History, label: t('История'), rows: [
        [t('Записи локальной истории'), number(data.recentCount)],
        [t('Записи VK Музыки'), number(data.vkRecentCount)],
      ],
    },
  ];
  return <div className="statistics-view">
    <section className="statistics-hero" aria-label={t('Сводка прослушивания')}>
      <div className="statistics-hero-mark" aria-hidden="true"><Sparkles size={26} /></div>
      <div><p className="overline">{t('Сводка Luma')}</p><h2>{total > 0 ? t('Прослушано треков: {0}', number(total)) : t('Пока нет прослушиваний')}</h2>
        <p>{data.stats.seconds > 0 ? t('Время в плеере: {0}', duration(data.stats.seconds, t.language)) : t('Начните воспроизведение, и статистика заполнится сама.')}</p></div>
    </section>
    {groups.map(({ icon: Icon, label, rows }) => <section className="statistics-group" key={label} aria-label={label}>
      <header><Icon size={17} aria-hidden="true" /><h3>{label}</h3></header>
      <dl>{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
    </section>)}
    <p className="statistics-note"><Music2 size={14} aria-hidden="true" />{t('Считается на этом устройстве: Luma не отправляет статистику на сервер.')}</p>
  </div>;
}
