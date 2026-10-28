import { TYPES, TROOPS } from './catalog.js';
import type { Building, Entity, GameState, Point, Unit } from './types.js';

// Closed segment / rectangle intersection, including corner touches.
function intersects(a: Point, z: Point, b: Building) {
  let lo = 0,
    hi = 1;
  const size = TYPES[b.type].size;
  for (const axis of ['x', 'y'] as const) {
    const delta = z[axis] - a[axis];
    if (Math.abs(delta) < 1e-10) {
      if (a[axis] < b[axis] || a[axis] > b[axis] + size) return false;
    } else {
      const first = (b[axis] - a[axis]) / delta;
      const last = (b[axis] + size - a[axis]) / delta;
      lo = Math.max(lo, Math.min(first, last));
      hi = Math.min(hi, Math.max(first, last));
      if (lo > hi + 1e-10) return false;
    }
  }
  return hi > 1e-8 && lo < 1 - 1e-8;
}

export function fireBlocker(s: GameState, shooter: Entity, target: Entity): Building | undefined {
  const building = Object.hasOwn(TYPES, shooter.type);
  const unit = shooter as Unit;
  if (
    !building &&
    (TROOPS[unit.type].range <= 2 || unit.type === 'catapult' || unit.type === 'trebuchet')
  )
    return;
  const elevated =
    building ||
    !!unit.garrisonId ||
    (!Object.hasOwn(TYPES, target.type) && !!(target as Unit).garrisonId);
  const origin = building
    ? {
        x: shooter.x + TYPES[(shooter as Building).type].size / 2,
        y: shooter.y + TYPES[(shooter as Building).type].size / 2,
      }
    : shooter;
  const destination = Object.hasOwn(TYPES, target.type)
    ? {
        x: target.x + TYPES[(target as Building).type].size / 2,
        y: target.y + TYPES[(target as Building).type].size / 2,
      }
    : target;
  return s.buildings
    .filter(
      (b) =>
        b.hp > 0 &&
        b.id !== shooter.id &&
        b.id !== target.id &&
        b.id !== (target as Unit).garrisonId &&
        b.id !== unit.garrisonId &&
        (b.type === 'tower' ||
          b.type === 'keep' ||
          (!elevated && (b.type === 'wall' || (b.type === 'gate' && !b.open)))) &&
        intersects(origin, destination, b),
    )
    .sort((a, b) => {
      const edge = (fort: Building) =>
        Math.hypot(
          origin.x - Math.max(fort.x, Math.min(fort.x + TYPES[fort.type].size, origin.x)),
          origin.y - Math.max(fort.y, Math.min(fort.y + TYPES[fort.type].size, origin.y)),
        );
      return edge(a) - edge(b) || a.id - b.id;
    })[0];
}
export const clearShot = (s: GameState, shooter: Entity, target: Entity) =>
  !fireBlocker(s, shooter, target);
