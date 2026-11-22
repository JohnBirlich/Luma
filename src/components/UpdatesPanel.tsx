import { useEffect, useState } from 'react';
import { ArrowUpCircle, RotateCw } from 'lucide-react';
import { useText } from '../i18n/context';
import type { InstallResult, UpdateReport } from '../shared/release-updates';
import { ReleaseLink } from './About';

const installStatus = {
  started: 'Установщик запущен. Luma закроется для обновления.', cancelled: 'Установка отменена.', unavailable: 'Это обновление больше не доступно. Проверьте релизы.',
  signature: 'Подпись установщика или установленной версии не прошла проверку. Ничего не запущено.',
  failed: 'Не удалось скачать, проверить или запустить обновление.',
} satisfies Record<InstallResult, string>;

export function UpdatesPanel() {
  const t = useText();
  const updates = window.luma?.updates;
  const [attempt, setAttempt] = useState(0);
  const [report, setReport] = useState<UpdateReport>();
  const [status, setStatus] = useState<InstallResult>();
  const [installing, setInstalling] = useState(false);
  useEffect(() => {
    if (!updates) return;
    let active = true;
    void updates.check().then((result) => { if (active) setReport(result); }, () => {
      if (active) setReport({ state: 'unavailable', mode: 'manual' });
    });
    return () => { active = false; };
  }, [updates, attempt]);
  const available = report?.state === 'available' ? report : undefined;
  const message = !updates ? 'Обновление доступно в приложении Windows.' : !report ? 'Проверяем релизы GitHub…'
    : available ? 'Доступна версия {0}.' : report.state === 'current' ? 'Установлена актуальная версия.' : 'Не удалось проверить релизы GitHub.';
  return <div className="update-status">
    <p role="status">{t(message, available?.version ?? '')}</p>
    {available && (available.mode !== 'signed' ? <p>{t(available.mode === 'portable'
      ? 'Portable обновляется вручную: скачайте новый portable-файл со страницы релиза.'
      : 'Установка из приложения доступна только для подписанных сборок. Скачайте обновление со страницы релиза.')}</p> :
      <button className="button primary-button" type="button" disabled={installing} onClick={() => {
        if (!updates) return;
        setInstalling(true); setStatus(undefined);
        void updates.install(available.version).then(setStatus, () => setStatus('failed')).finally(() => setInstalling(false));
      }}><ArrowUpCircle size={16} />{t(installing ? 'Скачиваем и проверяем…' : 'Скачать и установить')}</button>)}
    {status && <p role="status">{t(installStatus[status])}</p>}
    <div className="settings-actions">
      {updates && <button type="button" className="button outline-button" disabled={!report || installing} onClick={() => { setReport(undefined); setStatus(undefined); setAttempt(attempt + 1); }}><RotateCw size={15} />{t('Проверить обновления')}</button>}
      <ReleaseLink className="button outline-button" />
    </div>
  </div>;
}
