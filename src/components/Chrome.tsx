import { useText } from '../i18n/context';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AudioLines, Bug, Copy, Heart, House, ListMusic, Menu, Minus, Music2, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, SlidersHorizontal, Square, X } from 'lucide-react';

import { formatCount } from '../shared/customization';
import { connectionState, subscribeConnection } from '../data/diagnostics';

export type Page = 'player' | 'search' | 'library' | 'favorites' | 'menu' | 'settings' | 'diagnostics' | 'recent' | 'mixes';

interface TitleBarProps {
  openSettings(): void;
  settingsActive: boolean;
  glass: boolean;
  addMusic(): void;
  busy: boolean;
}

export function TitleBar({ openSettings, settingsActive, glass, addMusic, busy }: TitleBarProps) {
  const t = useText();
  const api = window.luma?.window;
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!api) return;
    void api.isMaximized().then(setMaximized).catch(() => undefined);
    return api.onMaximized(setMaximized);
  }, [api]);
  const windowButtons = api && <div className="window-buttons">
    <button type="button" onClick={api.minimize} title={t("Свернуть")} aria-label={t("Свернуть")}><Minus size={15} /></button>
    <button type="button" onClick={api.toggleMaximize} title={maximized ? t("Восстановить окно") : t("Развернуть")} aria-label={maximized ? t("Восстановить окно") : t("Развернуть")}>
      {maximized ? <Copy size={13} /> : <Square size={12} />}
    </button>
    <button type="button" className="window-close" onClick={api.close} title={t("Закрыть окно")} aria-label={t("Закрыть окно")}><X size={16} /></button>
  </div>;
  return (
    <header className={`title-bar${api ? ' native-title-bar' : ''}`}>
      {glass && (windowButtons ?? <span className="mac-lights" aria-hidden="true"><i /><i /><i /></span>)}
      <div className="wordmark" aria-label="Luma Player">
        <div className="brand-mark" aria-hidden="true"><AudioLines size={20} strokeWidth={2.05} /></div>
        <strong>Luma<span> Player</span></strong>
      </div>
      <div className="title-actions">
        <button type="button" className="icon-button title-import" onClick={addMusic} disabled={busy}
          aria-label={busy ? t("Добавляем музыку") : t("Добавить музыку")} title={t("Добавить музыку (Ctrl+O)")}><Plus size={19} /></button>
        <button type="button" className="icon-button title-settings" onClick={openSettings} aria-current={settingsActive ? 'page' : undefined}
          aria-label={t("Настройки")} title={t("Настройки (Ctrl+,)")}><Settings2 size={18} /></button>
        {api ? !glass && windowButtons : <div className="web-status"><span />{t("Веб-превью")}</div>}
      </div>
    </header>
  );
}

const PRIMARY_PAGES = [
  { id: 'player', label: 'Главная', icon: House },
  { id: 'search', label: 'Поиск', icon: Search },
  { id: 'library', label: 'Медиатека', icon: Music2 },
] as const;
const MENU_PAGE = { id: 'menu', label: 'Меню', icon: Menu } as const;
const NAVIGATION = [...PRIMARY_PAGES, MENU_PAGE];
const GLASS_NAVIGATION = [...PRIMARY_PAGES, { id: 'favorites', icon: Heart, label: 'Избранное' } as const, MENU_PAGE];

interface SidebarProps {
  page: Page;
  navigate(page: Page): void;
  addMusic(): void;
  busy: boolean;
  count: number;
  fullNumbers: boolean;
  favoriteCount: number;
  queued: number;
  queueOpen: boolean;
  toggleQueue(): void;
  openEqualizer(): void;
  eqEnabled: boolean;
  compact: boolean;
  toggleCompact(): void;
}

export function Sidebar(props: SidebarProps) {
  const t = useText();
  const { page, navigate, addMusic, busy, count, favoriteCount, queued, queueOpen, toggleQueue, openEqualizer, compact, toggleCompact } = props;
  const online = useSyncExternalStore(subscribeConnection, connectionState);
  const active = page === 'settings' || page === 'diagnostics' || page === 'favorites' || page === 'recent' ? 'menu' : page === 'mixes' ? 'library' : page;
  const expandLabel = compact ? t("Развернуть боковую панель") : t("Свернуть боковую панель");
  return (
    <aside className="sidebar" aria-label={t("Навигация")}>
      <div className="sidebar-sections">
        <nav className="navigation" aria-label={t("Разделы плеера")}>
          <div className="nav-heading"><p className="overline nav-label">{t("Коллекция")}</p>
            <button type="button" className="icon-button sidebar-collapse" onClick={toggleCompact} aria-label={expandLabel} title={expandLabel} aria-pressed={compact}>
              {compact ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
          <div className="nav-group">
            {NAVIGATION.map(({ id, icon: Icon, label }) => <button key={id} type="button" className="nav-item"
              title={t(label)} aria-label={t(label)} aria-current={active === id ? 'page' : undefined} onClick={() => navigate(id)}>
              <span className="nav-glyph" aria-hidden="true"><Icon size={19} strokeWidth={1.8} /></span><span className="nav-copy">{t(label)}</span>
              {id === 'library' && <small className="nav-count" aria-hidden="true">{formatCount(count, props.fullNumbers, t.language)}</small>}
            </button>)}
          </div>
        </nav>
        <section className="sidebar-shortcuts" aria-label={t("Быстрый доступ")}>
          <p className="overline nav-label">{t("Быстрый доступ")}</p>
          <button type="button" className="nav-item" title={t("Избранное")} aria-label={t("Избранное")} aria-current={page === 'favorites' ? 'page' : undefined} onClick={() => navigate('favorites')}>
            <Heart className="nav-glyph" size={17} /><span className="nav-copy">{t("Избранное")}</span>{favoriteCount > 0 && <small className="nav-count" aria-hidden="true">{formatCount(favoriteCount, props.fullNumbers, t.language)}</small>}
          </button>
          <button type="button" className="nav-item" title={t("Очередь")} aria-label={t("Очередь из боковой панели")}
            aria-pressed={queueOpen} aria-controls={queueOpen ? 'play-queue' : undefined} onClick={toggleQueue}>
            <ListMusic className="nav-glyph" size={18} /><span className="nav-copy">{t("Очередь")}</span>{queued > 0 && <small className="nav-count" aria-hidden="true">{formatCount(queued, props.fullNumbers, t.language)}</small>}
          </button>
          <button type="button" className="nav-item" title={t("Эквалайзер")} aria-label={t("Эквалайзер из боковой панели")} aria-haspopup="dialog" onClick={openEqualizer}>
            <SlidersHorizontal className="nav-glyph" size={17} /><span className="nav-copy">{t("Эквалайзер")}</span>{props.eqEnabled && <i className="enabled-dot" />}
          </button>
        </section>
      </div>
      <div className="sidebar-footer">
        <button type="button" className="button add-button" title={t("Добавить музыку (Ctrl+O)")} aria-label={busy ? t("Добавляем музыку") : t("Добавить музыку")} onClick={addMusic} disabled={busy}>
          <Plus size={18} /><span>{busy ? t("Добавляем…") : t("Добавить музыку")}</span>
        </button>
        <button type="button" className={`sidebar-diagnostic${online ? '' : ' connection-off'}`} aria-label={t("Диагностика из боковой панели")} title={t("Диагностика (Ctrl+Shift+L)")}
          aria-current={page === 'diagnostics' ? 'page' : undefined} onClick={() => navigate('diagnostics')}>
          <Bug size={17} /><span className="sidebar-diagnostic-copy"><strong>{t("Диагностика")}</strong><small><i />{online ? t("Устройство в сети") : t("Устройство вне сети")}</small></span>
        </button>
      </div>
    </aside>
  );
}

export function GlassNavigation({ page, navigate, openEqualizer, eqEnabled }: Pick<SidebarProps, 'page' | 'navigate' | 'openEqualizer' | 'eqEnabled'>) {
  const t = useText();
  const active = page === 'settings' || page === 'diagnostics' || page === 'recent' ? 'menu' : page === 'mixes' ? 'library' : page;
  return <div className="glass-dock">
    <nav className="glass-navigation" aria-label={t('Разделы плеера')}>
      {GLASS_NAVIGATION.map(({ id, icon: Icon, label }) => <button key={id} type="button" aria-current={active === id ? 'page' : undefined}
        onClick={() => navigate(id)} aria-label={t(label)} title={t(label)}><Icon size={19} strokeWidth={2} /><span>{t(label)}</span></button>)}
    </nav>
    <button type="button" className="glass-sound" aria-label={t('Эквалайзер')} title={t('Эквалайзер')} aria-haspopup="dialog" onClick={openEqualizer}>
      <SlidersHorizontal size={21} />{eqEnabled && <i className="enabled-dot" />}
    </button>
  </div>;
}
