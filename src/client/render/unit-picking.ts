import type { GameState, Point, Unit } from '../../game/index.js';
import { TROOPS } from '../../game/index.js';
import { facing } from './troops/motion.js';

interface UnitProjection {
  camera: { zoom: number };
  visualPositions: ReadonlyMap<number, Point>;
  project(x: number, y: number, height?: number): Point;
}
/** Scores are normalized to each visible body part; empty rectangular corners never count. */
function ellipse(p: Point, x: number, y: number, rx: number, ry: number): number {
  return ((p.x - x) / rx) ** 2 + ((p.y - y) / ry) ** 2;
}
function capsule(p: Point, ax: number, ay: number, bx: number, by: number, radius: number): number {
  const dx = bx - ax,
    dy = by - ay;
  const along = Math.max(
    0,
    Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy || 1)),
  );
  return ((p.x - ax - dx * along) ** 2 + (p.y - ay - dy * along) ** 2) / radius ** 2;
}
function silhouetteScore(p: Point, u: Unit, padding: number): number {
  const oval = (x: number, y: number, rx: number, ry: number): number =>
    ellipse(p, x, y, rx + padding, ry + padding);
  const beam = (ax: number, ay: number, bx: number, by: number, width: number): number =>
    capsule(p, ax, ay, bx, by, width + padding);
  const troop = TROOPS[u.type];
  if (troop.cavalry)
    return Math.min(
      oval(1, -13, 17, 9),
      oval(17, -26, 7, 6),
      oval(-1, -28, 8, 12),
      oval(-1, -39, 5, 7),
      oval(0, 1, 12, 4),
    );
  if (troop.facility !== 'siege')
    return Math.min(oval(0, -16, 8.5, 12), oval(0, -28, 5, 6), oval(0, -2, 7, 4));
  const deck = oval(1, 2, 24, 10);
  const strike = Math.max(0, Math.min(1, (u.attack / troop.cooldown - 0.5) * 2));
  if (u.type === 'ram')
    return Math.min(deck, oval(0, -21, 25, 14), oval(24 + strike * 5, -10, 6, 5));
  if (u.type === 'trebuchet') {
    const angle = -0.75 + strike * 1.7;
    return Math.min(
      deck,
      beam(-15, 1, -3, -38, 4),
      beam(14, 2, -3, -38, 4),
      beam(
        -3 - Math.cos(angle) * 14,
        -36 - Math.sin(angle) * 14,
        -3 + Math.cos(angle) * 34,
        -36 + Math.sin(angle) * 34,
        3,
      ),
    );
  }
  if (u.type === 'ballista')
    return Math.min(
      deck,
      beam(-22, -25, -2, -13, 3),
      beam(-2, -13, 22, -11, 3),
      beam(-8, -29, 14, -7, 3),
    );
  const angle = -1.1 + strike * 1.5,
    tx = -3 + Math.cos(angle) * 23,
    ty = -19 + Math.sin(angle) * 23;
  return Math.min(
    deck,
    beam(-13, 0, -3, -22, 4),
    beam(12, 1, -3, -22, 4),
    beam(-9, -7, tx, ty, 3),
    oval(tx, ty, 6, 4),
  );
}
/** Match sprite geometry at its interpolated foot anchor, with a small screen-space tolerance. */
export function hitRenderedUnit(
  state: GameState,
  surface: UnitProjection,
  point: Point,
  eligible: (unit: Unit) => boolean = () => true,
): Unit | undefined {
  const zoom = surface.camera.zoom;
  if (!Number.isFinite(zoom) || zoom <= 0) return undefined;
  let nearest: Unit | undefined,
    best = Infinity,
    front = -Infinity;
  for (const unit of state.units) {
    if (unit.garrisonId || !eligible(unit)) continue;
    const visual = surface.visualPositions.get(unit.id) || unit,
      anchor = surface.project(visual.x, visual.y);
    const local = {
      x: ((point.x - anchor.x) / zoom) * facing(unit, state),
      y: (point.y - anchor.y) / zoom,
    };
    const score = silhouetteScore(local, unit, Math.min(3, 1.5 / zoom));
    if (
      score <= 1 &&
      (score < best - 0.001 || (Math.abs(score - best) <= 0.001 && anchor.y > front))
    ) {
      nearest = unit;
      best = score;
      front = anchor.y;
    }
  }
  return nearest;
}
