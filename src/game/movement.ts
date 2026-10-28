import { UnitSpatialIndex, unitRadius } from './spatial.js';
import { hostile } from './economy.js';
import { TROOPS } from './catalog.js';
import { targetDistance } from './combat.js';
import type { GameState, Point, Unit } from './types.js';

/** Swept short steps never cross another body or a solid tile, even for a large dt. */
export function moveUnit(
  s: GameState,
  index: UnitSpatialIndex,
  u: Unit,
  target: Point,
  budget: number,
): boolean {
  const idleAlly = (v: Unit) => {
    if (hostile(s, u.team, v.team)) return false;
    if (!v.targetId) return !v.goal;
    const target = [...s.units, ...s.buildings].find((t) => t.id === v.targetId && t.hp > 0);
    const definition = TROOPS[v.type];
    return (
      !!target &&
      targetDistance(v, target) <= definition.range &&
      (!definition.minRange || targetDistance(v, target) >= definition.minRange)
    );
  };
  const shove = (body: Unit, angle: number, step: number, seen: Set<Unit>): boolean => {
    if (seen.size >= 8 || seen.has(body)) return false;
    seen.add(body);
    const p = { x: body.x + Math.cos(angle) * step, y: body.y + Math.sin(angle) * step };
    for (const other of index.near(p)) {
      if (other === body || hostile(s, body.team, other.team) || seen.has(other)) continue;
      if (Math.hypot(other.x - p.x, other.y - p.y) < unitRadius(body) + unitRadius(other))
        shove(other, angle, step, seen);
    }
    if (!index.sweepClear(s, body, p)) return false;
    index.relocate(body, p);
    return true;
  };
  const distance = Math.hypot(target.x - u.x, target.y - u.y);
  if (distance < 0.025) return true;
  let remaining = Math.min(distance, Math.max(0, budget));
  while (remaining > 1e-8) {
    const step = Math.min(remaining, 0.08);
    const dx = target.x - u.x,
      dy = target.y - u.y,
      length = Math.hypot(dx, dy);
    if (length < 0.025) return true;
    const angle = Math.atan2(dy, dx);
    let moved = false;
    const forward = { x: u.x + Math.cos(angle) * step, y: u.y + Math.sin(angle) * step };
    if (!index.sweepClear(s, u, forward)) {
      for (const v of index.near(u)) {
        if (
          v === u ||
          !idleAlly(v) ||
          Math.hypot(v.x - u.x, v.y - u.y) > unitRadius(u) + unitRadius(v) + 0.12
        )
          continue;
        const p = { x: v.x + Math.cos(angle) * step, y: v.y + Math.sin(angle) * step };
        if (index.sweepClear(s, v, p)) {
          if (!v.targetId) v.goal = { x: v.x, y: v.y };
          v.repath = 0;
          index.relocate(v, p);
        }
      }
    }

    // Consistent right-hand passing breaks symmetric head-on encounters.
    for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, Math.PI / 2, -Math.PI / 2]) {
      const p = { x: u.x + Math.cos(angle + turn) * step, y: u.y + Math.sin(angle + turn) * step };
      if (!index.sweepClear(s, u, p)) continue;
      index.relocate(u, p);
      moved = true;
      break;
    }
    if (!moved) {
      // A stable ID priority lets the rear-facing side back out of a single-file
      // choke instead of two armies indefinitely blocking one another.
      const yielding = index
        .near(u)
        .some(
          (v) =>
            v.id < u.id &&
            (v.goal || v.targetId) &&
            Math.hypot(v.x - u.x, v.y - u.y) < unitRadius(u) + unitRadius(v) + 0.2,
        );
      if (yielding) {
        for (const turn of [Math.PI, 2, -2]) {
          const p = {
            x: u.x + Math.cos(angle + turn) * step,
            y: u.y + Math.sin(angle + turn) * step,
          };
          if (index.sweepClear(s, u, p) || shove(u, angle + turn, step, new Set())) {
            index.relocate(u, p);
            moved = true;
            break;
          }
        }
      }
    }
    if (!moved) {
      // Give way to moving bodies by gently displacing idle allies when space exists.
      for (const v of index.near(u)) {
        if (v === u || !idleAlly(v) || v.garrisonId) continue;
        if (Math.hypot(v.x - u.x, v.y - u.y) > unitRadius(u) + unitRadius(v) + 0.12) continue;
        const away = Math.atan2(v.y - u.y, v.x - u.x);
        for (const turn of [0, Math.PI / 2, -Math.PI / 2]) {
          const p = {
            x: v.x + Math.cos(away + turn) * 0.08,
            y: v.y + Math.sin(away + turn) * 0.08,
          };
          if (index.sweepClear(s, v, p)) {
            if (!v.targetId) v.goal = { x: v.x, y: v.y };
            v.repath = 0;
            index.relocate(v, p);
            moved = true;
            break;
          }
        }
        if (moved) break;
      }
      if (!moved) break;
    }
    remaining -= step;
  }
  return Math.hypot(target.x - u.x, target.y - u.y) < 0.025;
}
