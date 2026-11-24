import { APP_NAME } from '../shared/app-info';
import { useText } from '../i18n/context';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, AudioLines, BarChart3, Bug, ChevronRight, Heart, History, Info, Music2, Settings2, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { trackCount } from '../shared/media';
import { About } from './About';
import { Statistics } from './Statistics';
import type { StatisticsData } from './Statistics';

interface MenuItemProps {
  icon: LucideIcon;
  title: string;
  detail: string;
  select(): void;
  disabled?: boolean;
  dialog?: boolean;
}

export function MenuItem({ icon: Icon, title, detail, select, disabled, dialog }: MenuItemProps) {
  const description = useId();
  return (
    <button type="button" className="menu-item" onClick={select} disabled={disabled} aria-label={title} aria-describedby={description} aria-haspopup={dialog ? 'dialog' : undefined}>
      <span className="menu-item-icon" aria-hidden="true"><Icon size={19} strokeWidth={1.75} /></span>
      <span className="menu-item-copy"><strong>{title}</strong><small id={description}>{detail}</small></span>
      <ChevronRight className="menu-chevron" size={17} aria-hidden="true" />
    </button>
  );
}

export function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return <section className="menu-group" aria-label={label}><h2 className="overline">{label}</h2><div className="menu-items">{children}</div></section>;
}

interface MenuPageProps {
  localCount: number;
  fullNumbers: boolean;
  openSettings(): void;
  openLibrary(): void;
  openFavorites(): void;
  openRecent(): void;
  openMixes(): void;
  openDiagnostics(): void;
  openEqualizer(): void;
  statistics: StatisticsData;
}

export function MenuPage(props: MenuPageProps) {
  const t = useText();
  const [about, setAbout] = useState(false);
  const [statistics, setStatistics] = useState(false);
  return (
    <div className="page menu-page">
      <header className="page-header">
        <div><p className="overline page-kicker"><span />{APP_NAME}</p><h1>{about ? t("О приложении") : statistics ? t("Статистика") : t("Меню")}</h1></div>
        {(about || statistics) && <button type="button" className="icon-button hub-back" onClick={() => { setAbout(false); setStatistics(false); }}
          aria-label={t("В меню")} title={t("В меню")}><ArrowLeft size={18} /></button>}
      </header>
      <div className="menu-body">
        {about ? <About /> : statistics ? <Statistics data={props.statistics} /> : <>
          <section className="menu-profile" aria-label={t("Профиль Luma")}>
            <div className="menu-profile-logo"><AudioLines size={27} strokeWidth={1.85} /></div>
            <div><h2>{APP_NAME}</h2><p>{trackCount(props.localCount, props.fullNumbers, t.language)}{" "}{t("с устройства")}</p></div>
            <span className="menu-profile-status"><i />{" "}{t("Локальный профиль")}</span>
          </section>
          <MenuGroup label={t("Коллекция")}>
            <MenuItem icon={Music2} title={t("Моя медиатека")} detail={t("Файлы, онлайн-ссылки и коллекции")} select={props.openLibrary} />
            <MenuItem icon={Heart} title={t("Избранное")} detail={t("Треки, отмеченные сердцем")} select={props.openFavorites} />
            <MenuItem icon={Sparkles} title={t("Миксы")} detail={t("Подборки из медиатеки, избранного и истории")} select={props.openMixes} />
            <MenuItem icon={History} title={t("Недавно слушали")} detail={t("История воспроизведения на этом устройстве")} select={props.openRecent} />
          </MenuGroup>
          <MenuGroup label={t("Плеер")}>
            <MenuItem icon={Settings2} title={t("Настройки")} detail={t("Внешний вид, медиатека и воспроизведение")} select={props.openSettings} />
            <MenuItem icon={Bug} title={t("Диагностика")} detail={t("Журнал событий, подключение и сведения о системе")} select={props.openDiagnostics} />
            <MenuItem icon={SlidersHorizontal} title={t('Эквалайзер')} detail={t('Настройте частоты и предусиление')} select={props.openEqualizer} dialog />
            <MenuItem icon={BarChart3} title={t("Статистика")} detail={t("Прослушано треков, время в плеере и размер медиатеки")} select={() => setStatistics(true)} />
            <MenuItem icon={Info} title={t("О приложении")} detail={t("Версия Luma, возможности и релизы")} select={() => setAbout(true)} />
          </MenuGroup>
        </>}
      </div>
    </div>
  );
}
