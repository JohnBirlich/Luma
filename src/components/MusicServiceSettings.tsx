import { useRef, useState } from 'react';
import { ArrowUpRight, KeyRound } from 'lucide-react';
import { useMusicServiceStatus } from '../data/music-services';
import { useText } from '../i18n/context';
import { LISTENBRAINZ_ABOUT, MUSIC_SERVICE_GUIDES, serviceCredential } from '../shared/music-services';
import type { CredentialService, MusicServiceIssue, MusicServiceStatus } from '../shared/music-services';
import { SourceLink } from './OnlineMusic';

const labels = {
  jamendo: ['Jamendo · напрямую', 'Client ID Jamendo', 'Получить Client ID', 'После настройки обычный онлайн-поиск сравнивает Jamendo с Openverse. Только полные потоки текущей сессии, без скачивания и офлайна.'],
  genius: ['Genius', 'Токен приложения Genius', 'Получить токен приложения', 'Поиск песни и аннотации в редакторе данных трека. Не источник аудио или текста для караоке.'],
  listenbrainz: ['ListenBrainz', 'Личный токен ListenBrainz', 'Найти личный токен', 'Только прослушивания локальных треков: не менее половины записи или четырёх минут. Название, исполнитель, альбом, длительность и время начала будут публичными.'],
} as const;
const issues: Record<MusicServiceIssue, string> = {
  credentials: 'Проверьте формат ключа или токена.', rejected: 'Сервис не принял запрос. Проверьте токен и подключите аккаунт снова.',
  offline: 'Не удалось связаться с сервисом. Повторите попытку позже.', storage: 'Не удалось обновить защищённое хранилище.',
  rate: 'Сервис временно ограничил число запросов. Повторите попытку позже.', busy: 'Дождитесь завершения настройки другого сервиса.',
};

export function MusicServiceSettings({ service, connected }: { service: CredentialService; connected: boolean }) {
  const t = useText();
  const { bridge, status, setStatus } = useMusicServiceStatus(service);
  const [name, fieldName, guide, detail] = labels[service];
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  const [editing, setEditing] = useState(false);
  const lock = useRef(false);
  const listens = service === 'listenbrainz';
  const issue = failure ? 'offline' : status?.issue;
  const revokeHint = 'Отправка сейчас отключена, но запись настроек не удалась. Чтобы исключить отправку после перезапуска, отзовите токен на сайте ListenBrainz.';

  async function run(action: () => Promise<MusicServiceStatus>, closeForm = false) {
    if (lock.current) return;
    lock.current = true; setFailure(false); setBusy(true);
    try {
      const next = await action();
      setStatus(next);
      if (closeForm && !next.issue) { setValue(''); setEditing(false); }
    } catch { setFailure(true); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="settings-service music-service" aria-label={t(name)}>
    <header><h3>{t(name)}</h3><span className="setting-status">{!bridge ? t('В приложении Windows')
      : status?.configured ? status.user ?? t('Настроено') : status ? t('Не настроено') : t('Проверяем…')}</span></header>
    <p>{t(detail)}</p>
    {bridge && <>
      <div className="music-service-links"><SourceLink url={MUSIC_SERVICE_GUIDES[service]}>{t(guide)} <ArrowUpRight size={12} /></SourceLink>
        {listens && <SourceLink url={LISTENBRAINZ_ABOUT}>{t('Публичная история ListenBrainz')} <ArrowUpRight size={12} /></SourceLink>}</div>
      {status && !status.persistent && <p className="music-service-note">{t('Защищённое хранилище недоступно: ключ и настройки действуют только до закрытия Luma.')}</p>}
      {status && (!status.configured || editing) && <form className="music-service-form" autoComplete="off" onSubmit={(event) => {
        event.preventDefault();
        if (!serviceCredential(service, value) || (listens && !connected)) return;
        void run(() => bridge.configure(service, value), true);
      }}>
        <label>{t(fieldName)}<input type="password" autoComplete="new-password" spellCheck={false} maxLength={256} required value={value}
          disabled={busy} onChange={(event) => setValue(event.currentTarget.value)} /></label>
        <button type="submit" className="button outline-button" disabled={busy || !serviceCredential(service, value) || (listens && !connected)}>
          <KeyRound size={15} />{t(busy ? 'Проверяем…' : listens ? 'Подключить ListenBrainz' : 'Сохранить ключ')}
        </button>
      </form>}
      {listens && status?.configured && <label className="music-service-consent"><input type="checkbox" disabled={busy} checked={status.enabled}
        onChange={(event) => { const enabled = event.currentTarget.checked; void run(() => bridge.enableListens(enabled)); }} />
        <span>{t('Отправлять прослушивания в ListenBrainz')}</span></label>}
      {status?.configured && <div className="settings-actions">
        <button type="button" className="button ghost-button" disabled={busy} onClick={() => { setValue(''); setEditing(!editing); }}>{t(editing ? 'Отмена' : 'Заменить ключ')}</button>
        <button type="button" className="button ghost-button" disabled={busy} onClick={() => { void run(() => bridge.remove(service), true); }}>{t('Удалить ключ')}</button>
      </div>}
      {issue && <p className="lastfm-issue" role="status">{t(listens && issue === 'storage' && status?.configured && !status.enabled ? revokeHint : issues[issue])}</p>}
    </>}
  </section>;
}
