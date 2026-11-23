/** Very short tracks still get a recognizable start/end; live/unknown lengths never overlap. */
export function trackOverlap(seconds: number, from: number, to: number, remaining = from) {
  if (![seconds, from, to, remaining].every(value => Number.isFinite(value) && value > 0)) return 0;
  const overlap = Math.min(8, seconds, from / 4, to / 4, remaining);
  return overlap >= .22 ? overlap : 0;
}

export function fadeProgress(elapsedMs: number, durationSeconds: number) {
  return Math.max(0, Math.min(1, elapsedMs / (1000 * durationSeconds)));
}
