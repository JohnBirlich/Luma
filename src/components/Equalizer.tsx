import { useText } from '../i18n/context';
import { useEffect, useRef } from 'react';
import { AudioLines, RotateCcw, X } from 'lucide-react';
import { BANDS, PRESETS } from '../shared/equalizer';
import { formatRussianNumber } from '../shared/russian';
import type { EqualizerSettings, Preset } from '../shared/equalizer';
import type { CSSProperties } from 'react';

interface EqualizerProps {
  settings: EqualizerSettings;
  change(settings: EqualizerSettings): void;
  close(): void;
}

export function Equalizer({ settings, change, close }: EqualizerProps) {
  const t = useText();
  const db = (value: number) => `${value > 0 ? '+' : ''}${t.language === 'en' ? `${value} dB` : `${formatRussianNumber(value)} дБ`}`;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  function dismiss() {
    ref.current?.close();
    close();
  }
  function preset(value: Preset) {
    if (value !== 'custom') change({ ...PRESETS[value], enabled: true, preset: value });
  }
  return (
    <dialog className="equalizer-dialog" ref={ref} aria-labelledby="eq-title" onCancel={(event) => { event.preventDefault(); dismiss(); }}
      onClick={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <div className="equalizer-content">
        <header className="dialog-header">
          <div className="dialog-mark"><AudioLines size={23} /></div>
          <div><p className="overline">{t("Настройки звука")}</p><h2 id="eq-title">{t("Эквалайзер")}</h2></div>
          <button type="button" className="icon-button" onClick={dismiss} aria-label={t("Закрыть эквалайзер")} title={t("Закрыть")}><X size={20} /></button>
        </header>
        <div className="eq-toolbar">
          <label className="preset-label">{t("Пресет")}{" "}<select value={settings.preset} onChange={(event) => preset(event.currentTarget.value as Preset)}>
              {Object.entries(PRESETS).map(([id, data]) => <option value={id} key={id}>{t(data.label)}</option>)}
              <option value="custom" disabled>{t("Пользовательский")}</option>
            </select>
          </label>
          <button type="button" role="switch" aria-checked={settings.enabled} onClick={() => change({ ...settings, enabled: !settings.enabled })} className="eq-switch">
            <span>{t("Эквалайзер")}</span><i aria-hidden="true" />
          </button>
        </div>
        <div className="eq-board">
          <div className="eq-scale" aria-hidden="true"><span>+12</span><span>0</span><span>−12</span></div>
          {BANDS.map(({ hz, label }, index) => (
            <label className="eq-band" key={hz}>
              <output>{db(settings.gains[index])}</output>
              <input type="range" min={-12} max={12} step={1} value={settings.gains[index]} aria-label={t(label)} aria-valuetext={db(settings.gains[index])}
                onChange={(event) => change({ ...settings, enabled: true, preset: 'custom', gains: settings.gains.map((gain, i) => i === index ? event.currentTarget.valueAsNumber : gain) })} />
              <span>{t(label)}</span>
            </label>
          ))}
        </div>
        <div className="eq-preamp">
          <label htmlFor="preamp">{t("Предусиление")}</label>
          <input id="preamp" type="range" className="range" min={-12} max={12} step={0.5} value={settings.preamp} aria-valuetext={db(settings.preamp)}
            onChange={(event) => change({ ...settings, enabled: true, preset: 'custom', preamp: event.currentTarget.valueAsNumber })}
            style={{ '--filled': `${(settings.preamp + 12) / 24 * 100}%` } as CSSProperties} />
          <output htmlFor="preamp">{db(settings.preamp)}</output>
        </div>
        <footer className="dialog-footer">
          <button type="button" className="button ghost-button" onClick={() => change({ ...PRESETS.flat, enabled: settings.enabled, preset: 'flat' })}><RotateCcw size={15} />{" "}{t("Сбросить")}</button>
          <button type="button" className="button primary-button" onClick={dismiss}>{t("Готово")}</button>
        </footer>
      </div>
    </dialog>
  );
}
