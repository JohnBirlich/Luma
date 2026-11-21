import { useText } from '../i18n/context';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowUpRight, AudioLines, Bug, ChevronRight, Heart, History, Info, LogIn, Music2, Settings2, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { trackCount } from '../shared/media';
import { VK_MUSIC_URL } from '../shared/vk';
import { About } from './About';

function VkMusicLink() {
  const t = useText();
  const description = useId();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  const title = t('Зайти в VK');
  return <a className="menu-item menu-link" href={VK_MUSIC_URL} target="_blank" rel="noopener noreferrer"
    aria-label={title} aria-describedby={description} onClick={(event) => {
      if (!window.luma) return;
      event.preventDefault();
      if (opening) return;
      setOpening(true);
      setFailed(false);
      void window.luma.openVkMusic().catch(() => setFailed(true)).finally(() => setOpening(false));
    }}>
    <span className="menu-item-icon" aria-hidden="true"><LogIn size={19} strokeWidth={1.75} /></span>
    <span className="menu-item-copy"><strong>{title}</strong>
      <small id={description}>{t('Вход и плейлисты на vk.ru в браузере, без синхронизации с Luma.')}
        <span role="status" className="menu-link-status">{failed && t('Не удалось открыть VK. Перейдите на vk.ru/audio в браузере.')}</span>
      </small>
    </span>
    <ArrowUpRight className="menu-chevron" size={17} aria-hidden="true" />
  </a>;
}

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
}

export function MenuPage(props: MenuPageProps) {
  const t = useText();
  const [about, setAbout] = useState(false);
  return (
    <div className="page menu-page">
      <header className="page-header">
        <div><p className="overline page-kicker"><span />Luma Player</p><h1>{about ? t("О приложении") : t("Меню")}</h1></div>
        {about && <button type="button" className="button outline-button" onClick={() => setAbout(false)}><ArrowLeft size={16} />{" "}{t("В меню")}</button>}
      </header>
      <div className="menu-body">
        {about ? <About /> : <>
          <section className="menu-profile" aria-label={t("Профиль Luma")}>
            <div className="menu-profile-logo"><AudioLines size={27} strokeWidth={1.85} /></div>
            <div><h2>Luma Player</h2><p>{trackCount(props.localCount, props.fullNumbers, t.language)}{" "}{t("с устройства")}</p></div>
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
            <VkMusicLink />
            <MenuItem icon={Info} title={t("О приложении")} detail={t("Версия Luma, возможности и релизы")} select={() => setAbout(true)} />
          </MenuGroup>
        </>}
      </div>
    </div>
  );
}
