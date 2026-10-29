import { MAX_UNITS } from './catalog.js';
import { isBuilding } from './combat.js';
import { finite } from './utils.js';
import { hostile } from './economy.js';
import { findOpen } from './entities.js';
import { buildingAt, passable, terrain } from './map.js';
import { pathfind } from './pathfinding.js';
import { findFreePosition, unitRadius, staticPositionClear } from './spatial.js';
import type { GameState, Team, CommandOptions, ActionResult, Point } from './types.js';
/** Connected ground ignores crowd costs, but preserves A*'s hostile-wall breaches.
 * Each radius labels a cell at most once for an entire formation order. */
function commandReachability(s: GameState, team: Team) {
  const grids = new Map<number, Int32Array>();
  let nextComponent = 0;
  return (start: Point, goal: Point, radius: number): boolean => {
    const width = s.map.width,
      height = s.map.height;
    const clearance = radius <= 0.5 ? 0.5 : radius;
    let grid = grids.get(clearance);
    if (!grid) {
      grid = new Int32Array(width * height);
      grids.set(clearance, grid);
    }
    const origin = Math.floor(start.y) * width + Math.floor(start.x);
    const target = Math.floor(goal.y) * width + Math.floor(goal.x);
    if (!grid[origin]) {
      const component = ++nextComponent,
        queue = [origin];
      grid[origin] = component;
      for (let i = 0; i < queue.length; i++) {
        const x = queue[i] % width,
          y = Math.floor(queue[i] / width);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx,
            ny = y + dy,
            key = ny * width + nx;
          if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1 || grid[key]) continue;
          if (terrain(nx, ny, s.map) === 'water') continue;
          const b = buildingAt(s, nx, ny);
          const open =
            b && !passable(s, nx, ny, team)
              ? hostile(s, team, b.team)
              : radius <= 0.5
                ? passable(s, nx, ny, team)
                : staticPositionClear(s, { x: nx + 0.5, y: ny + 0.5 }, radius);
          if (!open) continue;
          grid[key] = component;
          queue.push(key);
        }
      }
    }
    return grid[origin] === grid[target];
  };
}
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
    x >= s.map.width - 1 ||
    y >= s.map.width - 1
  )
    return { ok: false, reason: 'Choose owned troops and a point inside the battlefield.' };
  const target =
    options.targetId == null
      ? null
      : [...s.units, ...s.buildings].find((e) => e.id === options.targetId && e.hp > 0);
  if (options.targetId != null && (!target || !hostile(s, team, target.team)))
    return { ok: false, reason: 'Choose an enemy target.' };
  const reserved = new Set<number>(),
    selected = new Set(ids),
    connected = commandReachability(s, team);
  for (const u of s.units) {
    if (!selected.has(u.id)) continue;
    const exit = u.garrisonId ? findFreePosition(s, u, u.type, u.id) : null;
    if (u.garrisonId && !exit) continue;
    const start = exit || u;
    let chosenPath: Point[] | null = null;
    const p = target
      ? { x: target.x, y: target.y }
      : findOpen(
          s,
          x,
          y,
          team,
          reserved,
          new Set([u.id]),
          12,
          u.type,
          (goal) => {
            const path = pathfind(s, start, goal, team, unitRadius(u));
            const last = path.at(-1);
            const reachable =
              (Math.floor(start.x) === Math.floor(goal.x) &&
                Math.floor(start.y) === Math.floor(goal.y)) ||
              (!!last && Math.hypot(last.x - goal.x, last.y - goal.y) < 0.01);
            if (reachable) chosenPath = path;
            return reachable;
          },
          (goal) => connected(start, goal, unitRadius(u)),
        );
    if (!p) continue;
    if (exit) {
      u.x = exit.x;
      u.y = exit.y;
      u.garrisonId = null;
    }
    u.garrisonId = null;
    reserved.add(Math.floor(p.y) * s.map.width + Math.floor(p.x));
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
