export interface BeatState { floor: number; previous: number; onset: number; kick: number }
export const initialBeat = (): BeatState => ({ floor: 0, previous: 0, onset: -Infinity, kick: 0 });

/** Detect a rising bass transient above the adaptive floor; no fixed song tempo is assumed. */
export function sampleBeat(state: BeatState, bins: Uint8Array, seconds: number) {
  const bass = ((bins[1] ?? 0) * 2 + (bins[2] ?? 0) * 2 + (bins[3] ?? 0) + (bins[4] ?? 0)) / (6 * 255);
  const peak = bass > .16 && bass - state.floor > .097 && bass - state.previous > .024 && seconds - state.onset > .19;
  state.floor += (bass - state.floor) * (bass > state.floor ? .045 : .135);
  state.previous = bass;
  state.kick = Math.max(peak ? Math.min(1, .5 + bass) : 0, state.kick * .855);
  if (peak) state.onset = seconds;
  return peak;
}
