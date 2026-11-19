import { useEffect, useState } from 'react';
import { AudioLines, Copy, House, Menu, Minus, Music2, Plus, Radio, Search, Settings2, Square, X } from 'lucide-react';

export type Page = 'player' | 'search' | 'vk' | 'library' | 'menu' | 'settings';

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
}

export function Sidebar({ page, navigate, addMusic, busy, count }: SidebarProps) {
  const active = page === 'settings' ? 'menu' : page;
  return (
    <aside className="sidebar" aria-label="Навигация">
      <nav className="navigation" aria-label="Разделы плеера">
        <p className="overline nav-label">Коллекция</p>
        <div className="nav-group">
          {NAVIGATION.map(({ id, icon: Icon, label }) => <button key={id} type="button" className={`nav-item${id === 'vk' ? ' nav-vk' : ''}`}
            aria-current={active === id ? 'page' : undefined} onClick={() => navigate(id)}>
            <span className="nav-glyph" aria-hidden="true"><Icon size={19} strokeWidth={1.8} /></span><span>{label}</span>
            {id === 'library' && <small className="nav-count" aria-hidden="true">{count}</small>}
          </button>)}
        </div>
      </nav>
      <div className="sidebar-footer">
        <button type="button" className="button add-button" title="Добавить музыку (Ctrl+O)" aria-label={busy ? 'Добавляем музыку' : 'Добавить музыку'} onClick={addMusic} disabled={busy}>
          <Plus size={18} /><span>{busy ? 'Добавляем…' : 'Добавить музыку'}</span>
        </button>
        <div className={`local-status${page === 'vk' ? ' online-status' : ''}`}><span className="local-status-dot" />
          {page === 'vk' ? <div>Онлайн-источник<small>Официальный плеер VK</small></div> : <div>Локальный режим<small>Без аккаунта и загрузок в сеть</small></div>}
        </div>
      </div>
    </aside>
  );
}
