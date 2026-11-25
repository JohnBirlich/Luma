import { useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, History, Library, Music2, Sparkles, UserRound } from 'lucide-react';
import { useText } from '../i18n/context';
import { formatCount } from '../shared/customization';
import type { ListeningStats } from '../player/preferences';

export interface StatisticsData {
  stats: ListeningStats;
  /** True while the deck (local or VK) is actually playing. */
  ticking: boolean;
  localCount: number;
  onlineCount: number;
  playlistCount: number;
  favoriteCount: number;
  recentCount: number;
  vkRecentCount: number;
  fullNumbers: boolean;
  /** Which accounts are signed in right now; the rest are placeholders for later. */
  accounts: { vk: boolean };
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
  // The stored total is flushed now and then; the screen counts the current listen
  // second by second so the time in the player never stands still.
  const base = data.stats.seconds;
  const [tick, setTick] = useState(0);
  const baseRef = useRef(base);
  useEffect(() => {
    if (base === baseRef.current) return;
    baseRef.current = base;
    setTick(0);
  }, [base]);
  useEffect(() => {
    if (!data.ticking) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [data.ticking]);
  const seconds = base + tick;
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
        [t('Время в плеере'), duration(seconds, t.language)],
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
        <p>{seconds > 0 ? t('Время в плеере: {0}', duration(seconds, t.language)) : t('Начните воспроизведение, и статистика заполнится сама.')}</p></div>
    </section>
    {groups.map(({ icon: Icon, label, rows }) => <section className="statistics-group" key={label} aria-label={label}>
      <header><Icon size={17} aria-hidden="true" /><h3>{label}</h3></header>
      <dl>{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
    </section>)}
    <section className="statistics-group statistics-accounts" aria-label={t('Аккаунты')}>
      <header><UserRound size={17} aria-hidden="true" /><h3>{t('Аккаунты')}</h3></header>
      <dl>
        <div><dt>{t('Аккаунт VK')}</dt><dd><span className={`account-state ${data.accounts.vk ? 'is-on' : 'is-off'}`}><i aria-hidden="true" />{t(data.accounts.vk ? 'Подключено' : 'Не подключено')}</span></dd></div>
        <div><dt>{t('Аккаунт Spotify')}</dt><dd><span className="account-state is-later"><i aria-hidden="true" />{t('Временно недоступно')}</span></dd></div>
        <div><dt>{t('Аккаунт Яндекс Музыки')}</dt><dd><span className="account-state is-later"><i aria-hidden="true" />{t('Временно недоступно')}</span></dd></div>
      </dl>
    </section>
    <p className="statistics-note"><Music2 size={14} aria-hidden="true" />{t('Считается на этом устройстве: Luma не отправляет статистику на сервер.')}</p>
  </div>;
}
