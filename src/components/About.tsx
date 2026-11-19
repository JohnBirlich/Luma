import { useText } from '../i18n/context';
import { useEffect, useState } from 'react';
import { ArrowUpRight, AudioLines, FolderClosed, ShieldCheck } from 'lucide-react';
import { getAppInfo } from '../data/app-info';
import { RELEASES_URL, runtimeMode } from '../shared/app-info';
import type { AppInfo } from '../shared/app-info';

export function useInstalledBuild() {
  const [info, setInfo] = useState<AppInfo | null>();
  useEffect(() => {
    let active = true;
    void getAppInfo().then((data) => { if (active) setInfo(data); }, () => { if (active) setInfo(null); });
    return () => { active = false; };
  }, []);
  return info;
}

export function ReleaseLink({ className = 'text-button' }: { className?: string }) {
  const t = useText();
  const [failed, setFailed] = useState(false);
  return <>
    <a className={className} href={RELEASES_URL} target="_blank" rel="noopener noreferrer" onClick={(event) => {
      if (!window.luma) return;
      event.preventDefault();
      setFailed(false);
      void window.luma.openReleases().catch(() => setFailed(true));
    }}>{t("Релизы Luma")}{" "}<ArrowUpRight size={15} /></a>
    {failed && <span className="setting-hint" role="status">{t("Не удалось открыть страницу релизов.")}</span>}
  </>;
}

export function About() {
  const t = useText();
  const info = useInstalledBuild();

  return <>
    <section className="menu-profile about-identity" aria-label={t("Версия и сведения о Luma Player")}>
      <div className="menu-profile-logo"><AudioLines size={29} strokeWidth={1.8} /></div>
      <div><h2>Luma Player</h2><p>{t("Музыкальный плеер для Windows с локальной медиатекой.")}</p></div>
      <div className="about-build"><strong>{info ? t("Версия {0}", info.version) : info === null ? t("Версия недоступна") : t("Читаем версию…")}</strong>{info && <span>{t(runtimeMode[info.mode])}</span>}</div>
    </section>
    <section className="menu-about about-description">
      <div><FolderClosed size={18} /><div><h2>{t("Своя музыка, даже без сети")}</h2><p>{t("Слушайте файлы с устройства, собирайте очередь и избранное, настраивайте эквалайзер и экран «Сейчас играет».")}</p></div></div>
      <div><ShieldCheck size={18} /><div><h2>{t("Ваши данные остаются у вас")}</h2><p>{t("Локальная медиатека, обложки и настройки не отправляются на сервер. Для VK используются официальный сайт и виджет. Luma не запрашивает пароль или токен VK.")}</p></div></div>
      <footer><span>{t("Открытый исходный код · GPL‑3.0")}</span>
        <ReleaseLink />
      </footer>
    </section>
  </>;
}
