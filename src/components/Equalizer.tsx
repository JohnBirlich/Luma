import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AudioLines, RotateCcw, X } from 'lucide-react';
import { useText } from '../i18n/context';
import { useVisualMotion } from '../player/useVisualMotion';
import { SPECTRUM_FFT_SIZE } from '../player/useAudio';
import type { ReadSpectrum } from '../player/useAudio';
import { clamp, effectivePreamp, EQ_FILTERS, EQ_MAX_GAIN, EQ_MAX_HZ, EQ_MAX_Q, EQ_MIN_HZ, EQ_MIN_PREAMP, EQ_MIN_Q,
  eqCurve, eqFrequencyGrid, equalizerPreset, filterHz, gainAdjustable, PRESETS, qAdjustable } from '../shared/equalizer';
import type { EqualizerBand, EqualizerSettings, FilterType, Preset } from '../shared/equalizer';
import './equalizer.css';

interface EqualizerProps {
  settings: EqualizerSettings;
  sampleRate: number;
  spectrum: ReadSpectrum;
  live: boolean;
  online: boolean;
  /** VK plays its own audio, outside this graph — say so instead of pretending. */
  vk?: boolean;
  change(settings: EqualizerSettings): void;
  close(): void;
}

const CHART_WIDTH = 760;
const CHART_HEIGHT = 156;
const AXIS_HZ = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const axisHz = (hz: number) => hz >= 1000 ? `${(hz / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(hz));
function xPosition(hz: number, rate: number) {
  return CHART_WIDTH * clamp(Math.log(hz / EQ_MIN_HZ) / Math.log(filterHz(EQ_MAX_HZ, rate) / EQ_MIN_HZ), 0, 1);
}
function yPosition(db: number, scale: number) { return CHART_HEIGHT * (0.5 - clamp(db / scale, -1, 1) / 2); }

/** Read the already-running post-EQ analyser. No additional audio graph or React renders per frame. */
function Spectrum({ read, sampleRate, live }: { read: ReadSpectrum; sampleRate: number; live: boolean }) {
  const path = useRef<SVGPathElement>(null);
  const motion = useVisualMotion(live);
  useEffect(() => {
    const node = path.current;
    if (!node || !motion) return;
    const bins = new Uint8Array(SPECTRUM_FFT_SIZE / 2);
    const columns = eqFrequencyGrid(49, sampleRate).map((hz) => Math.min(bins.length - 1, Math.round(hz * SPECTRUM_FFT_SIZE / sampleRate)));
    let frame = 0, last = 0;
    function draw(time: number) {
      frame = requestAnimationFrame(draw);
      if (!node || time - last < 55) return;
      last = time;
      if (!read(bins)) { node.removeAttribute('d'); return; }
      const step = CHART_WIDTH / (columns.length - 1);
      const commands = columns.slice(0, -1).map((from, index) => {
        let peak = 0;
        for (let bin = from; bin <= columns[index + 1]; bin++) peak = Math.max(peak, bins[bin]);
        const height = Math.round(0.72 * CHART_HEIGHT * (peak / 255) ** 1.45);
        return `M${Math.round(index * step)} ${CHART_HEIGHT}v${-height}h${step - 3}v${height}Z`;
      });
      node.setAttribute('d', commands.join(''));
    }
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); node.removeAttribute('d'); };
  }, [read, sampleRate, motion]);
  return <path className="eq-spectrum" ref={path} />;
}

function Response({ settings, sampleRate, spectrum, live }: Pick<EqualizerProps, 'settings' | 'sampleRate' | 'spectrum' | 'live'>) {
  const t = useText();
  const data = useMemo(() => {
    const frequencies = [...eqFrequencyGrid(241, sampleRate), ...settings.bands.map(({ hz }) => filterHz(hz, sampleRate))].sort((a, b) => a - b);
    const db = eqCurve(settings, sampleRate, frequencies);
    const preamp = effectivePreamp(settings, sampleRate);
    const values = db.map((value) => value + preamp);
    const scale = Math.max(12, Math.ceil(Math.max(...values.map((value) => Math.min(36, Math.abs(value)))) / 6) * 6);
    const points = frequencies.map((hz, i) => `${xPosition(hz, sampleRate).toFixed(1)},${yPosition(values[i], scale).toFixed(1)}`).join(' ');
    return { points, scale };
  }, [sampleRate, settings]);
  const ticks = AXIS_HZ.filter((hz) => hz <= filterHz(EQ_MAX_HZ, sampleRate));
  return <div className="eq-response">
    <div className="eq-response-head"><strong>{t('Частотная характеристика')}</strong>
      <span>{t('Расчёт фильтров')}{live && ` · ${t('Спектр сигнала')}`}</span>
    </div>
    <div className="eq-chart">
      <div className="eq-chart-db" aria-hidden="true"><span>+{data.scale}</span><span>0</span><span>−{data.scale}</span></div>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={t('График частотной характеристики с предусилением')}>
        {ticks.map((hz) => <line className="eq-gridline" key={hz} x1={xPosition(hz, sampleRate)} x2={xPosition(hz, sampleRate)} y1={0} y2={CHART_HEIGHT} />)}
        {[0.25, 0.5, 0.75].map((p) => <line className={`eq-gridline${p === 0.5 ? ' eq-zero' : ''}`} key={p} x1={0} x2={CHART_WIDTH} y1={CHART_HEIGHT * p} y2={CHART_HEIGHT * p} />)}
        <Spectrum read={spectrum} sampleRate={sampleRate} live={live} />
        <polyline className="eq-response-path" points={data.points} />
      </svg>
      <div className="eq-chart-hz" aria-hidden="true">{ticks.filter((_, i) => i % 2 === 0 || i === ticks.length - 1).map((hz) =>
        <span key={hz} style={{ '--position': `${xPosition(hz, sampleRate) / CHART_WIDTH * 100}%` } as CSSProperties}>{axisHz(hz)}</span>)}</div>
    </div>
  </div>;
}

function NumberField({ label, value, min, max, step, set, disabled }: {
  label: string; value: number; min: number; max: number; step: number; set(value: number): void; disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string>();
  const skip = useRef(false);
  return <label className="eq-number"><span>{label}</span><input type="number" value={draft ?? value} min={min} max={max} step={step} disabled={disabled}
    onChange={(event) => setDraft(event.currentTarget.value)} onBlur={() => {
      if (!skip.current && draft?.trim() && Number.isFinite(Number(draft))) set(clamp(Number(draft), min, max));
      skip.current = false; setDraft(undefined);
    }} onKeyDown={(event) => {
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === 'Escape' && draft !== undefined) { event.preventDefault(); skip.current = true; event.currentTarget.blur(); }
    }} /></label>;
}

export function Equalizer({ settings, sampleRate, spectrum, live, online, vk, change, close }: EqualizerProps) {
  const t = useText();
  const [selected, setSelected] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);
  const format = useMemo(() => new Intl.NumberFormat(t.language, { maximumFractionDigits: 1 }), [t.language]);
  const db = (value: number) => {
    const display = Math.abs(value) < 0.05 ? 0 : value;
    return `${display > 0 ? '+' : ''}${format.format(display)} ${t('дБ')}`;
  };
  const frequency = (hz: number) => hz >= 1000 ? `${format.format(hz / 1000)} ${t('кГц')}` : `${format.format(hz)} ${t('Гц')}`;
  const preamp = useMemo(() => effectivePreamp(settings, sampleRate), [settings, sampleRate]);
  const activeBand = settings.bands[selected];
  useEffect(() => { ref.current?.showModal(); }, []);
  function dismiss() { ref.current?.close(); close(); }
  function preset(value: Preset) {
    if (value !== 'custom' && Object.hasOwn(PRESETS, value)) change(equalizerPreset(value, true, settings.autoHeadroom));
  }
  function patch(index: number, patch: Partial<EqualizerBand>) {
    change({ ...settings, enabled: true, preset: 'custom', bands: settings.bands.map((entry, i) => i === index ? { ...entry, ...patch } : entry) });
  }
  return <dialog className="equalizer-dialog" ref={ref} aria-labelledby="eq-title" onCancel={(event) => { event.preventDefault(); dismiss(); }}
    onClick={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
    <div className="equalizer-content">
      <header className="dialog-header">
        <div className="dialog-mark"><AudioLines size={23} /></div>
        <div><p className="overline">{t('Параметрический · 10 полос')}</p><h2 id="eq-title">{t('Эквалайзер')}</h2></div>
        <button type="button" className="icon-button" onClick={dismiss} aria-label={t('Закрыть эквалайзер')} title={t('Закрыть')}><X size={20} /></button>
      </header>
      <div className="eq-toolbar">
        <label className="preset-label">{t('Пресет')}<select value={settings.preset} onChange={(event) => preset(event.currentTarget.value as Preset)}>
          {Object.entries(PRESETS).map(([id, data]) => <option value={id} key={id}>{t(data.label)}</option>)}
          <option value="custom" disabled>{t('Пользовательский')}</option>
        </select></label>
        <div className="eq-tools">
          <button type="button" role="switch" aria-checked={settings.autoHeadroom} onClick={() => change({ ...settings, autoHeadroom: !settings.autoHeadroom })} className="eq-switch"
            title={t('Автоматически уменьшает предусиление при подъёме частот. Это не лимитер.')}><span>{t('Автозапас')}</span><i aria-hidden="true" /></button>
          <button type="button" role="switch" aria-checked={settings.enabled} onClick={() => change({ ...settings, enabled: !settings.enabled })} className="eq-switch">
            <span>{t('Эквалайзер')}</span><i aria-hidden="true" /></button>
        </div>
      </div>
      <Response settings={settings} sampleRate={sampleRate} spectrum={spectrum} live={live} />
      <div className="eq-board" aria-label={t('Полосы эквалайзера')} role="group">
        {settings.bands.map(({ hz, type, enabled, gain }, index) => <div className="eq-band" key={index} data-selected={selected === index || undefined} data-bypassed={!enabled || undefined}>
          <output>{gainAdjustable(type) ? db(gain) : '—'}</output>
          <input type="range" min={-EQ_MAX_GAIN} max={EQ_MAX_GAIN} step={0.5} value={gain} disabled={!enabled || !gainAdjustable(type)}
            aria-label={t('Полоса {0}: усиление', index + 1)} aria-valuetext={db(gain)} onFocus={() => setSelected(index)}
            onChange={(event) => patch(index, { gain: event.currentTarget.valueAsNumber })} />
          <button type="button" className="eq-band-choice" onClick={() => setSelected(index)} aria-pressed={selected === index}
            aria-label={t('Настроить полосу {0}', index + 1)} title={frequency(hz)}>{axisHz(hz)}</button>
        </div>)}
      </div>
      <div className="eq-inspector" key={selected}>
        <div className="eq-inspector-heading"><strong>{t('Полоса {0}', selected + 1)}</strong>
          <button type="button" role="switch" className="eq-switch" aria-checked={activeBand.enabled} aria-label={t('Фильтр полосы {0}', selected + 1)}
            onClick={() => patch(selected, { enabled: !activeBand.enabled })}><span>{t('Фильтр')}</span><i aria-hidden="true" /></button></div>
        <label className="eq-type"><span>{t('Тип фильтра')}</span><select value={activeBand.type} onChange={(event) => patch(selected, { type: event.currentTarget.value as FilterType })}>
          {Object.entries(EQ_FILTERS).map(([id, name]) => <option key={id} value={id}>{t(name)}</option>)}
        </select></label>
        <NumberField label={t('Частота, Гц')} value={activeBand.hz} min={EQ_MIN_HZ} max={EQ_MAX_HZ} step={1} set={(hz) => patch(selected, { hz })} />
        <NumberField label={t('Добротность Q')} value={activeBand.q} min={EQ_MIN_Q} max={EQ_MAX_Q} step={0.1} disabled={!qAdjustable(activeBand.type)} set={(q) => patch(selected, { q })} />
        <NumberField label={t('Усиление, дБ')} value={activeBand.gain} min={-EQ_MAX_GAIN} max={EQ_MAX_GAIN} step={0.5} disabled={!gainAdjustable(activeBand.type)} set={(gain) => patch(selected, { gain })} />
      </div>
      <div className="eq-preamp">
        <label htmlFor="preamp">{t('Предусиление')}</label>
        <input id="preamp" type="range" className="range" min={EQ_MIN_PREAMP} max={EQ_MAX_GAIN} step={0.5} value={settings.preamp} aria-valuetext={db(settings.preamp)}
          onChange={(event) => change({ ...settings, enabled: true, preset: 'custom', preamp: event.currentTarget.valueAsNumber })}
          style={{ '--filled': `${(settings.preamp - EQ_MIN_PREAMP) / (EQ_MAX_GAIN - EQ_MIN_PREAMP) * 100}%` } as CSSProperties} />
        <output htmlFor="preamp">{db(settings.preamp)}</output>
      </div>
      <p className="eq-note">{vk ? t('Треки VK воспроизводит сам VK — эквалайзер к ним не применяется, настройки действуют на локальные треки.') : online ? t('Онлайн-поток воспроизводится без обработки.') : !settings.enabled ? t('Обработка выключена. Настройки сохранены.')
        : preamp < settings.preamp - 0.05 ? t('Автозапас снижает предусиление до {0}.', db(preamp)) : t('Применяется к файлам и демотрекам.')}</p>
      <footer className="dialog-footer">
        <button type="button" className="button ghost-button" onClick={() => { change(equalizerPreset('flat', settings.enabled, settings.autoHeadroom)); setSelected(0); }}><RotateCcw size={15} />{t('Сбросить')}</button>
        <button type="button" className="button primary-button" onClick={dismiss}>{t('Готово')}</button>
      </footer>
    </div>
  </dialog>;
}
