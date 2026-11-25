import { useText } from '../i18n/context';
import { memo, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, Bug, Copy, Monitor, Radio, Terminal, Trash2 } from 'lucide-react';
import { clearDiagnostics, getDiagnostics, saveDiagnostics, subscribeDiagnostics } from '../data/diagnostics';
import { refreshConnection, useConnectionPhase } from '../data/network';
import { diagnosticSystem, diagnosticsReport, displayValues, JOURNAL_VISIBLE, LOG_AREAS, LOG_EVENTS, LOG_LEVELS } from '../shared/diagnostics';
import { runtimeMode } from '../shared/app-info';
import type { DiagnosticSnapshot, LogArea, LogLevel } from '../shared/diagnostics';

const storageLabel = { file: 'Файл в профиле Luma', browser: 'Хранилище браузера', session: 'Только пока открыто приложение' } as const;

export const DiagnosticsPage = memo(function DiagnosticsPage({ back, locale }: { back(): void; locale: string }) {
  const t = useText();
  const [snapshot, setSnapshot] = useState<DiagnosticSnapshot>();
  const [area, setArea] = useState<LogArea | 'all'>('all');
  const [level, setLevel] = useState<LogLevel | 'all' | 'problems'>('all');
  const [confirm, setConfirm] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('');
  const connection = useConnectionPhase();
  useEffect(() => { void refreshConnection(); }, []);
  useEffect(() => {
    let active = true;
    let revision = 0;
    let frame = 0;
    const refresh = () => {
      const request = ++revision;
      void getDiagnostics().then((data) => {
        if (active && request === revision) setSnapshot(data);
      }).catch(() => { if (active) setStatus("Не удалось прочитать журнал."); });
    };
    const unsubscribe = subscribeDiagnostics(() => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh(); });
    });
    refresh();
    return () => { active = false; cancelAnimationFrame(frame); unsubscribe(); };
  }, []);

  // Only the newest slice is shown, however long the journal file on disk grows.
  const rows = useMemo(() => (snapshot?.entries ?? []).filter(({ event }) => {
    const [, group, severity] = LOG_EVENTS[event];
    const levelMatch = level === 'all' || (level === 'problems' ? severity !== 'info' : severity === level);
    return (area === 'all' || area === group) && levelMatch;
  }).reverse().slice(0, JOURNAL_VISIBLE), [snapshot, area, level]);

  async function action(kind: 'clear' | 'save' | 'copy') {
    if (!snapshot || working) return;
    setWorking(true);
    setStatus('');
    try {
      if (kind === 'clear') {
        setSnapshot(await clearDiagnostics());
        setConfirm(false);
        setStatus("Журнал очищен.");
      } else if (kind === 'save') {
        if (await saveDiagnostics(t)) setStatus("Отчёт сохранён.");
      } else {
        const text = diagnosticsReport(snapshot, t);
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
        setStatus("Отчёт скопирован.");
      }
    } catch { setStatus("Не удалось выполнить действие. Попробуйте сохранить отчёт в файл."); }
    finally { setWorking(false); }
  }

  const localTime = useMemo(() => new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }), [locale]);
  const system = snapshot?.environment;
  return <div className="page diagnostic-page">
    <header className="page-header settings-header">
      <button type="button" className="icon-button settings-back" onClick={back} title={t("Назад")} aria-label={t("Назад в меню")}><ArrowLeft size={19} /></button>
      <div><p className="overline page-kicker"><span />{t("Инструменты Luma")}</p><h1>{t("Диагностика")}</h1></div>
      <span className="diagnostic-badge"><Bug size={13} /> Debug</span>
    </header>
    <p className="diagnostic-intro">{t("Журнал запуска, подключения к сети, импорта и воспроизведения.")}</p>
    {system && snapshot && <section className="diagnostic-system" aria-label={t("Сведения о приложении")}>
      <div><div className="diagnostic-system-icon"><Terminal size={18} /></div><span><small>{t("Версия Luma")}</small><strong>{system.version}</strong><span>{t(runtimeMode[system.mode])}</span></span></div>
      <div><div className="diagnostic-system-icon"><Monitor size={18} /></div><span><small>{t("Система")}</small><strong>{diagnosticSystem(system.system, t)}</strong><span>{t(system.runtime)}</span></span></div>
      <div className={`diagnostic-connection state-${connection}`}><div className="diagnostic-system-icon"><Radio size={18} /></div>
        <span className="diagnostic-connection-body">
          <span className="diagnostic-connection-head"><small>{t("Интернет Соединение")}</small>
            <strong><span className="connection-dot" aria-hidden="true" />{connection === 'checking' ? t("Подключение..") : connection === 'online' ? t("Подключено") : t("Нет Соединения")}</strong></span>
          <span className="diagnostic-connection-note">{t("При отсутствии Интернета некоторые функции могут быть недоступны. Проверьте соединение, если оно недоступно или подключитесь к интернету.")}</span>
        </span></div>
    </section>}
    <section className="journal" aria-label={t("Журнал приложения")}>
      <header className="journal-header">
        <div><h2>{t("Журнал событий")}</h2><p>{snapshot ? `${t("Показано {0} из {1}", rows.length, snapshot.entries.length)} · ${t(storageLabel[snapshot.storage])}` : t("Читаем журнал…")}</p></div>
        <div className="journal-actions">
          <button className="button outline-button" type="button" disabled={!snapshot || working} onClick={() => void action('save')} aria-label={t("Сохранить журнал")} title={t("Сохранить .log")}><ArrowDownToLine size={16} /><span>{t("Сохранить .log")}</span></button>
          <button className="icon-button" type="button" disabled={!snapshot || working} onClick={() => void action('copy')} aria-label={t("Скопировать отчёт")} title={t("Скопировать отчёт")}><Copy size={16} /></button>
          <button className="icon-button" type="button" disabled={!snapshot?.entries.length || working} onClick={() => setConfirm(!confirm)} aria-label={t("Очистить журнал")} title={t("Очистить журнал")} aria-expanded={confirm}><Trash2 size={16} /></button>
        </div>
      </header>
      {confirm && <div className="journal-confirm"><span>{t("Удалить все записи журнала? Медиатека и настройки не изменятся.")}</span><button className="text-button" type="button" onClick={() => void action('clear')} disabled={working}>{t("Удалить записи")}</button><button className="text-button" type="button" onClick={() => setConfirm(false)}>{t("Отмена")}</button></div>}
      <div className="journal-filter">
        <label><span>{t("Раздел")}</span><select value={area} onChange={(event) => setArea(event.currentTarget.value as LogArea | 'all')}>
          <option value="all">{t("Все события")}</option>
          {Object.entries(LOG_AREAS).map(([key, name]) => <option key={key} value={key}>{t(name)}</option>)}
        </select></label>
        <label><span>{t("Уровень")}</span><select value={level} onChange={(event) => setLevel(event.currentTarget.value as LogLevel | 'all' | 'problems')} aria-label={t("Уровень событий")}>
          <option value="all">{t("Все уровни")}</option>
          {(Object.keys(LOG_LEVELS) as LogLevel[]).map((key) => <option key={key} value={key}>{t(LOG_LEVELS[key])}</option>)}
          <option value="problems">{t("Все сбои")}</option>
        </select></label>
      </div>
      {!!rows.length && <ol className="journal-entries" aria-label={t("События, новые сверху")}>
        {rows.map((item, index) => {
          const [, group, level, text] = LOG_EVENTS[item.event];
          const values = displayValues(item, t);
          return <li key={`${item.at}-${item.event}-${snapshot!.entries.length - index}`} className={`journal-entry level-${level}`}>
            <time dateTime={new Date(item.at).toISOString()}>{localTime.format(item.at)}</time>
            <span className="journal-level">{t(LOG_LEVELS[level])}</span>
            <div><strong>{t(text)}</strong><small>{[t(LOG_AREAS[group]), ...values].join(' · ')}</small></div>
          </li>;
        })}
      </ol>}
      {snapshot && !rows.length && <p className="journal-empty">{snapshot.entries.length ? t("Нет событий с выбранными фильтрами.") : t("Записей пока нет. Новые события появятся здесь автоматически.")}</p>}
    </section>
    <p className="diagnostic-note">{t("Журнал хранится файлом в профиле Luma; на экране видны последние {0} событий. Без имён треков, путей, ссылок и токенов. Экспортируются все записи, не только отфильтрованные.", JOURNAL_VISIBLE)}</p>
    <div className="diagnostic-action-status" role="status">{t(status)}</div>
  </div>;
});
