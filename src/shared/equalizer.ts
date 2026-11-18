export const BANDS = [
  { hz: 60, label: '60 Гц', type: 'lowshelf' },
  { hz: 230, label: '230 Гц', type: 'peaking' },
  { hz: 910, label: '910 Гц', type: 'peaking' },
  { hz: 3600, label: '3,6 кГц', type: 'peaking' },
  { hz: 14000, label: '14 кГц', type: 'highshelf' },
] as const;

export const PRESETS = {
  flat: { label: 'Ровный', preamp: 0, gains: [0, 0, 0, 0, 0] },
  warm: { label: 'Тёплый', preamp: -1, gains: [3, 2, 0, -1, -2] },
  bass: { label: 'Больше баса', preamp: -3, gains: [6, 3, 0, 0, 1] },
  voice: { label: 'Голос', preamp: -2, gains: [-3, -1, 3, 4, 0] },
  bright: { label: 'Ясность', preamp: -2, gains: [-1, 0, 1, 3, 5] },
};

export type Preset = keyof typeof PRESETS | 'custom';
export interface EqualizerSettings {
  enabled: boolean;
  preset: Preset;
  preamp: number;
  gains: number[];
}

export const defaultEqualizer: EqualizerSettings = { enabled: false, preset: 'flat', preamp: 0, gains: [0, 0, 0, 0, 0] };
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
