import { useEffect, useMemo, useState } from 'react';
import { ArrowUpCircle, Download, FolderOpen, History, RotateCw, X } from 'lucide-react';
import { useText } from '../i18n/context';
import type { InstallResult, ReleaseHistoryEntry, UpdateDownloadState, UpdateReport } from '../shared/release-updates';
import { ReleaseLink } from './About';

const installMessages = {
  started: 'Установщик запущен. Luma закроется для обновления.', cancelled: 'Установка отменена.', unavailable: 'Это обновление больше не доступно. Проверьте релизы.',
  signature: 'Подпись установщика или установленной версии не прошла проверку. Ничего не запущено.',
  failed: 'Не удалось скачать, проверить или запустить обновление.',
} satisfies Record<InstallResult, string>;

const downloadMessages = {
  preparing: 'Подготавливаем загрузку версии {0}…', verifying: 'Проверяем размер и SHA-256 файла…',
  saved: 'Версия {0} скачана в «Загрузки». Для обновления закройте Luma и запустите скачанный файл вручную.',
  cancelled: 'Загрузка отменена.', unavailable: installMessages.unavailable,
  failed: 'Не удалось скачать или проверить файл. Текущая версия не изменена.',
} satisfies Record<Exclude<UpdateDownloadState['state'], 'idle' | 'downloading'>, string>;

function DownloadStatus({ download }: { download: UpdateDownloadState }) {
  const t = useText();
  if (download.state === 'idle') return null;
  if (download.state !== 'downloading') return <p role="status">{t(downloadMessages[download.state], download.version)}</p>;
  const format = new Intl.NumberFormat(t.language, { maximumFractionDigits: 1 });
  const label = t('Скачано {0} из {1} МБ', format.format(download.received / 1_000_000), format.format(download.bytes / 1_000_000));
  return <div className="update-transfer">
    <p>{label}</p>
    <progress value={download.received} max={download.bytes} aria-label={t('Загрузка новой версии Luma')} aria-valuetext={label} />
  </div>;
}

export function UpdatesPanel() {
  const t = useText();
  const updates = window.luma?.updates;
  const [attempt, setAttempt] = useState(0);
  const [report, setReport] = useState<UpdateReport>();
  const [status, setStatus] = useState<InstallResult>();
  const [installing, setInstalling] = useState(false);
  const [requestingDownload, setRequestingDownload] = useState(false);
  const [download, setDownload] = useState<UpdateDownloadState>({ state: 'idle' });
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ReleaseHistoryEntry[]>();
  useEffect(() => {
    if (!historyOpen || history || !updates) return;
    let active = true;
    void updates.history().then((rows) => { if (active) setHistory(rows); }, () => { if (active) setHistory([]); });
    return () => { active = false; };
  }, [historyOpen, history, updates]);
  const day = useMemo(() => new Intl.DateTimeFormat(t.language, { day: '2-digit', month: 'short', year: 'numeric' }), [t.language]);
  useEffect(() => {
    if (!updates) return;
    let active = true;
    void updates.check().then((result) => { if (active) setReport(result); }, () => {
      if (active) setReport({ state: 'unavailable', mode: 'manual' });
    });
    return () => { active = false; };
  }, [updates, attempt]);
  useEffect(() => {
    if (!updates) return;
    let active = true, received = false;
    const unsubscribe = updates.onDownloadState((state) => {
      received = true;
      if (active) setDownload(state);
    });
    // Subscribe first; a newer progress event must not be replaced by the initial snapshot.
    void updates.downloadState().then((state) => { if (active && !received) setDownload(state); }, () => {});
    return () => { active = false; unsubscribe(); };
  }, [updates]);

  const available = report?.state === 'available' ? report : undefined;
  const signed = available?.mode === 'signed';
  const saved = download.state === 'saved';
  const cancellable = download.state === 'preparing' || download.state === 'downloading';
  const busy = installing || requestingDownload || cancellable || download.state === 'verifying';
  const message = !updates ? 'Обновление доступно в приложении Windows.' : !report ? 'Проверяем релизы GitHub…'
    : available ? 'Доступна версия {0}.' : report.state === 'current' ? 'Установлена актуальная версия.' : 'Не удалось проверить релизы GitHub.';

  return <div className="update-status">
    <p role="status">{t(message, available?.version ?? '')}</p>
    {available && !available.downloadable && <p>{t(available.mode === 'development'
      ? 'Скачайте обновление со страницы релиза.' : 'У файла нет проверяемой контрольной суммы. Откройте страницу релиза.')}</p>}
    <DownloadStatus download={download} />
    {status && <p role="status">{t(installMessages[status])}</p>}
    {error && download.state !== 'unavailable' && <p role="status">{t(error)}</p>}
    <div className="settings-actions">
      {updates && available && signed && <button className="button primary-button" type="button" disabled={busy} onClick={() => {
        setInstalling(true); setStatus(undefined); setError('');
        void updates.install(available.version).then(setStatus, () => setStatus('failed')).finally(() => setInstalling(false));
      }}><ArrowUpCircle size={16} />{t(installing ? 'Скачиваем и проверяем…' : 'Скачать и установить')}</button>}
      {updates && available?.downloadable && !signed && !(saved && download.version === available.version) &&
        <button className="button primary-button" type="button" data-update-download disabled={busy} onClick={() => {
          setRequestingDownload(true); setStatus(undefined); setError('');
          void updates.download(available.version).then((result) => {
            if (result === 'unavailable') setError(downloadMessages.unavailable);
          }, () => setError(downloadMessages.failed)).finally(() => setRequestingDownload(false));
        }}><Download size={16} />{t(available.mode === 'portable' ? 'Скачать Portable {0}' : 'Скачать Setup {0}', available.version)}</button>}
      {updates && cancellable && <button className="button outline-button" type="button" onClick={() => {
        void updates.cancelDownload().catch(() => setError('Не удалось отменить загрузку.'));
      }}><X size={15} />{t('Отменить скачивание')}</button>}
      {updates && saved && <button className="button primary-button" type="button" onClick={() => {
        setError('');
        const failed = () => setError('Не удалось открыть папку обновления. Возможно, файл перемещён.');
        void updates.revealDownload().then((ok) => { if (!ok) failed(); }, failed);
      }}><FolderOpen size={16} />{t('Открыть папку')}</button>}
      {updates && <button type="button" className="button outline-button" disabled={!report || busy} onClick={() => {
        setReport(undefined); setStatus(undefined); setError(''); setAttempt((n) => n + 1);
      }}><RotateCw size={15} />{t('Проверить обновления')}</button>}
      {updates && <button type="button" className="button outline-button" aria-expanded={historyOpen} aria-controls={historyOpen ? 'update-history' : undefined}
        onClick={() => setHistoryOpen(!historyOpen)}><History size={15} />{t('История обновлений')}</button>}
      <ReleaseLink className="button outline-button" />
    </div>
    {historyOpen && <div className="update-history" id="update-history">
      {!history ? <p role="status">{t('Читаем историю релизов…')}</p>
        : !history.length ? <p role="status">{t('Не удалось получить историю. Откройте релизы Luma.')}</p>
        : <ol className="update-history-list">{history.map((entry) => <li key={entry.version}>
          <div className="update-history-head"><strong>{t('Версия {0}', entry.version)}</strong>
            {entry.publishedAt && <time dateTime={entry.publishedAt}>{day.format(new Date(entry.publishedAt))}</time>}</div>
          {entry.notes && <p>{entry.notes}</p>}
        </li>)}</ol>}
    </div>}
  </div>;
}
