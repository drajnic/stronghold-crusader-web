import type { GameState } from '../../game/index.js';

interface ClockAnchor {
  simulationTime: number;
  wallTime: number;
}
const anchors = new WeakMap<GameState, ClockAnchor>();
/** Smooth 5 Hz snapshots without letting a paused or disconnected kingdom animate forever. */
export function visualTime(state: GameState, now = performance.now()): number {
  if (state.status !== 'playing') return state.time;
  let anchor = anchors.get(state);
  if (!anchor || anchor.simulationTime !== state.time) {
    anchor = { simulationTime: state.time, wallTime: now };
    anchors.set(state, anchor);
  }
  return state.time + Math.max(0, Math.min(0.2, (now - anchor.wallTime) / 1000));
}
