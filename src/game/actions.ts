import { TYPES, TROOPS, PRICES, RESOURCE_KEYS } from './catalog.js';
import { finite, resourceEntries } from './utils.js';
import { parseAction, isTeam } from './action-schema.js';
import { factionFor, resourcesFor, storageCapacity, affordable, spend } from './economy.js';
import { place, recruit } from './construction.js';
import { command, validIds } from './commands.js';
import { findOpen } from './entities.js';
import { invalidate } from './map.js';
import { unitRadius } from './spatial.js';
import { center, distance, hit } from './combat.js';
import { launchWave } from './raids.js';
import type { GameState, ActionResult } from './types.js';
export function applyAction(s: GameState, input: unknown, team: string = 'player'): ActionResult {
  const a = parseAction(input);
  if (
    !a ||
    !isTeam(team) ||
    s.status !== 'playing' ||
    !factionFor(s, team) ||
    factionFor(s, team)?.defeated
  )
    return { ok: false, reason: 'This action is unavailable.' };
  switch (a.type) {
    case 'place':
      return place(s, a.building, a.x, a.y, team);
    case 'recruit':
      return recruit(s, a.unit, team, a.facilityId);
    case 'rally': {
      const b = s.buildings.find((b) => b.id === a.id && b.team === team && b.hp > 0);
      if (!b || !Object.values(TROOPS).some((d) => !d.untrainable && d.facility === b.type))
        return { ok: false, reason: 'Choose one of your recruitment buildings.' };
      if (a.point === null) delete b.rallyPoint;
      else b.rallyPoint = { ...a.point };
      return { ok: true };
    }
    case 'command':
      return command(s, a.ids, a.x, a.y, team, a);
    case 'policy': {
      if (
        (a.tax !== undefined && (!Number.isInteger(a.tax) || a.tax < -3 || a.tax > 3)) ||
        (a.rations !== undefined &&
          (!Number.isInteger(a.rations) || a.rations < 0 || a.rations > 3))
      )
        return { ok: false, reason: 'Tax must be −3…3; rations 0…3.' };
      if (a.tax !== undefined) s.factions[team]!.tax = a.tax;
      if (a.rations !== undefined) s.factions[team]!.rations = a.rations;
      return { ok: true };
    }
    case 'trade': {
      if (
        !RESOURCE_KEYS.includes(a.resource) ||
        a.resource === 'gold' ||
        !Number.isInteger(a.amount) ||
        a.amount < 1 ||
        a.amount > 1000 ||
        typeof a.buy !== 'boolean'
      )
        return { ok: false, reason: 'Invalid trade.' };
      if (!s.buildings.some((b) => b.team === team && b.type === 'market' && b.hp > 0))
        return { ok: false, reason: 'Build a marketplace first.' };
      const r = resourcesFor(s, team),
        price = PRICES[a.resource];
      if (a.buy) {
        if (r.gold < a.amount * price.buy) return { ok: false, reason: 'Insufficient gold.' };
        if (r[a.resource] + a.amount > storageCapacity(s, a.resource, team))
          return { ok: false, reason: 'Not enough storage.' };
        r.gold -= a.amount * price.buy;
        r[a.resource] += a.amount;
      } else {
        if (r[a.resource] < a.amount) return { ok: false, reason: 'Insufficient goods.' };
        r[a.resource] -= a.amount;
        r.gold += a.amount * price.sell;
      }
      return { ok: true };
    }
    case 'workplace': {
      const b = s.buildings.find((b) => b.id === a.id && b.team === team && b.hp > 0);
      if (!b || !TYPES[b.type].workers)
        return { ok: false, reason: 'Choose one of your workplaces.' };
      if (a.paused) {
        b.paused = true;
        b.active = 0;
        const bonus = TYPES[b.type].bonus;
        if (bonus) {
          const working = s.buildings.some(
            (other) =>
              other.team === team &&
              other.hp > 0 &&
              !other.paused &&
              TYPES[other.type].bonus === bonus &&
              (other.active || 0) > 0.5,
          );
          if (bonus === 'faith') s.factions[team]!.faith = working ? 6 : 0;
          else s.factions[team]!.aleBonus = working ? 8 : 0;
        }
      } else delete b.paused;
      return { ok: true };
    }
    case 'repair':
    case 'demolish':
    case 'gate': {
      const b = s.buildings.find((b) => b.id === a.id && b.team === team && b.hp > 0);
      if (!b) return { ok: false, reason: 'Choose one of your buildings.' };
      if (a.type === 'gate') {
        if (b.type !== 'gate' || typeof a.open !== 'boolean')
          return { ok: false, reason: 'Choose a gate and its open state.' };
        if (
          !a.open &&
          s.units.some(
            (u) =>
              u.hp > 0 &&
              !u.garrisonId &&
              Math.hypot(
                u.x - Math.max(b.x, Math.min(b.x + TYPES[b.type].size, u.x)),
                u.y - Math.max(b.y, Math.min(b.y + TYPES[b.type].size, u.y)),
              ) < unitRadius(u),
          )
        )
          return { ok: false, reason: 'A soldier is standing in the gate.' };
        b.open = a.open;
        invalidate(s);
        return { ok: true };
      }
      if (a.type === 'demolish') {
        if (b.type === 'keep') return { ok: false, reason: 'Your lord cannot demolish the keep.' };
        const refund = Object.fromEntries(
          resourceEntries(TYPES[b.type].cost).map(([k, v]) => [
            k,
            (v * 0.4 * b.hp) / TYPES[b.type].hp,
          ]),
        );
        for (const [k, v] of resourceEntries(refund))
          resourcesFor(s, team)[k] = Math.max(
            resourcesFor(s, team)[k],
            Math.min(storageCapacity(s, k, team), resourcesFor(s, team)[k] + v),
          );
        hit(s, center(b), b, 99999, {});
        return { ok: true };
      }
      if (b.fire) return { ok: false, reason: 'Extinguish this building before repairing it.' };
      if (finite(b.lastHit) && s.time - b.lastHit < 6)
        return { ok: false, reason: 'Repairs require six seconds out of combat.' };
      const missing = 1 - b.hp / TYPES[b.type].hp;
      if (missing <= 0) return { ok: false, reason: 'This building is undamaged.' };
      const cost = { stone: Math.ceil(12 * missing), wood: Math.ceil(8 * missing) };
      if (!affordable(s, cost, team)) return { ok: false, reason: 'Repairs need wood and stone.' };
      spend(s, cost, team);
      b.hp = TYPES[b.type].hp;
      return { ok: true };
    }
    case 'stance': {
      if (!validIds(s, a.ids, team) || !['aggressive', 'defensive', 'hold'].includes(a.stance))
        return { ok: false, reason: 'Choose owned troops and a valid stance.' };
      for (const u of s.units)
        if (a.ids.includes(u.id)) {
          u.stance = a.stance;
          if (a.stance === 'hold') {
            u.path = [];
            u.goal = null;
            u.targetId = null;
          }
        }
      return { ok: true };
    }
    case 'garrison': {
      const b = s.buildings.find(
        (b) => b.id === a.buildingId && b.team === team && b.hp > 0 && TYPES[b.type].garrison,
      );
      if (
        !b ||
        !validIds(s, a.ids, team) ||
        a.ids.some((id) => !TROOPS[s.units.find((u) => u.id === id)!.type].canGarrison)
      )
        return { ok: false, reason: 'Choose owned ranged infantry and a watchtower.' };
      const existing = s.units.filter((u) => u.garrisonId === b.id && !a.ids.includes(u.id)).length;
      if (existing + a.ids.length > (TYPES[b.type].garrison || 0))
        return { ok: false, reason: 'This tower holds six ranged troops.' };
      if (
        a.ids.some(
          (id) =>
            distance(
              s.units.find((u) => u.id === id)!,
              center(b),
            ) > 12,
        )
      )
        return { ok: false, reason: 'Move troops within twelve tiles of the tower.' };
      for (const u of s.units)
        if (a.ids.includes(u.id)) {
          u.garrisonId = b.id;
          Object.assign(u, center(b));
          u.path = [];
          u.goal = null;
          u.targetId = null;
        }
      return { ok: true };
    }
    case 'ungarrison': {
      const b = s.buildings.find((b) => b.id === a.buildingId && b.team === team && b.hp > 0);
      if (!b) return { ok: false, reason: 'Choose an owned tower.' };
      for (const u of s.units)
        if (u.garrisonId === b.id) {
          const p = findOpen(s, b.x, b.y, team, undefined, undefined, 9, u.type);
          if (p) {
            u.garrisonId = null;
            u.x = p.x + 0.5;
            u.y = p.y + 0.5;
          }
        }
      return { ok: true };
    }
    case 'invade':
      if (s.mode !== 'sandbox' || team !== 'player')
        return { ok: false, reason: 'Manual invasions are available in sandbox.' };
      if (s.units.some((u) => u.team === 'enemy'))
        return { ok: false, reason: 'Repel the current invasion first.' };
      return launchWave(s);
    default:
      return { ok: false, reason: 'Unknown action.' };
  }
}
