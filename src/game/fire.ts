import { event } from './raids.js';
import { TYPES } from './catalog.js';
import { center, hit } from './combat.js';
import type { Building, BuildingType, GameState } from './types.js';
export const FIRE_DURATION = 24;
const FIRE_DAMAGE = 6;
export const FIRE_SPREAD_INTERVAL = 6;
export const WELL_RANGE = 7;
const STONE = new Set<BuildingType>([
  'keep',
  'wall',
  'gate',
  'tower',
  'stairs',
  'moat',
  'well',
  'pitchtrap',
]);
export const isFlammable = (type: BuildingType) => !STONE.has(type);
export function igniteBuilding(s: GameState, b: Building) {
  if (b.hp <= 0 || b.fire || !isFlammable(b.type)) return false;
  b.fire = { remaining: FIRE_DURATION, spread: FIRE_SPREAD_INTERVAL };
  b.active = 0;
  event(s, `${TYPES[b.type].name} is on fire.`);
  return true;
}
/** Euclidean gap between footprints: a complete empty tile is a firebreak. */
function gap(a: Building, b: Building) {
  return Math.hypot(
    Math.max(0, a.x - b.x - TYPES[b.type].size, b.x - a.x - TYPES[a.type].size),
    Math.max(0, a.y - b.y - TYPES[b.type].size, b.y - a.y - TYPES[a.type].size),
  );
}
export function igniteNearby(s: GameState, source: Building, radius: number) {
  for (const b of s.buildings) if (b !== source && gap(source, b) < radius) igniteBuilding(s, b);
}
function allies(s: GameState, a: Building, b: Building) {
  return (
    a.team === b.team ||
    (s.mode === 'multiplayer' &&
      s.multiplayerMode === 'coop' &&
      a.team !== 'enemy' &&
      b.team !== 'enemy')
  );
}
/** Maps each staffed well to its single nearest covered fire, with stable ID ties. */
export function wellTargets(s: GameState): Map<number, Building> {
  const targets = new Map<number, Building>();
  for (const well of s.buildings) {
    if (well.type !== 'well' || well.hp <= 0 || well.paused || well.fire || !(well.active! > 0))
      continue;
    const p = center(well);
    const distance = (b: Building) => Math.hypot(center(b).x - p.x, center(b).y - p.y);
    const nearest = s.buildings
      .filter((b) => b.hp > 0 && b.fire && allies(s, well, b) && distance(b) <= WELL_RANGE)
      .sort((a, b) => distance(a) - distance(b) || a.id - b.id)[0];
    if (nearest) targets.set(well.id, nearest);
  }
  return targets;
}
export function updateFires(s: GameState, dt: number) {
  const burning = s.buildings.filter((b) => b.hp > 0 && b.fire).sort((a, b) => a.id - b.id);
  const targets = wellTargets(s);
  const suppression = new Map<number, number>();
  for (const well of s.buildings) {
    const target = targets.get(well.id);
    if (target)
      suppression.set(target.id, (suppression.get(target.id) || 0) + (well.active || 0) * 4);
  }
  const pending = new Set<Building>();
  for (const b of burning) {
    const fire = b.fire!;
    const elapsed = Math.min(dt, fire.remaining / (1 + (suppression.get(b.id) || 0)));
    fire.remaining = Math.max(0, fire.remaining - dt * (1 + (suppression.get(b.id) || 0)));
    fire.spread -= elapsed;
    hit(s, center(b), b, FIRE_DAMAGE * elapsed, {}, false);
    if (fire.remaining > 0 && b.hp > 0 && fire.spread <= 0) {
      fire.spread += FIRE_SPREAD_INTERVAL;
      const next = s.buildings
        .filter(
          (target) =>
            target !== b &&
            target.hp > 0 &&
            !target.fire &&
            !pending.has(target) &&
            isFlammable(target.type) &&
            gap(b, target) < 1,
        )
        .sort((a, c) => gap(b, a) - gap(b, c) || a.id - c.id)[0];
      if (next) pending.add(next);
    }
    if (fire.remaining <= 0 || b.hp <= 0) delete b.fire;
  }
  // Newly ignited buildings cannot damage or spread until the next simulation update.
  for (const b of pending) igniteBuilding(s, b);
}
