export const KARAOKE_RANGES = { size: [20, 64, 1], weight: [400, 900, 50], spacing: [0, 36, 1] } as const;
export type KaraokeRange = keyof typeof KARAOKE_RANGES;
export interface KaraokeStyle { size: number; weight: number; spacing: number; align: 'left' | 'center' }
export const defaultKaraokeStyle: KaraokeStyle = { size: 38, weight: 750, spacing: 20, align: 'left' };

export function readKaraokeStyle(value: unknown): KaraokeStyle {
  const data = value as Partial<KaraokeStyle> | null;
  function read(key: KaraokeRange) {
    const number = data?.[key];
    const [min, max, step] = KARAOKE_RANGES[key];
    return typeof number === 'number' && Number.isFinite(number)
      ? Math.min(max, Math.max(min, Math.round(number / step) * step)) : defaultKaraokeStyle[key];
  }
  return { size: read('size'), weight: read('weight'), spacing: read('spacing'), align: data?.align === 'center' ? 'center' : 'left' };
}
