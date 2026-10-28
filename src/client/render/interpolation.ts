import type { GameState, Point, Unit } from '../../game/index.js';
import { staticSweepClear, unitRadius } from '../../game/spatial.js';
import { interpolatePosition } from '../ui/interaction.js';

interface Track {
  unit: Unit;
  from: Point;
  to: Point;
  radius: number;
  snap: boolean;
}
const plans = new WeakMap<GameState, { from: ReadonlyMap<number, Point>; tracks: Track[] }>();
/** Relative motion turns two swept discs into one segment and a circle at the origin. */
function tracksOverlap(a: Track, b: Track): boolean {
  const af = a.snap ? a.to : a.from,
    bf = b.snap ? b.to : b.from;
  const x = af.x - bf.x,
    y = af.y - bf.y,
    dx = a.to.x - b.to.x - x,
    dy = a.to.y - b.to.y - y;
  const radius = a.radius + b.radius - 1e-7;
  if (
    Math.min(x, x + dx) >= radius ||
    Math.max(x, x + dx) <= -radius ||
    Math.min(y, y + dy) >= radius ||
    Math.max(y, y + dy) <= -radius
  )
    return false;
  const t = Math.max(0, Math.min(1, -(x * dx + y * dy) / (dx * dx + dy * dy || 1)));
  return (x + dx * t) ** 2 + (y + dy * t) ** 2 < radius ** 2;
}
/** Check snapshot chords once; ordinary, separated motion retains its full smoothing.
 * A blocked chord snaps only the affected bodies to authoritative clear endpoints. */
export function interpolateUnits(
  state: GameState,
  from: ReadonlyMap<number, Point>,
  elapsedMs: number,
): Map<number, Point> {
  let plan = plans.get(state);
  if (!plan || plan.from !== from) {
    const tracks = state.units
      .filter((u) => u.hp > 0 && !u.garrisonId)
      .map((unit): Track => {
        const start = from.get(unit.id) || unit,
          radius = unitRadius(unit);
        return {
          unit,
          from: start,
          to: unit,
          radius,
          snap: !staticSweepClear(state, start, unit, radius),
        };
      });
    // Endpoint fallback can itself obstruct a neighbour's chord. Propagate until
    // all remaining interpolated trajectories are clear against every fallback.
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < tracks.length; i++)
        for (let j = i + 1; j < tracks.length; j++) {
          const a = tracks[i],
            b = tracks[j];
          if ((a.snap && b.snap) || !tracksOverlap(a, b)) continue;
          a.snap = true;
          b.snap = true;
          changed = true;
        }
    }
    plan = { from, tracks };
    plans.set(state, plan);
  }
  return new Map(
    plan.tracks.map((track) => [
      track.unit.id,
      track.snap
        ? { x: track.to.x, y: track.to.y }
        : interpolatePosition(track.from, track.to, elapsedMs),
    ]),
  );
}
