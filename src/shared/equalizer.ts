export const EQ_FILTERS = { peaking: 'Колоколообразный', lowshelf: 'Низкая полка', highshelf: 'Высокая полка', notch: 'Режекторный' } as const;
export type FilterType = keyof typeof EQ_FILTERS;
export const EQ_MIN_HZ = 20;
export const EQ_MAX_HZ = 20_000;
export const EQ_MIN_Q = 0.2;
export const EQ_MAX_Q = 12;
export const EQ_MAX_GAIN = 12;
export const EQ_MIN_PREAMP = -24;
export const EQ_REFERENCE_RATE = 48_000;
const band = (hz: number, type: FilterType = 'peaking', enabled = true): EqualizerBand => ({ hz, type, q: 0.9, gain: 0, enabled });
const standardBands = () => [band(31, 'lowshelf'), band(62), band(125), band(250), band(500), band(1000), band(2000), band(4000), band(8000), band(16000, 'highshelf')];
export const EQ_BAND_COUNT = 10;

export const PRESETS = {
  flat: { label: 'Ровный', preamp: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  warm: { label: 'Тёплый', preamp: -1, gains: [2, 2.5, 2, 1, 0.5, 0, -0.5, -1, -1.5, -2] },
  bass: { label: 'Больше баса', preamp: -3, gains: [5, 4, 3, 1, 0, -0.5, 0, 0, 0, 1] },
  voice: { label: 'Голос', preamp: -2, gains: [-5, -4, -2, -1, 0, 1, 2.5, 2, 0, -1] },
  bright: { label: 'Ясность', preamp: -2, gains: [-1, -1, -0.5, 0, 0, 0.5, 1, 2, 2.5, 3] },
  soft: { label: 'Мягкие верха', preamp: 0, gains: [0, 0, 0, 0.5, 1, 0.5, 0, -1, -2, -3.5] },
};
export type Preset = keyof typeof PRESETS | 'custom';
export interface EqualizerBand { enabled: boolean; type: FilterType; hz: number; q: number; gain: number }
export interface EqualizerSettings {
  enabled: boolean;
  preset: Preset;
  preamp: number;
  autoHeadroom: boolean;
  bands: EqualizerBand[];
}
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const numeric = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;
const object = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const dbToLinear = (db: number) => 10 ** (db / 20);
export const gainAdjustable = (type: FilterType) => type !== 'notch';
export const qAdjustable = (type: FilterType) => type === 'peaking' || type === 'notch';
export const filterHz = (hz: number, sampleRate: number) => Math.min(hz, 0.49 * sampleRate);

export function equalizerPreset(preset: keyof typeof PRESETS, enabled: boolean, autoHeadroom: boolean): EqualizerSettings {
  const data = PRESETS[preset];
  return { preset, enabled, preamp: data.preamp, autoHeadroom, bands: standardBands().map((entry, index) => ({ ...entry, gain: data.gains[index] })) };
}
export const defaultEqualizer = equalizerPreset('flat', false, true);

export function readEqualizer(value: unknown): EqualizerSettings {
  const data = object(value);
  const preset = typeof data.preset === 'string' && (data.preset === 'custom' || Object.hasOwn(PRESETS, data.preset)) ? data.preset as Preset : 'flat';
  const base = standardBands();
  const saved = Array.isArray(data.bands) ? data.bands : undefined;
  const legacy = !saved && Array.isArray(data.gains) && data.gains.length === 5 ? data.gains : undefined;
  let bands = base;
  if (saved) bands = base.map((fallback, index) => {
    const row = object(saved[index]);
    return { enabled: row.enabled !== false,
      type: typeof row.type === 'string' && Object.hasOwn(EQ_FILTERS, row.type) ? row.type as FilterType : fallback.type,
      hz: numeric(row.hz, fallback.hz, EQ_MIN_HZ, EQ_MAX_HZ), q: numeric(row.q, fallback.q, EQ_MIN_Q, EQ_MAX_Q),
      gain: numeric(row.gain, 0, -EQ_MAX_GAIN, EQ_MAX_GAIN) };
  });
  else if (legacy?.some((gain) => typeof gain === 'number' && Number.isFinite(gain) && gain !== 0)) {
    // Keep the five original frequencies, types and Q exactly. Extra slots start bypassed.
    const migrated = [band(60, 'lowshelf'), band(230), band(910), band(3600), band(14000, 'highshelf')]
      .map((entry, index) => ({ ...entry, gain: numeric(legacy[index], 0, -EQ_MAX_GAIN, EQ_MAX_GAIN) }));
    bands = [migrated[0], band(125, 'peaking', false), migrated[1], band(500, 'peaking', false), migrated[2],
      band(2000, 'peaking', false), migrated[3], band(6400, 'peaking', false), migrated[4], band(18000, 'peaking', false)];
  }
  return { enabled: data.enabled === true, preset, preamp: numeric(data.preamp, 0, EQ_MIN_PREAMP, EQ_MAX_GAIN),
    autoHeadroom: legacy ? false : data.autoHeadroom !== false, bands };
}

type Coefficients = [b0: number, b1: number, b2: number, a0: number, a1: number, a2: number];
// RBJ cookbook coefficients (shelves with slope S=1, as in Web Audio). Used only
// for the transfer curve/headroom; the actual audio goes through Web Audio biquads.
function coefficients({ hz, gain, q, type }: EqualizerBand, rate: number): Coefficients {
  const w = 2 * Math.PI * filterHz(hz, rate) / rate;
  const c = Math.cos(w), s = Math.sin(w);
  const A = 10 ** (gain / 40), alpha = s / (2 * q);
  if (type === 'peaking') return [1 + alpha * A, -2 * c, 1 - alpha * A, 1 + alpha / A, -2 * c, 1 - alpha / A];
  if (type === 'notch') return [1, -2 * c, 1, 1 + alpha, -2 * c, 1 - alpha];
  const plus = A + 1, minus = A - 1, slope = s * Math.sqrt(2 * A);
  if (type === 'lowshelf') return [A * (plus - minus * c + slope), 2 * A * (minus - plus * c), A * (plus - minus * c - slope),
    plus + minus * c + slope, -2 * (minus + plus * c), plus + minus * c - slope];
  return [A * (plus + minus * c + slope), -2 * A * (minus + plus * c), A * (plus + minus * c - slope),
    plus - minus * c + slope, 2 * (minus - plus * c), plus - minus * c - slope];
}

export function eqFrequencyGrid(samples: number, rate = EQ_REFERENCE_RATE) {
  const ratio = filterHz(EQ_MAX_HZ, rate) / EQ_MIN_HZ;
  return Array.from({ length: samples }, (_, index) => EQ_MIN_HZ * ratio ** (index / Math.max(1, samples - 1)));
}

export function eqCurve(settings: EqualizerSettings, rate: number, frequencies: readonly number[]) {
  const filters = settings.enabled ? settings.bands.filter(({ enabled, gain, type }) => enabled && (gain !== 0 || type === 'notch')).map((entry) => coefficients(entry, rate)) : [];
  return frequencies.map((hz) => {
    const angle = 2 * Math.PI * clamp(hz, 0, rate / 2) / rate;
    const c = Math.cos(angle), s = Math.sin(angle), c2 = Math.cos(2 * angle), s2 = Math.sin(2 * angle);
    let db = 0;
    for (const [b0, b1, b2, a0, a1, a2] of filters) {
      const numerator = (b0 + b1 * c + b2 * c2) ** 2 + (b1 * s + b2 * s2) ** 2;
      const denominator = (a0 + a1 * c + a2 * c2) ** 2 + (a1 * s + a2 * s2) ** 2;
      db += 10 * Math.log10(Math.max(1e-10, numerator / Math.max(1e-24, denominator)));
    }
    return db;
  });
}

/** Reduce boost before the filters. This estimates steady-state headroom, not a limiter. */
export function effectivePreamp(settings: EqualizerSettings, rate = EQ_REFERENCE_RATE) {
  if (!settings.enabled) return 0;
  if (!settings.autoHeadroom) return settings.preamp;
  const frequencies = [0, ...eqFrequencyGrid(256, rate), ...settings.bands.map(({ hz }) => filterHz(hz, rate)), rate / 2];
  const peak = Math.max(0, ...eqCurve(settings, rate, frequencies));
  return Math.min(settings.preamp, -peak);
}
