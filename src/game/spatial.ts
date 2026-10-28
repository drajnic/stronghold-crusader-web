import { SIZE, TROOPS } from './catalog.js';
import { passable } from './map.js';
import type { GameState, Point, TroopType, Unit } from './types.js';

/** Physical ground footprints, in map cells. All fit a one-cell gateway. */
export function unitRadius(unit: TroopType | Unit): number {
  const type = typeof unit === 'string' ? unit : unit.type;
  return TROOPS[type].facility === 'siege' ? 0.43 : TROOPS[type].cavalry ? 0.34 : 0.23;
}
export function staticPositionClear(s: GameState, p: Point, radius: number): boolean {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  if (p.x - radius < 1 || p.y - radius < 1 || p.x + radius > SIZE - 1 || p.y + radius > SIZE - 1)
    return false;
  for (let y = Math.floor(p.y - radius); y <= Math.floor(p.y + radius); y++)
    for (let x = Math.floor(p.x - radius); x <= Math.floor(p.x + radius); x++) {
      if (passable(s, x, y)) continue;
      const dx = p.x - Math.max(x, Math.min(x + 1, p.x));
      const dy = p.y - Math.max(y, Math.min(y + 1, p.y));
      if (dx * dx + dy * dy < radius * radius - 1e-9) return false;
    }
  return true;
}
function segmentDistance(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
/** Exact swept circle against cell rectangles, including grazing corners. */
export function staticSweepClear(s: GameState, a: Point, b: Point, radius: number): boolean {
  if (!staticPositionClear(s, b, radius)) return false;
  for (
    let y = Math.floor(Math.min(a.y, b.y) - radius);
    y <= Math.floor(Math.max(a.y, b.y) + radius);
    y++
  )
    for (
      let x = Math.floor(Math.min(a.x, b.x) - radius);
      x <= Math.floor(Math.max(a.x, b.x) + radius);
      x++
    ) {
      if (passable(s, x, y)) continue;
      let enter = 0,
        exit = 1;
      for (const [start, delta, low, high] of [
        [a.x, b.x - a.x, x, x + 1],
        [a.y, b.y - a.y, y, y + 1],
      ]) {
        if (Math.abs(delta) < 1e-12) {
          if (start < low || start > high) {
            enter = 1;
            exit = 0;
            break;
          }
        } else {
          const t1 = (low - start) / delta,
            t2 = (high - start) / delta;
          enter = Math.max(enter, Math.min(t1, t2));
          exit = Math.min(exit, Math.max(t1, t2));
        }
      }
      if (enter <= exit) return false;
      for (const corner of [
        { x, y },
        { x: x + 1, y },
        { x, y: y + 1 },
        { x: x + 1, y: y + 1 },
      ])
        if (segmentDistance(a, b, corner) < radius - 1e-8) return false;
    }
  return true;
}
export function positionClear(s: GameState, p: Point, radius: number, ignoreId?: number): boolean {
  return (
    staticPositionClear(s, p, radius) &&
    !s.units.some(
      (u) =>
        u.hp > 0 &&
        !u.garrisonId &&
        u.id !== ignoreId &&
        Math.hypot(u.x - p.x, u.y - p.y) < radius + unitRadius(u) - 1e-7,
    )
  );
}
export function findFreePosition(
  s: GameState,
  origin: Point,
  type: TroopType,
  ignoreId?: number,
  maxRadius = 12,
): Point | null {
  const radius = unitRadius(type);
  if (positionClear(s, origin, radius, ignoreId)) return { x: origin.x, y: origin.y };
  // Dense deterministic rings also find space beside narrow walls and gateways.
  for (let r = 0.25; r <= maxRadius; r += 0.25) {
    const count = Math.ceil((2 * Math.PI * r) / 0.25);
    for (let i = 0; i < count; i++) {
      const a = (i * Math.PI * 2) / count;
      const p = { x: origin.x + Math.cos(a) * r, y: origin.y + Math.sin(a) * r };
      if (positionClear(s, p, radius, ignoreId)) return p;
    }
  }
  return null;
}

/** Cell buckets are updated after every move, including pushes of idle neighbours. */
export class UnitSpatialIndex {
  private buckets = new Map<string, Set<Unit>>();
  private indexed = new Set<Unit>();
  private key(p: Point) {
    return `${Math.floor(p.x)},${Math.floor(p.y)}`;
  }
  constructor(units: Unit[]) {
    for (const u of units) if (u.hp > 0 && !u.garrisonId) this.add(u);
  }
  refresh(units: Unit[]) {
    for (const u of units) if (u.hp > 0 && !u.garrisonId && !this.indexed.has(u)) this.add(u);
  }
  private add(u: Unit) {
    this.indexed.add(u);
    const key = this.key(u);
    let bucket = this.buckets.get(key);
    if (!bucket) this.buckets.set(key, (bucket = new Set()));
    bucket.add(u);
  }
  relocate(u: Unit, p: Point) {
    this.buckets.get(this.key(u))?.delete(u);
    u.x = p.x;
    u.y = p.y;
    this.add(u);
  }
  near(p: Point, range = 1.5): Unit[] {
    const result: Unit[] = [];
    for (let y = Math.floor(p.y - range); y <= Math.floor(p.y + range); y++)
      for (let x = Math.floor(p.x - range); x <= Math.floor(p.x + range); x++)
        for (const u of this.buckets.get(`${x},${y}`) || [])
          if (u.hp > 0 && !u.garrisonId) result.push(u);
    return result.sort((a, b) => a.id - b.id);
  }
  sweepClear(s: GameState, u: Unit, p: Point): boolean {
    return (
      staticSweepClear(s, u, p, unitRadius(u)) &&
      this.near(
        { x: (u.x + p.x) / 2, y: (u.y + p.y) / 2 },
        Math.hypot(u.x - p.x, u.y - p.y) / 2 + 1,
      ).every((v) => v === u || segmentDistance(u, p, v) >= unitRadius(u) + unitRadius(v) - 1e-7)
    );
  }
  clear(s: GameState, u: Unit, p: Point) {
    return (
      staticPositionClear(s, p, unitRadius(u)) &&
      this.near(p).every(
        (v) => v === u || Math.hypot(v.x - p.x, v.y - p.y) >= unitRadius(u) + unitRadius(v) - 1e-7,
      )
    );
  }
}

/** Repair legacy saves and exceptional topology changes before authoritative movement. */
export function resolveUnitOverlaps(s: GameState): void {
  const index = new UnitSpatialIndex([]);
  for (const u of [...s.units].sort((a, b) => a.id - b.id)) {
    if (u.hp <= 0 || u.garrisonId) continue;
    if (!index.clear(s, u, u)) {
      // Only already accepted bodies reserve positions during repair.
      let found: Point | null = null;
      for (let r = 0.1; r <= 12 && !found; r += 0.1) {
        const count = Math.ceil((2 * Math.PI * r) / 0.15);
        for (let i = 0; i < count; i++) {
          const a = (i * 2 * Math.PI) / count;
          const p = { x: u.x + Math.cos(a) * r, y: u.y + Math.sin(a) * r };
          if (index.clear(s, u, p)) {
            found = p;
            break;
          }
        }
      }
      if (found) {
        u.x = found.x;
        u.y = found.y;
        u.repath = 0;
      }
    }
    index.relocate(u, u);
  }
}
