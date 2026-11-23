import type { BackgroundEffect } from './customization.js';

/** Values mark effects that decelerate after a transport pause, then stop painting. */
export const CANVAS_EFFECTS = {
  aurora: false, stars: false, spectrum: true, columns: true, orbits: false, prism: false,
  pulse: true, rain: false, fireworks: false, solar: false, meteors: true, notes: true,
} as const;
export type CanvasEffect = keyof typeof CANVAS_EFFECTS;
export const isCanvasEffect = (id: BackgroundEffect): id is CanvasEffect => Object.hasOwn(CANVAS_EFFECTS, id);

export function coastSpeed(speed: number, playing: boolean, dt: number) {
  const target = playing ? 1 : 0;
  const result = target + (speed - target) * Math.exp(-(playing ? 9 : 5.6) * dt);
  return playing ? result : result < .009 ? 0 : result;
}

// Atmosphere follows its own clock; only transport-driven visualizers stop on pause.
export const AMBIENT_EFFECTS = ['aurora', 'waves', 'stars', 'orbits', 'prism', 'nebula', 'kaleidoscope',
  'fireworks', 'rain', 'solar', 'meteors', 'notes', 'mix-flow', 'tunnel', 'liquid'] as const satisfies readonly BackgroundEffect[];
const ambient = new Set<BackgroundEffect>(AMBIENT_EFFECTS);
export const isAmbientEffect = (effect: BackgroundEffect) => ambient.has(effect);
export const sceneRuns = (effect: BackgroundEffect, playing: boolean) => effect !== 'off' && (playing || isAmbientEffect(effect));
