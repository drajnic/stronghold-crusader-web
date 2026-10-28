import { SIZE, MAX_UNITS } from './catalog.js';
import { isBuilding } from './combat.js';
import { finite } from './utils.js';
import { hostile } from './economy.js';
import { findOpen } from './entities.js';
import { pathfind } from './pathfinding.js';
import { findFreePosition, unitRadius } from './spatial.js';
import type { GameState, Team, CommandOptions, ActionResult, Point } from './types.js';
export function validIds(s: GameState, ids: unknown, team: Team): ids is number[] {
  return (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.length <= MAX_UNITS &&
    new Set(ids).size === ids.length &&
    ids.every(
      (id) =>
        Number.isSafeInteger(id) && s.units.some((u) => u.id === id && u.team === team && u.hp > 0),
    )
  );
}
export function command(
  s: GameState,
  ids: number[],
  x: number,
  y: number,
  team: Team = 'player',
  options: CommandOptions = {},
): ActionResult {
  if (
    !validIds(s, ids, team) ||
    !finite(x) ||
    !finite(y) ||
    x < 1 ||
    y < 1 ||
    x >= SIZE - 1 ||
    y >= SIZE - 1
  )
    return { ok: false, reason: 'Choose owned troops and a point inside the battlefield.' };
  const target =
    options.targetId == null
      ? null
      : [...s.units, ...s.buildings].find((e) => e.id === options.targetId && e.hp > 0);
  if (options.targetId != null && (!target || !hostile(s, team, target.team)))
    return { ok: false, reason: 'Choose an enemy target.' };
  const reserved = new Set<number>(),
    selected = new Set(ids);
  for (const u of s.units) {
    if (!selected.has(u.id)) continue;
    const exit = u.garrisonId ? findFreePosition(s, u, u.type, u.id) : null;
    if (u.garrisonId && !exit) continue;
    const start = exit || u;
    let chosenPath: Point[] | null = null;
    const p = target
      ? { x: target.x, y: target.y }
      : findOpen(s, x, y, team, reserved, new Set([u.id]), 12, u.type, (goal) => {
          const path = pathfind(s, start, goal, team, unitRadius(u));
          const last = path.at(-1);
          const reachable =
            (Math.floor(start.x) === Math.floor(goal.x) &&
              Math.floor(start.y) === Math.floor(goal.y)) ||
            (!!last && Math.hypot(last.x - goal.x, last.y - goal.y) < 0.01);
          if (reachable) chosenPath = path;
          return reachable;
        });
    if (!p) continue;
    if (exit) {
      u.x = exit.x;
      u.y = exit.y;
      u.garrisonId = null;
    }
    u.garrisonId = null;
    reserved.add(Math.floor(p.y) * SIZE + Math.floor(p.x));
    // Unit coordinates already denote continuous world positions.
    u.goal =
      target && !isBuilding(target) ? { x: target.x, y: target.y } : { x: p.x + 0.5, y: p.y + 0.5 };
    u.targetId = target?.id || null;
    u.attackMove = !!options.attackMove;
    u.path = chosenPath ?? pathfind(s, u, u.goal, team, unitRadius(u));
    u.repath = 2;
  }
  return { ok: true };
}
