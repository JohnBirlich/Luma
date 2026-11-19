import { useEffect, useState, useSyncExternalStore } from 'react';
import { AudioLines, Bug, Copy, Heart, House, ListMusic, Menu, Minus, Music2, PanelLeftClose, PanelLeftOpen, Plus, Radio, Search, Settings2, SlidersHorizontal, Square, X } from 'lucide-react';

import { connectionState, subscribeConnection } from '../data/diagnostics';

export type Page = 'player' | 'search' | 'vk' | 'library' | 'favorites' | 'menu' | 'settings' | 'diagnostics';

interface TitleBarProps {
  openSettings(): void;
  settingsActive: boolean;
  addMusic(): void;
  busy: boolean;
}

export function TitleBar({ openSettings, settingsActive, addMusic, busy }: TitleBarProps) {
  const api = window.luma?.window;
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!api) return;
    void api.isMaximized().then(setMaximized).catch(() => undefined);
    return api.onMaximized(setMaximized);
  }, [api]);
  return (
    <header className={`title-bar${api ? ' native-title-bar' : ''}`}>
      <div className="wordmark" aria-label="Luma Player">
        <div className="brand-mark" aria-hidden="true"><AudioLines size={20} strokeWidth={2.05} /></div>
        <strong>Luma<span> Player</span></strong>
      </div>
      <div className="title-caption">Музыкальный плеер</div>
      <div className="title-actions">
        <button type="button" className="icon-button title-import" onClick={addMusic} disabled={busy}
          aria-label={busy ? 'Добавляем музыку' : 'Добавить музыку'} title="Добавить музыку (Ctrl+O)"><Plus size={19} /></button>
        <button type="button" className="icon-button title-settings" onClick={openSettings} aria-current={settingsActive ? 'page' : undefined}
          aria-label="Настройки" title="Настройки (Ctrl+,)"><Settings2 size={18} /></button>
        {api ? <div className="window-buttons">
          <button type="button" onClick={api.minimize} title="Свернуть" aria-label="Свернуть"><Minus size={15} /></button>
          <button type="button" onClick={api.toggleMaximize} title={maximized ? 'Восстановить окно' : 'Развернуть'} aria-label={maximized ? 'Восстановить окно' : 'Развернуть'}>
            {maximized ? <Copy size={13} /> : <Square size={12} />}
          </button>
          <button type="button" className="window-close" onClick={api.close} title="Закрыть окно" aria-label="Закрыть окно"><X size={16} /></button>
        </div> : <div className="web-status"><span />Веб-превью</div>}
      </div>
    </header>
  );
}

const NAVIGATION = [
  { id: 'player', label: 'Главная', icon: House },
  { id: 'search', label: 'Поиск', icon: Search },
  { id: 'vk', label: 'VK Музыка', icon: Radio },
  { id: 'library', label: 'Медиатека', icon: Music2 },
  { id: 'menu', label: 'Меню', icon: Menu },
] as const;

interface SidebarProps {
  page: Page;
  navigate(page: Page): void;
  addMusic(): void;
  busy: boolean;
  count: number;
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
  const { page, navigate, addMusic, busy, count, favoriteCount, queued, queueOpen, toggleQueue, openEqualizer, compact, toggleCompact } = props;
  const online = useSyncExternalStore(subscribeConnection, connectionState);
  const active = page === 'settings' || page === 'diagnostics' || page === 'favorites' ? 'menu' : page;
  const expandLabel = compact ? 'Развернуть боковую панель' : 'Свернуть боковую панель';
  return (
    <aside className="sidebar" aria-label="Навигация">
      <div className="sidebar-sections">
        <nav className="navigation" aria-label="Разделы плеера">
          <div className="nav-heading"><p className="overline nav-label">Коллекция</p>
            <button type="button" className="icon-button sidebar-collapse" onClick={toggleCompact} aria-label={expandLabel} title={expandLabel} aria-pressed={compact}>
              {compact ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </div>
          <div className="nav-group">
            {NAVIGATION.map(({ id, icon: Icon, label }) => <button key={id} type="button" className={`nav-item${id === 'vk' ? ' nav-vk' : ''}`}
              title={label} aria-label={label} aria-current={active === id ? 'page' : undefined} onClick={() => navigate(id)}>
              <span className="nav-glyph" aria-hidden="true"><Icon size={19} strokeWidth={1.8} /></span><span className="nav-copy">{label}</span>
              {id === 'library' && <small className="nav-count" aria-hidden="true">{count}</small>}
            </button>)}
          </div>
        </nav>
        <section className="sidebar-shortcuts" aria-label="Быстрый доступ">
          <p className="overline nav-label">Быстрый доступ</p>
          <button type="button" className="nav-item" title="Избранное" aria-label="Избранное" aria-current={page === 'favorites' ? 'page' : undefined} onClick={() => navigate('favorites')}>
            <Heart className="nav-glyph" size={17} /><span className="nav-copy">Избранное</span>{favoriteCount > 0 && <small className="nav-count" aria-hidden="true">{favoriteCount}</small>}
          </button>
          <button type="button" className="nav-item" title={page === 'vk' ? 'Очередь доступна для локальной музыки' : 'Очередь'} aria-label="Очередь из боковой панели"
            aria-pressed={queueOpen && page !== 'vk'} aria-controls={queueOpen && page !== 'vk' ? 'play-queue' : undefined} disabled={page === 'vk'} onClick={toggleQueue}>
            <ListMusic className="nav-glyph" size={18} /><span className="nav-copy">Очередь</span>{queued > 0 && <small className="nav-count" aria-hidden="true">{queued}</small>}
          </button>
          <button type="button" className="nav-item" title="Эквалайзер" aria-label="Эквалайзер из боковой панели" aria-haspopup="dialog" onClick={openEqualizer}>
            <SlidersHorizontal className="nav-glyph" size={17} /><span className="nav-copy">Эквалайзер</span>{props.eqEnabled && <i className="enabled-dot" />}
          </button>
        </section>
      </div>
      <div className="sidebar-footer">
        <button type="button" className="button add-button" title="Добавить музыку (Ctrl+O)" aria-label={busy ? 'Добавляем музыку' : 'Добавить музыку'} onClick={addMusic} disabled={busy}>
          <Plus size={18} /><span>{busy ? 'Добавляем…' : 'Добавить музыку'}</span>
        </button>
        <button type="button" className={`sidebar-diagnostic${online ? '' : ' connection-off'}`} aria-label="Диагностика из боковой панели" title="Диагностика (Ctrl+Shift+L)"
          aria-current={page === 'diagnostics' ? 'page' : undefined} onClick={() => navigate('diagnostics')}>
          <Bug size={17} /><span className="sidebar-diagnostic-copy"><strong>Диагностика</strong><small><i />{online ? 'Устройство в сети' : 'Устройство вне сети'}</small></span>
        </button>
      </div>
    </aside>
  );
}
