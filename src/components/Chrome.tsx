import { useEffect, useState } from 'react';
import { AudioLines, Disc3, LayoutGrid, Minus, Plus, Radio, Settings2, SlidersHorizontal, Square, X, Copy } from 'lucide-react';

export type Page = 'player' | 'library' | 'vk' | 'settings';

export function TitleBar({ openSettings, settingsActive }: { openSettings(): void; settingsActive: boolean }) {
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
        <button type="button" className="icon-button title-settings" onClick={openSettings} aria-current={settingsActive ? 'page' : undefined}
          aria-label="Настройки" title="Настройки (Ctrl+,)"><Settings2 size={17} /></button>
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

interface SidebarProps {
  page: Page;
  navigate(page: Page): void;
  openEqualizer(): void;
  eqEnabled: boolean;
  addMusic(): void;
  busy: boolean;
  count: number;
}

export function Sidebar({ page, navigate, openEqualizer, eqEnabled, addMusic, busy, count }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Навигация">
      <nav className="navigation" aria-label="Разделы плеера">
        <div className="nav-group">
          <p className="overline nav-label">Библиотека</p>
          <button type="button" className="nav-item" aria-current={page === 'player' ? 'page' : undefined} onClick={() => navigate('player')} aria-label="Сейчас играет">
            <Disc3 size={18} /><span className="nav-long">Сейчас играет</span><span className="nav-short" aria-hidden="true">Плеер</span>
          </button>
          <button type="button" className="nav-item" aria-current={page === 'library' ? 'page' : undefined} onClick={() => navigate('library')} aria-label="Моя музыка">
            <LayoutGrid size={17} /><span className="nav-long">Моя музыка</span><span className="nav-short" aria-hidden="true">Файлы</span><small className="nav-count">{count}</small>
          </button>
          <button type="button" className="nav-item nav-vk" aria-current={page === 'vk' ? 'page' : undefined} onClick={() => navigate('vk')}>
            <Radio size={18} /><span>VK Музыка</span>
          </button>
        </div>
        <div className="nav-group sound-group">
          <p className="overline nav-label">Плеер</p>
          <button type="button" className="nav-item" onClick={openEqualizer} aria-haspopup="dialog" disabled={page === 'vk'} title={page === 'vk' ? 'Эквалайзер работает только с локальными треками' : undefined}>
            <SlidersHorizontal size={17} /><span>Эквалайзер</span>{eqEnabled && <i className="enabled-dot" />}
          </button>
          <button type="button" className="nav-item" onClick={() => navigate('settings')} title="Настройки (Ctrl+,)" aria-current={page === 'settings' ? 'page' : undefined}>
            <Settings2 size={17} /><span>Настройки</span>
          </button>
        </div>
      </nav>
      <div className="sidebar-footer">
        <button type="button" className="button add-button" title="Добавить музыку (Ctrl+O)" aria-label={busy ? 'Добавляем музыку' : 'Добавить музыку'} onClick={addMusic} disabled={busy}>
          <Plus size={18} /><span className="add-label">{busy ? 'Добавляем…' : 'Добавить музыку'}</span><span className="add-label-short" aria-hidden="true">{busy ? '…' : 'Добавить'}</span>
        </button>
        <div className={`local-status${page === 'vk' ? ' online-status' : ''}`}><span className="local-status-dot" />
          {page === 'vk' ? <div>Онлайн-источник<small>Воспроизведение через VK</small></div> : <div>Локальный режим<small>Без аккаунта и загрузок в сеть</small></div>}
        </div>
      </div>
    </aside>
  );
}
