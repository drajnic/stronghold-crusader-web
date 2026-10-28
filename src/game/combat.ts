import { igniteBuilding } from './fire.js';
import { TYPES, TROOPS } from './catalog.js';
import { clamp } from './utils.js';
import { invalidate } from './map.js';
import { findFreePosition } from './spatial.js';
import { clearShot } from './line-of-fire.js';
import { fearFactor, hostile } from './economy.js';
import type { GameState, Point, Building, Unit, Entity, TroopDefinition } from './types.js';
export const isBuilding = (e: Entity): e is Building => Object.hasOwn(TYPES, e.type);
export const center = (e: Entity): Point =>
  isBuilding(e) ? { x: e.x + TYPES[e.type].size / 2, y: e.y + TYPES[e.type].size / 2 } : e;
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function targetDistance(u: Point, t: Entity) {
  if (isBuilding(t))
    return Math.hypot(
      u.x - clamp(u.x, t.x, t.x + TYPES[t.type].size),
      u.y - clamp(u.y, t.y, t.y + TYPES[t.type].size),
    );
  return distance(u, t);
}
export function hit(
  s: GameState,
  from: Point,
  t: Entity,
  damage: number,
  def: Partial<TroopDefinition> = {},
  visual = true,
) {
  if (t.hp <= 0) return;
  const buildingTarget = isBuilding(t);
  let armor = buildingTarget ? 0 : TROOPS[t.type].armor || 0;
  if (!buildingTarget && t.garrisonId) armor = Math.min(0.85, armor + 0.35);
  let value = damage * (1 - armor * (1 - (def.pierce || 0)));
  if (def.antiCavalry && !buildingTarget && TROOPS[t.type].cavalry) value *= def.antiCavalry;
  t.hp = Math.max(0, t.hp - value);
  if (buildingTarget) t.lastHit = s.time;
  const p = center(t);
  if (visual)
    s.effects.push({
      x: from.x,
      y: from.y,
      tx: p.x,
      ty: p.y,
      life: 0.25,
      max: 0.25,
      type: (def.range || 0) > 2 ? 'arrow' : 'hit',
    });
  if (s.effects.length > 140) s.effects.shift();
  if (t.hp === 0) {
    if (buildingTarget) invalidate(s);
    if (t.team === 'enemy') {
      s.kills++;
      s.tutorial.firstRepelled = true;
    }
    if (buildingTarget && TYPES[t.type].garrison)
      for (const u of s.units)
        if (u.garrisonId === t.id) {
          u.garrisonId = null;
          const p = findFreePosition(s, u, u.type, u.id);
          if (p) {
            u.x = p.x;
            u.y = p.y;
          } else u.hp = 0;
        }
  }
}
export function shoot(s: GameState, u: Unit, target: Entity, d: TroopDefinition) {
  if (!clearShot(s, u, target)) return;
  const morale = fearFactor(s, u.team).morale;
  hit(s, u, target, (isBuilding(target) ? d.buildingDamage : d.damage) * morale, d);
  if (isBuilding(target) && (u.type === 'slave' || u.type === 'firethrower'))
    igniteBuilding(s, target);
  if (d.splash)
    for (const t of [...s.units, ...s.buildings])
      if (
        t !== target &&
        t.hp > 0 &&
        hostile(s, u.team, t.team) &&
        targetDistance(center(target), t) <= d.splash
      ) {
        hit(s, u, t, (isBuilding(t) ? d.buildingDamage : d.damage) * 0.45 * morale, d);
        if (isBuilding(t) && u.type === 'firethrower') igniteBuilding(s, t);
      }
  u.attack = d.cooldown;
}
