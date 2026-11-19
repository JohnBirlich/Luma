import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, AudioLines, Bug, ChevronRight, FolderOpen, Heart, History, Info, Music2, Radio, Settings2, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { trackCount } from '../shared/media';
import { About } from './About';

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
  ready: boolean;
  eqEnabled: boolean;
  openSettings(): void;
  openEqualizer(): void;
  openLibrary(): void;
  openFavorites(): void;
  openRecent(): void;
  openMixes(): void;
  openDiagnostics(): void;
  openVk(): void;
  addMusic(): void;
}

export function MenuPage(props: MenuPageProps) {
  const [about, setAbout] = useState(false);
  return (
    <div className="page menu-page">
      <header className="page-header">
        <div><p className="overline page-kicker"><span />Luma Player</p><h1>{about ? 'О приложении' : 'Меню'}</h1></div>
        {about && <button type="button" className="button outline-button" onClick={() => setAbout(false)}><ArrowLeft size={16} /> В меню</button>}
      </header>
      <div className="menu-body">
        {about ? <About /> : <>
          <section className="menu-profile" aria-label="Профиль Luma">
            <div className="menu-profile-logo"><AudioLines size={27} strokeWidth={1.85} /></div>
            <div><h2>Luma Player</h2><p>{trackCount(props.localCount)} с устройства</p></div>
            <span className="menu-profile-status"><i /> Локальный профиль</span>
          </section>
          <MenuGroup label="Коллекция">
            <MenuItem icon={Music2} title="Моя медиатека" detail="Файлы, онлайн-ссылки и коллекции" select={props.openLibrary} />
            <MenuItem icon={Heart} title="Избранное" detail="Треки, отмеченные сердцем" select={props.openFavorites} />
            <MenuItem icon={Sparkles} title="Миксы" detail="Подборки из медиатеки, избранного и истории" select={props.openMixes} />
            <MenuItem icon={History} title="Недавно слушали" detail="История воспроизведения на этом устройстве" select={props.openRecent} />
            <MenuItem icon={FolderOpen} title="Импортировать треки" detail="Добавьте аудиофайлы или перетащите их в окно" select={props.addMusic} disabled={!props.ready} />
            <MenuItem icon={Radio} title="VK Музыка" detail="Плейлисты, ссылки и официальный виджет" select={props.openVk} />
          </MenuGroup>
          <MenuGroup label="Плеер">
            <MenuItem icon={Settings2} title="Настройки" detail="Внешний вид, медиатека и воспроизведение" select={props.openSettings} />
            <MenuItem icon={SlidersHorizontal} title="Эквалайзер" detail={props.eqEnabled ? 'Включён · пресеты и пять полос' : 'Выключен · пресеты и пять полос'} select={props.openEqualizer} dialog />
            <MenuItem icon={Bug} title="Диагностика" detail="Журнал событий, подключение и сведения о системе" select={props.openDiagnostics} />
            <MenuItem icon={Info} title="О приложении" detail="Версия Luma, возможности и релизы" select={() => setAbout(true)} />
          </MenuGroup>
        </>}
      </div>
    </div>
  );
}
