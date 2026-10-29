import { TYPES, TROOPS } from './catalog.js';
import { invalidate } from './map.js';
import { findFreePosition, staticPositionClear, unitRadius } from './spatial.js';
import type { GameState, BuildingType, TroopType, Team, Building, Unit, Point } from './types.js';
export function addBuilding(
  s: GameState,
  type: BuildingType,
  x: number,
  y: number,
  team: Team,
): Building {
  const b: Building = {
    id: s.nextId++,
    type,
    team,
    x,
    y,
    hp: TYPES[type].hp,
    shot: 0,
    open: type === 'gate',
    active: 1,
  };
  s.buildings.push(b);
  invalidate(s);
  return b;
}
export function addUnit(s: GameState, type: TroopType, team: Team, x: number, y: number): Unit {
  const spawn = findFreePosition(s, { x, y }, type, undefined, s.map.width);
  if (!spawn) throw new Error('No free ground for this troop.');
  const u: Unit = {
    id: s.nextId++,
    type,
    team,
    x: spawn.x,
    y: spawn.y,
    hp: TROOPS[type].hp,
    attack: 0,
    path: [],
    goal: null,
    repath: 0,
    stance: 'defensive',
    targetId: null,
    attackMove: false,
    garrisonId: null,
  };
  s.units.push(u);
  return u;
}
export function findOpen(
  s: GameState,
  x: number,
  y: number,
  _team: Team,
  reserved = new Set<number>(),
  ignored = new Set<number>(),
  radius = 9,
  type: TroopType = 'spearman',
  reachable: (point: Point) => boolean = () => true,
  candidateAllowed: (point: Point) => boolean = () => true,
): Point | null {
  for (let r = 0; r <= radius; r++)
    for (let b = -r; b <= r; b++)
      for (let a = -r; a <= r; a++) {
        if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
        const tx = Math.floor(x) + a,
          ty = Math.floor(y) + b,
          key = ty * s.map.width + tx;
        if (
          candidateAllowed({ x: tx + 0.5, y: ty + 0.5 }) &&
          staticPositionClear(s, { x: tx + 0.5, y: ty + 0.5 }, unitRadius(type)) &&
          !s.units.some(
            (u) =>
              u.hp > 0 &&
              !u.garrisonId &&
              !ignored.has(u.id) &&
              Math.hypot(u.x - tx - 0.5, u.y - ty - 0.5) < unitRadius(type) + unitRadius(u) - 1e-7,
          ) &&
          !reserved.has(key) &&
          reachable({ x: tx + 0.5, y: ty + 0.5 })
        )
          return { x: tx, y: ty };
      }
  return null;
}
