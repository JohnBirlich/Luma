export const THEMES = {
  amber: { name: 'Тёплая ночь', accent: '#f2bd86', chrome: '#101116', side: '#111218', panel: '#15161e', raised: '#1d1e27', glow: '#1a1a24', stage: '#14151c' },
  ocean: { name: 'Океан', accent: '#8ecffc', chrome: '#101620', side: '#121a27', panel: '#162233', raised: '#1c2c41', glow: '#22354d', stage: '#121c2a' },
  violet: { name: 'Сирень', accent: '#ceb1fb', chrome: '#17111f', side: '#1a1424', panel: '#221a30', raised: '#2f233f', glow: '#362744', stage: '#1e172a' },
  pine: { name: 'Хвоя', accent: '#a4dfb4', chrome: '#111a17', side: '#131f1b', panel: '#182823', raised: '#20352e', glow: '#274237', stage: '#16241f' },
} as const;

export const ACCENTS = [
  { name: 'Янтарь', color: '#f2bd86' }, { name: 'Мята', color: '#86dab9' },
  { name: 'Лёд', color: '#8ecffc' }, { name: 'Сирень', color: '#ceb1fb' },
  { name: 'Роза', color: '#f7aabf' }, { name: 'Серебро', color: '#c5cddd' },
] as const;

export const HERO_STYLES = ['cover', 'blur', 'vinyl', 'center'] as const;
export const BACKGROUND_EFFECTS = ['off', 'aurora', 'waves', 'stars', 'spectrum', 'orbits', 'prism', 'pulse', 'nebula', 'horizon', 'kaleidoscope', 'rain', 'fireworks'] as const;
export const EFFECT_TEMPOS = { calm: { label: 'Спокойный', factor: 1.65 }, normal: { label: 'Обычный', factor: 1 }, fast: { label: 'Быстрый', factor: 0.67 } } as const;
export const START_PAGES = ['player', 'library', 'vk'] as const;
export const SEEK_STEPS = [5, 10, 15, 30] as const;
export type ThemeName = keyof typeof THEMES;
export type HeroStyle = typeof HERO_STYLES[number];
export type BackgroundEffect = typeof BACKGROUND_EFFECTS[number];
export type EffectTempo = keyof typeof EFFECT_TEMPOS;
export type StartPage = typeof START_PAGES[number];
export type SeekStep = typeof SEEK_STEPS[number];
export type LibraryLayout = 'list' | 'grid';

export interface Appearance {
  theme: ThemeName;
  accent: string | null;
  hero: HeroStyle;
  effect: BackgroundEffect;
  effectStrength: number;
  effectTempo: EffectTempo;
  audioReactive: boolean;
  nativeFullscreen: boolean;
  fullscreenQueue: boolean;
  compactSidebar: boolean;
  coverColors: boolean;
  motion: boolean;
  libraryLayout: LibraryLayout;
}

export interface PlaybackPreferences {
  startPage: StartPage;
  seekStep: SeekStep;
  autoNext: boolean;
  rememberRecent: boolean;
  publishTrack: boolean;
  successNotices: boolean;
}

export const defaultAppearance: Appearance = { theme: 'amber', accent: null, hero: 'cover', effect: 'aurora', effectStrength: 0.75, effectTempo: 'normal', audioReactive: true, nativeFullscreen: true, fullscreenQueue: true, compactSidebar: false, coverColors: true, motion: true, libraryLayout: 'list' };
export const defaultPlayback: PlaybackPreferences = { startPage: 'player', seekStep: 5, autoNext: true, rememberRecent: true, publishTrack: true, successNotices: true };
export const isHexColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export function readAppearance(value: unknown): Appearance {
  const data = value as Partial<Appearance> | null | undefined;
  const oldAppearance = data && typeof data === 'object' && HERO_STYLES.includes(data.hero as HeroStyle) && !Object.hasOwn(data, 'effect');
  return {
    theme: typeof data?.theme === 'string' && Object.hasOwn(THEMES, data.theme) ? data.theme : defaultAppearance.theme,
    accent: isHexColor(data?.accent) ? data.accent.toLowerCase() : null,
    hero: data?.hero && HERO_STYLES.includes(data.hero) ? data.hero : defaultAppearance.hero,
    effect: data?.effect && BACKGROUND_EFFECTS.includes(data.effect) ? data.effect : oldAppearance ? 'off' : defaultAppearance.effect,
    effectStrength: typeof data?.effectStrength === 'number' && Number.isFinite(data.effectStrength) ? Math.max(0.25, Math.min(1, data.effectStrength)) : defaultAppearance.effectStrength,
    effectTempo: typeof data?.effectTempo === 'string' && Object.hasOwn(EFFECT_TEMPOS, data.effectTempo) ? data.effectTempo : defaultAppearance.effectTempo,
    audioReactive: data?.audioReactive !== false,
    nativeFullscreen: data?.nativeFullscreen !== false,
    fullscreenQueue: data?.fullscreenQueue !== false,
    compactSidebar: data?.compactSidebar === true,
    coverColors: data?.coverColors !== false,
    motion: data?.motion !== false,
    libraryLayout: data?.libraryLayout === 'grid' ? 'grid' : 'list',
  };
}

export function readPlayback(value: unknown): PlaybackPreferences {
  const data = value as Partial<PlaybackPreferences> | null | undefined;
  return {
    startPage: data?.startPage && START_PAGES.includes(data.startPage) ? data.startPage : defaultPlayback.startPage,
    seekStep: data?.seekStep && SEEK_STEPS.includes(data.seekStep) ? data.seekStep : defaultPlayback.seekStep,
    autoNext: data?.autoNext !== false,
    rememberRecent: data?.rememberRecent !== false,
    publishTrack: data?.publishTrack !== false,
    successNotices: data?.successNotices !== false,
  };
}

function rgb(hex: string): number[] {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((byte) => {
    const channel = byte / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

export function contrastRatio(a: string, b: string) {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (hi + 0.05) / (lo + 0.05);
}

const lighten = (hex: string, amount: number) => `#${rgb(hex)
  .map((byte) => Math.round(byte + (255 - byte) * amount).toString(16).padStart(2, '0')).join('')}`;

/** Preserve the selected hue, lightening dark custom accents against app surfaces when necessary. */
export function accentFor(appearance: Appearance): string {
  const theme = THEMES[appearance.theme];
  const base = isHexColor(appearance.accent) ? appearance.accent : theme.accent;
  for (let step = 0; step <= 20; step++) {
    const candidate = step === 0 ? base : lighten(base, step / 20);
    if (contrastRatio(candidate, theme.raised) >= 4.5) return candidate;
  }
  return '#ffffff';
}

export function themeVariables(appearance: Appearance) {
  const theme = THEMES[appearance.theme];
  const accent = accentFor(appearance);
  return {
    '--chrome-bg': theme.chrome, '--sidebar-bg': theme.side, '--panel-bg': theme.panel, '--raised-bg': theme.raised,
    '--stage-bg': theme.stage, '--stage-glow': theme.glow,
    '--accent': accent, '--accent-light': lighten(accent, 0.25),
    '--accent-ink': contrastRatio(accent, '#151419') >= contrastRatio(accent, '#ffffff') ? '#151419' : '#ffffff',
  };
}

export function shouldAdvanceAfterEnd(settings: PlaybackPreferences, repeat: 'off' | 'one' | 'all') {
  return settings.autoNext || repeat === 'one';
}

const generatedTones = ['#b27559', '#8f72b7', '#4a9e91', '#657eb3', '#ba7896', '#9d8959'];
export function artworkTone(key: string): string {
  let hash = 0;
  for (const character of key) hash = (Math.imul(31, hash) + (character.codePointAt(0) ?? 0)) >>> 0;
  return generatedTones[hash % generatedTones.length];
}
