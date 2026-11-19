export const SCENE_MAX_PIXELS = 480_000;
export const SCENE_MAX_SIDE = 1360;
export const SPECTRUM_FPS = 30;
export const FIREWORKS_FPS = 24;

/** Bound canvas raster work even on 4K/HiDPI monitors and use the actual shape of the stage. */
export function sceneBufferSize(width: number, height: number, ratio: number) {
  if (!(width > 0 && height > 0) || !Number.isFinite(width * height)) return { width: 0, height: 0 };
  const scale = Math.min(Math.max(1, ratio || 1), SCENE_MAX_SIDE / Math.max(width, height), Math.sqrt(SCENE_MAX_PIXELS / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
