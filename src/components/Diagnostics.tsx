import { memo, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, Bug, Copy, Monitor, Radio, Terminal, Trash2 } from 'lucide-react';
import { clearDiagnostics, getDiagnostics, saveDiagnostics, subscribeDiagnostics } from '../data/diagnostics';
import { diagnosticsReport, displayValues, LOG_AREAS, LOG_EVENTS, LOG_LEVELS, MAX_LOG_ENTRIES } from '../shared/diagnostics';
import { runtimeMode } from '../shared/app-info';
import type { DiagnosticSnapshot, LogArea } from '../shared/diagnostics';

const storageLabel = { file: 'Файл в профиле Luma', browser: 'Хранилище браузера', session: 'Только пока открыто приложение' } as const;

export const DiagnosticsPage = memo(function DiagnosticsPage({ back, locale }: { back(): void; locale: string }) {
  const [snapshot, setSnapshot] = useState<DiagnosticSnapshot>();
  const [area, setArea] = useState<LogArea | 'all'>('all');
  const [problems, setProblems] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    let active = true;
    let revision = 0;
    let frame = 0;
    const refresh = () => {
      const request = ++revision;
      void getDiagnostics().then((data) => {
        if (active && request === revision) setSnapshot(data);
      }).catch(() => { if (active) setStatus('Не удалось прочитать журнал.'); });
    };
    const unsubscribe = subscribeDiagnostics(() => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh(); });
    });
    refresh();
    return () => { active = false; cancelAnimationFrame(frame); unsubscribe(); };
  }, []);

  const rows = useMemo(() => snapshot?.entries.filter(({ event }) => {
    const [, group, level] = LOG_EVENTS[event];
    return (area === 'all' || area === group) && (!problems || level !== 'info');
  }).reverse() ?? [], [snapshot, area, problems]);

  async function action(kind: 'clear' | 'save' | 'copy') {
    if (!snapshot || working) return;
    setWorking(true);
    setStatus('');
    try {
      if (kind === 'clear') {
        setSnapshot(await clearDiagnostics());
        setConfirm(false);
        setStatus('Журнал очищен.');
      } else if (kind === 'save') {
        if (await saveDiagnostics()) setStatus('Отчёт сохранён.');
      } else {
        const text = diagnosticsReport(snapshot);
        try { await navigator.clipboard.writeText(text); }
        catch {
          const copy = document.createElement('textarea');
          copy.value = text;
          copy.className = 'diagnostic-copy-buffer';
          const previous = document.activeElement;
          document.body.append(copy);
          copy.select();
          try { if (!document.execCommand('copy')) throw new Error('Clipboard unavailable'); }
          finally { copy.remove(); if (previous instanceof HTMLElement) previous.focus(); }
        }
        setStatus('Отчёт скопирован.');
      }
    } catch { setStatus('Не удалось выполнить действие. Попробуйте сохранить отчёт в файл.'); }
    finally { setWorking(false); }
  }

  const localTime = useMemo(() => new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }), [locale]);
  const system = snapshot?.environment;
  return <div className="page diagnostic-page">
    <header className="page-header settings-header">
      <button type="button" className="icon-button settings-back" onClick={back} title="Назад" aria-label="Назад в меню"><ArrowLeft size={19} /></button>
      <div><p className="overline page-kicker"><span />Инструменты Luma</p><h1>Диагностика</h1></div>
      <span className="diagnostic-badge"><Bug size={13} /> Debug</span>
    </header>
    <p className="diagnostic-intro">Журнал запуска, загрузки, подключения к VK и локального воспроизведения.</p>
    {system && snapshot && <section className="diagnostic-system" aria-label="Сведения о приложении">
      <div><div className="diagnostic-system-icon"><Terminal size={18} /></div><span><small>Версия Luma</small><strong>{system.version}</strong><span>{runtimeMode[system.mode]}</span></span></div>
      <div><div className="diagnostic-system-icon"><Monitor size={18} /></div><span><small>Система</small><strong>{system.system}</strong><span>{system.runtime}</span></span></div>
      <div><div className="diagnostic-system-icon"><Radio size={18} /></div><span><small>Подключение</small><strong>{system.online ? 'Устройство в сети' : 'Устройство вне сети'}</strong><span>{storageLabel[snapshot.storage]}</span></span></div>
    </section>}
    <section className="journal" aria-label="Журнал приложения">
      <header className="journal-header">
        <div><h2>Журнал событий</h2><p>{snapshot ? `Показано ${rows.length} из ${snapshot.entries.length}` : 'Читаем журнал…'}</p></div>
        <div className="journal-actions">
          <button className="button outline-button" type="button" disabled={!snapshot || working} onClick={() => void action('save')} aria-label="Сохранить журнал" title="Сохранить .log"><ArrowDownToLine size={16} /><span>Сохранить .log</span></button>
          <button className="icon-button" type="button" disabled={!snapshot || working} onClick={() => void action('copy')} aria-label="Скопировать отчёт" title="Скопировать отчёт"><Copy size={16} /></button>
          <button className="icon-button" type="button" disabled={!snapshot?.entries.length || working} onClick={() => setConfirm(!confirm)} aria-label="Очистить журнал" title="Очистить журнал" aria-expanded={confirm}><Trash2 size={16} /></button>
        </div>
      </header>
      {confirm && <div className="journal-confirm"><span>Удалить все записи журнала? Медиатека и настройки не изменятся.</span><button className="text-button" type="button" onClick={() => void action('clear')} disabled={working}>Удалить записи</button><button className="text-button" type="button" onClick={() => setConfirm(false)}>Отмена</button></div>}
      <div className="journal-filter">
        <label><span>Раздел</span><select value={area} onChange={(event) => setArea(event.currentTarget.value as LogArea | 'all')}>
          <option value="all">Все события</option>
          {Object.entries(LOG_AREAS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </select></label>
        <button className="button outline-button" type="button" aria-pressed={problems} onClick={() => setProblems(!problems)}>Только сбои</button>
      </div>
      {!!rows.length && <ol className="journal-entries" aria-label="События, новые сверху">
        {rows.map((item, index) => {
          const [, group, level, text] = LOG_EVENTS[item.event];
          const values = displayValues(item);
          return <li key={`${item.at}-${item.event}-${snapshot!.entries.length - index}`} className={`journal-entry level-${level}`}>
            <time dateTime={new Date(item.at).toISOString()}>{localTime.format(item.at)}</time>
            <span className="journal-level">{LOG_LEVELS[level]}</span>
            <div><strong>{text}</strong><small>{[LOG_AREAS[group], ...values].join(' · ')}</small></div>
          </li>;
        })}
      </ol>}
      {snapshot && !rows.length && <p className="journal-empty">{snapshot.entries.length ? 'Нет событий с выбранными фильтрами.' : 'Записей пока нет. Новые события появятся здесь автоматически.'}</p>}
    </section>
    <p className="diagnostic-note">Храним последние {MAX_LOG_ENTRIES} событий локально. Без имён треков, путей, ссылок и токенов. Экспортируются все записи, не только отфильтрованные.</p>
    <div className="diagnostic-action-status" role="status">{status}</div>
  </div>;
});
