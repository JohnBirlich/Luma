import { useEffect, useState } from 'react';
import { useText } from '../i18n/context';
import { formatTime } from '../shared/media';
import { SLEEP_MINUTES, sleepSecondsLeft } from '../shared/sleep-timer';
import type { SleepMinutes } from '../shared/sleep-timer';

export function SleepTimer({ deadline, change }: { deadline?: number; change(minutes?: SleepMinutes): void }) {
  const t = useText();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (deadline === undefined) return;
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return <div className="setting-row sleep-timer">
    <div><strong>{t('Таймер сна')}</strong><small>{deadline === undefined ? t('Поставит музыку на паузу через выбранное время.')
      : t('До паузы: {0}', formatTime(sleepSecondsLeft(deadline, now)))}</small></div>
    <div className="settings-actions" role="group" aria-label={t('Таймер сна')}>
      {deadline === undefined ? SLEEP_MINUTES.map((minutes) => <button key={minutes} type="button" className="button outline-button" onClick={() => change(minutes)}>{t('{0} мин', minutes)}</button>)
        : <button type="button" className="button outline-button" onClick={() => change()}>{t('Отменить таймер')}</button>}
    </div>
  </div>;
}
