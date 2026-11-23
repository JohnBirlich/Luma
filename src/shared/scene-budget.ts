export const SCENE_MAX_PIXELS = 1920 * 1080;
export const SCENE_MAX_SIDE = 2560;
export const COMPACT_SCENE_PIXELS = 960 * 480;
export const COMPACT_SCENE_SIDE = 1536;
export const SPECTRUM_FPS = 30;
export const FIREWORKS_FPS = 24;
export const COMPACT_SCENE_FPS = 20;

export const compactScene = (width: number, height: number) => width < 540 || height < 264;
export const sceneFps = (compact: boolean, reactive: boolean) => compact ? COMPACT_SCENE_FPS : reactive ? SPECTRUM_FPS : FIREWORKS_FPS;

/** Bound raster work and use a smaller budget for phones, narrow panes and dialog previews. */
export function sceneBufferSize(width: number, height: number, ratio: number) {
  if (!(width > 0 && height > 0) || !Number.isFinite(width * height)) return { width: 0, height: 0 };
  const compact = compactScene(width, height);
  const density = Number.isFinite(ratio) ? Math.min(2, Math.max(1, ratio)) : 1;
  const scale = Math.min(density, (compact ? COMPACT_SCENE_SIDE : SCENE_MAX_SIDE) / Math.max(width, height),
    Math.sqrt((compact ? COMPACT_SCENE_PIXELS : SCENE_MAX_PIXELS) / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
