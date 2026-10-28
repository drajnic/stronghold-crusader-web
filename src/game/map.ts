import { DEFAULT_MAP, TERRAIN_CODES, type MapDefinition } from './map-definition.js';
import { SIZE, TYPES } from './catalog.js';
import type { GameState, Building, Point, Terrain, Team } from './types.js';
export function terrain(x: number, y: number, map: MapDefinition = DEFAULT_MAP): Terrain {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SIZE || y >= SIZE)
    return 'void';
  return TERRAIN_CODES[map.terrain[y][x] as keyof typeof TERRAIN_CODES];
}
export const cells = (b: Pick<Building, 'type' | 'x' | 'y'>): Point[] =>
  Array.from({ length: TYPES[b.type].size ** 2 }, (_, i) => ({
    x: b.x + (i % TYPES[b.type].size),
    y: b.y + Math.floor(i / TYPES[b.type].size),
  }));
interface MapCache {
  grid: (Building | undefined)[];
  ref: Building[];
  length: number;
  rev: number;
}
const caches = new WeakMap<GameState, MapCache>();
export function invalidate(s: GameState) {
  s.mapRevision = (s.mapRevision || 0) + 1;
  caches.delete(s);
}
function occupancy(s: GameState) {
  let c = caches.get(s);
  if (!c || c.ref !== s.buildings || c.length !== s.buildings.length || c.rev !== s.mapRevision) {
    const grid = new Array<Building | undefined>(SIZE * SIZE);
    for (const b of s.buildings) if (b.hp > 0) for (const p of cells(b)) grid[p.y * SIZE + p.x] = b;
    c = { grid, ref: s.buildings, length: s.buildings.length, rev: s.mapRevision };
    caches.set(s, c);
  }
  return c.grid;
}
export function buildingAt(s: GameState, x: number, y: number): Building | undefined {
  const b = occupancy(s)[Math.floor(y) * SIZE + Math.floor(x)];
  return b && b.hp > 0 ? b : undefined;
}
export function nearTerrain(
  x: number,
  y: number,
  t: Terrain,
  r = 7,
  map: MapDefinition = DEFAULT_MAP,
) {
  for (let a = Math.max(1, x - r); a <= Math.min(SIZE - 2, x + r); a++)
    for (let b = Math.max(1, y - r); b <= Math.min(SIZE - 2, y + r); b++)
      if (terrain(a, b, map) === t && Math.hypot(a - x, b - y) <= r) return true;
  return false;
}
export function passable(s: GameState, x: number, y: number, _team: Team = 'player') {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 1 ||
    y < 1 ||
    x >= SIZE - 1 ||
    y >= SIZE - 1 ||
    terrain(x, y, s.map) === 'water'
  )
    return false;
  const b = buildingAt(s, x, y);
  if (b) return b.type === 'pitchtrap' || (b.type === 'gate' && b.open);
  return !['trees', 'stone', 'iron'].includes(terrain(x, y, s.map));
}
