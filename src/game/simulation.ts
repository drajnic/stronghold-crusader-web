import { updateFires, igniteNearby } from './fire.js';
import { updateAI } from './ai.js';
import { clearShot, fireBlocker } from './line-of-fire.js';
import { TYPES, TROOPS, SCENARIOS } from './catalog.js';
import { finite } from './utils.js';
import { production, updatePolitics, hostile } from './economy.js';
import { buildingAt, passable, invalidate } from './map.js';
import { pathfind } from './pathfinding.js';
import { resolveUnitOverlaps, UnitSpatialIndex, unitRadius } from './spatial.js';
import { moveUnit } from './movement.js';
import { center, distance, targetDistance, hit, shoot, isBuilding } from './combat.js';
import { modeKind, launchWave } from './raids.js';
import type { GameState, Unit } from './types.js';
function updateVictory(s: GameState) {
  for (const [team, f] of Object.entries(s.factions)) {
    if (
      team === 'enemy' &&
      modeKind(s) !== 'skirmish' &&
      !(s.mode === 'multiplayer' && s.multiplayerMode === 'coop')
    )
      continue;
    if (!s.buildings.some((b) => b.team === team && b.type === 'keep' && b.hp > 0)) {
      f.defeated = true;
      for (const u of s.units) if (u.team === team) u.hp = 0;
    }
  }
  if (s.mode === 'multiplayer' && s.multiplayerMode === 'versus') {
    if (s.factions.player.defeated || s.factions.player2?.defeated) {
      s.status = 'victory';
      s.winner = s.factions.player.defeated ? 'player2' : 'player';
    }
    return;
  }
  const allies = Object.entries(s.factions).filter(([t]) => t !== 'enemy');
  if (allies.every(([, f]) => f.defeated)) {
    s.status = 'defeat';
    s.winner = 'enemy';
    return;
  }
  if (modeKind(s) === 'skirmish' || (s.mode === 'multiplayer' && s.multiplayerMode === 'coop')) {
    if (s.factions.enemy?.defeated) {
      s.status = 'victory';
      s.winner = 'player';
    }
  } else if (modeKind(s) === 'survival') {
    const max = s.mode === 'campaign' ? SCENARIOS[s.scenario].waves || 4 : 4;
    if (s.wave >= max && !s.units.some((u) => u.team === 'enemy' && u.hp > 0)) {
      s.status = 'victory';
      s.winner = 'player';
    }
  }
}
export function update(s: GameState, dt: number) {
  if (s.status !== 'playing' || !finite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.25);
  s.time += dt;
  production(s, dt, true);
  updateFires(s, dt);
  updatePolitics(s, dt);
  updateAI(s, dt);
  if (modeKind(s) === 'survival' && s.time >= s.nextWave) launchWave(s);
  resolveUnitOverlaps(s);
  const live = s.units.filter((u) => u.hp > 0);
  const movementIndex = new UnitSpatialIndex(live);
  for (const b of s.buildings) {
    if (b.hp <= 0) continue;
    if (b.type === 'pitchtrap') {
      const t = live.find(
        (u) =>
          u.hp > 0 && !u.garrisonId && hostile(s, b.team, u.team) && distance(center(b), u) < 1.5,
      );
      if (t) {
        for (const u of live)
          if (
            u.hp > 0 &&
            !u.garrisonId &&
            hostile(s, b.team, u.team) &&
            distance(center(b), u) < 2.4
          )
            hit(s, center(b), u, 90, { range: 1 });
        igniteNearby(s, b, 1.5);
        b.hp = 0;
        invalidate(s);
      }
      continue;
    }
    if (b.type !== 'tower') continue;
    b.shot -= dt;
    const t = live.find(
      (u) =>
        u.hp > 0 &&
        hostile(s, b.team, u.team) &&
        distance(center(b), u) <= (TYPES.tower.range || 7) &&
        clearShot(s, b, u),
    );
    if (t && b.shot <= 0) {
      hit(s, center(b), t, TYPES.tower.damage || 8, { range: 7 });
      b.shot = 1.3;
    }
  }
  movementIndex.refresh(live);
  const attack = (
    u: Unit,
    target: Parameters<typeof shoot>[2],
    definition: Parameters<typeof shoot>[3],
  ) => {
    shoot(s, u, target, definition);
    movementIndex.refresh(live);
  };
  for (const u of live) {
    if (u.hp <= 0) continue;
    const d = TROOPS[u.type];
    u.attack -= dt;
    u.repath -= dt;
    let range = d.range;
    if (u.garrisonId) {
      const tower = s.buildings.find((b) => b.id === u.garrisonId && b.hp > 0);
      if (!tower) {
        u.garrisonId = null;
        continue;
      }
      const p = center(tower);
      u.x = p.x;
      u.y = p.y;
      range +=
        3 +
        (s.buildings.some(
          (b) => b.team === u.team && b.type === 'stairs' && distance(center(b), p) < 3,
        )
          ? 1
          : 0);
    }
    const explicit = u.targetId
      ? [...s.units, ...s.buildings].find(
          (e) => e.id === u.targetId && e.hp > 0 && hostile(s, u.team, e.team),
        )
      : null;
    if (u.targetId && !explicit) {
      u.targetId = null;
      u.goal = null;
      u.path = [];
    }
    const foes = live.filter((v) => v.hp > 0 && v !== u && hostile(s, u.team, v.team));
    const obstruction = explicit ? fireBlocker(s, u, explicit) : undefined;
    const breach =
      obstruction &&
      hostile(s, u.team, obstruction.team) &&
      targetDistance(u, obstruction) <= range &&
      (!d.minRange || targetDistance(u, obstruction) >= d.minRange) &&
      clearShot(s, u, obstruction)
        ? obstruction
        : null;
    const target =
      explicit &&
      targetDistance(u, explicit) <= range &&
      clearShot(s, u, explicit) &&
      (!d.minRange || targetDistance(u, explicit) >= d.minRange)
        ? explicit
        : breach ||
          foes.reduce<Unit | null>(
            (best, t) =>
              targetDistance(u, t) <= range &&
              clearShot(s, u, t) &&
              (!d.minRange || targetDistance(u, t) >= d.minRange) &&
              (!best || targetDistance(u, t) < targetDistance(u, best))
                ? t
                : best,
            null,
          );
    if (target && (!d.minRange || targetDistance(u, target) >= d.minRange)) {
      if (u.attack <= 0) attack(u, target, { ...d, range });
      continue;
    }
    if (u.garrisonId || (u.stance === 'hold' && !u.goal && !explicit)) continue;
    let destination = explicit ? center(explicit) : u.goal;
    const nearby = foes.reduce<Unit | null>(
      (best, t) =>
        distance(u, t) < (u.stance === 'aggressive' ? 9 : d.range + 2) &&
        (!best || distance(u, t) < distance(u, best))
          ? t
          : best,
      null,
    );
    if (nearby && u.stance !== 'hold' && (!destination || u.attackMove)) destination = nearby;
    if (
      !destination &&
      u.team === 'enemy' &&
      modeKind(s) !== 'skirmish' &&
      s.mode !== 'multiplayer'
    ) {
      const keep = s.buildings.find((b) => b.type === 'keep' && hostile(s, u.team, b.team));
      if (keep) destination = center(keep);
    }
    if (!destination) continue;
    // Building attackers stop at the edge rather than entering an occupied footprint.
    if (
      explicit &&
      isBuilding(explicit) &&
      targetDistance(u, explicit) <= range &&
      clearShot(s, u, explicit)
    ) {
      if ((!d.minRange || targetDistance(u, explicit) >= d.minRange) && u.attack <= 0)
        attack(u, explicit, d);
      continue;
    }
    if (u.repath <= 0) {
      u.path = pathfind(s, u, destination, u.team, unitRadius(u));
      u.repath = 2.2 + (u.id % 7) * 0.07;
    }
    if (
      u.path.length > 1 &&
      distance(u, u.path[0]) < 0.35 &&
      movementIndex.sweepClear(s, u, u.path[1])
    )
      u.path.shift();
    const p = u.path[0];
    if (!p) {
      if (!explicit) {
        u.goal = null;
        u.attackMove = false;
      }
      continue;
    }
    const blocking = buildingAt(s, Math.floor(p.x), Math.floor(p.y));
    if (blocking && !passable(s, Math.floor(p.x), Math.floor(p.y), u.team)) {
      if (hostile(s, u.team, blocking.team)) {
        if (targetDistance(u, blocking) <= range && clearShot(s, u, blocking)) {
          if ((!d.minRange || targetDistance(u, blocking) >= d.minRange) && u.attack <= 0)
            attack(u, blocking, d);
          continue;
        }
      } else {
        u.path = [];
        u.repath = 0;
        continue;
      }
    }
    if (moveUnit(s, movementIndex, u, p, d.speed * dt)) {
      u.path.shift();
      if (!u.path.length && !explicit) {
        u.goal = null;
        u.attackMove = false;
      }
    }
  }
  s.effects = s.effects.filter((e) => (e.life -= dt) > 0);
  s.units = s.units.filter((u) => u.hp > 0);
  s.buildings = s.buildings.filter((b) => b.hp > 0);
  updateVictory(s);
  // Defeated factions lose their armies during victory resolution, including the terminal tick.
  s.units = s.units.filter((u) => u.hp > 0);
  s.buildings = s.buildings.filter((b) => b.hp > 0);
}
