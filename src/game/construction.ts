import { isBuildingType, isTroopType } from './action-schema.js';
import { TYPES, TROOPS, MAX_UNITS, MAX_BUILDINGS } from './catalog.js';
import { cells, buildingAt, terrain, nearTerrain } from './map.js';
import { factionFor, affordable, spend } from './economy.js';
import { addBuilding, addUnit, findOpen } from './entities.js';
import { command } from './commands.js';
import { unitRadius } from './spatial.js';
import type { GameState, Team, ActionResult } from './types.js';
export function canPlace(
  s: GameState,
  type: string,
  x: number,
  y: number,
  team: Team = 'player',
): ActionResult {
  if (!isBuildingType(type) || type === 'keep')
    return { ok: false, reason: 'Choose a construction.' };
  if (s.buildings.length >= MAX_BUILDINGS)
    return {
      ok: false,
      reason: `The battlefield building limit (${MAX_BUILDINGS}) has been reached.`,
    };
  const d = TYPES[type];
  if (s.status !== 'playing' || !factionFor(s, team) || factionFor(s, team)?.defeated)
    return { ok: false, reason: 'This lord cannot build.' };
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 1 ||
    y < 1 ||
    x + d.size > s.map.width - 1 ||
    y + d.size > s.map.width - 1
  )
    return { ok: false, reason: 'Build within the valley.' };
  for (const c of cells({ type, x, y })) {
    if (buildingAt(s, c.x, c.y))
      return { ok: false, reason: 'Another building occupies this ground.' };
    if (terrain(c.x, c.y, s.map) === 'water')
      return { ok: false, reason: 'The oasis cannot be built over.' };
    if (
      s.units.some(
        (u) =>
          u.hp > 0 &&
          !u.garrisonId &&
          Math.hypot(
            u.x - Math.max(c.x, Math.min(c.x + 1, u.x)),
            u.y - Math.max(c.y, Math.min(c.y + 1, u.y)),
          ) < unitRadius(u),
      )
    )
      return { ok: false, reason: 'A soldier is standing here.' };
  }
  if (!s.buildings.some((b) => b.team === team && b.hp > 0 && Math.hypot(b.x - x, b.y - y) <= 17))
    return { ok: false, reason: 'Build closer to your settlement.' };
  if (d.requires && !nearTerrain(x, y, d.requires, 7, s.map))
    return { ok: false, reason: `Requires nearby ${d.requires}.` };
  if (d.fertile && !cells({ type, x, y }).some((c) => terrain(c.x, c.y, s.map) === 'grass'))
    return { ok: false, reason: 'Farms need fertile green ground.' };
  if (!affordable(s, d.cost, team)) return { ok: false, reason: 'You need more resources.' };
  return { ok: true, reason: d.name };
}
export function place(
  s: GameState,
  type: string,
  x: number,
  y: number,
  team: Team = 'player',
): ActionResult {
  const v = canPlace(s, type, x, y, team);
  if (!v.ok || !isBuildingType(type)) return v;
  spend(s, TYPES[type].cost, team);
  const b = addBuilding(s, type, x, y, team);
  if (team === 'player') s.tutorial.built++;
  return { ok: true, building: b };
}
export function canRecruit(
  s: GameState,
  type: string,
  team: Team = 'player',
  facilityId?: number,
): ActionResult {
  if (!isTroopType(type)) return { ok: false, reason: 'Unavailable troop.' };
  const d = TROOPS[type],
    f = factionFor(s, team);
  if (s.status !== 'playing' || !f || f.defeated || !Object.hasOwn(TROOPS, type) || d.untrainable)
    return { ok: false, reason: 'Unavailable troop.' };
  if (facilityId !== undefined && !Number.isSafeInteger(facilityId))
    return { ok: false, reason: 'Choose an available recruitment building.' };
  const facilities = s.buildings.filter(
    (b) =>
      b.team === team &&
      b.type === d.facility &&
      b.hp > 0 &&
      (facilityId === undefined || b.id === facilityId),
  );
  const facility = facilities.find((b) => !b.fire);
  if (!facility) {
    if (facilities.length)
      return { ok: false, reason: 'Extinguish this recruitment building first.' };
    return {
      ok: false,
      reason:
        facilityId === undefined
          ? `Build a ${TYPES[d.facility].name.toLowerCase()} first.`
          : 'Choose an available recruitment building.',
    };
  }
  if (s.units.filter((u) => u.hp > 0).length >= MAX_UNITS)
    return { ok: false, reason: 'The battlefield limit is 160 troops.' };
  if (f.civilians < (d.civilians || 1) + 2)
    return { ok: false, reason: 'Keep two civilians to sustain your economy; wait for migrants.' };
  if (!affordable(s, d.cost, team))
    return { ok: false, reason: 'Insufficient gold or required equipment.' };
  const p = findOpen(
    s,
    facility.x + 1,
    facility.y + TYPES[facility.type].size,
    team,
    undefined,
    undefined,
    9,
    type,
  );
  if (!p) return { ok: false, reason: 'Clear space around the recruitment building.' };
  return { ok: true, spawn: p, building: facility };
}
export function recruit(
  s: GameState,
  type: string,
  team: Team = 'player',
  facilityId?: number,
): ActionResult {
  const check = canRecruit(s, type, team, facilityId);
  if (!check.ok || !check.spawn || !isTroopType(type)) return check;
  const d = TROOPS[type],
    f = factionFor(s, team)!,
    p = check.spawn;
  spend(s, d.cost, team);
  f.civilians -= d.civilians || 1;
  const unit = addUnit(s, type, team, p.x + 0.5, p.y + 0.5);
  const rally = check.building?.rallyPoint;
  // Use the same reachable nearby tile fallback and collision-safe movement as manual orders.
  // If no reachable tile exists, command leaves the recruit safely at its spawn.
  if (rally) command(s, [unit.id], rally.x, rally.y, team);
  if (team === 'player') s.tutorial.recruited++;
  return { ok: true, unit };
}
