import { useEffect, useState } from 'react';
import { useText } from '../i18n/context';
import { discordClientId } from '../shared/discord-presence';
import type { DiscordPreferences, DiscordStatus } from '../shared/discord-presence';

const statusText = {
  off: 'Выключено', waiting: 'Ожидаем локальный Discord. Запустите клиент и включите показ активности в Discord.',
  connected: 'Подключено к локальному Discord.', unsupported: 'Доступно в приложении Windows.',
} as const;

export function DiscordSettings({ options, change }: { options: DiscordPreferences; change(value: DiscordPreferences): void }) {
  const t = useText();
  const [id, setId] = useState(options.clientId);
  const bridge = window.luma?.discord;
  const [status, setStatus] = useState<DiscordStatus>(bridge ? 'off' : 'unsupported');
  useEffect(() => {
    if (!bridge) return;
    let active = true;
    const stop = bridge.onChange(setStatus);
    void bridge.status().then((value) => { if (active) setStatus(value); }, () => {});
    return () => { active = false; stop(); };
  }, [bridge]);
  return <>
    <p className="setting-body-copy">{t('По вашему разрешению Luma отправит название и исполнителя текущего трека локальному клиенту Discord. Пути к файлам и история не передаются.')}</p>
    <form className="discord-form" onSubmit={(event) => {
      event.preventDefault();
      const clientId = discordClientId(id.trim());
      if (clientId) change({ clientId, enabled: true });
    }}>
      <label className="playlist-import-field">{t('Публичный Discord Application ID')}
        <input type="text" inputMode="numeric" autoComplete="off" maxLength={20} value={id} disabled={!bridge || options.enabled} onChange={(event) => setId(event.currentTarget.value)} /></label>
      {options.enabled ? <button type="button" className="button outline-button" onClick={() => change({ ...options, enabled: false })}>{t('Выключить Discord')}</button>
        : <button type="submit" className="button outline-button" disabled={!bridge || status === 'unsupported' || !discordClientId(id.trim())}>{t('Включить Discord')}</button>}
    </form>
    <p className="setting-body-copy" role="status">{t(statusText[status])}</p>
  </>;
}
