export type FloatStatus = 'system' | 'starting' | 'running' | 'unsupported' | 'failed' | 'missing';
export type FloatStart = Extract<FloatStatus, 'running' | 'unsupported' | 'failed' | 'missing'>;

export const validFloatRate = (rate: unknown): rate is number => typeof rate === 'number' && Number.isSafeInteger(rate) && rate >= 8000 && rate <= 192000;
export const FLOAT_FRAME_BYTES = 8;
