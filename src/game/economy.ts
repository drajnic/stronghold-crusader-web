import { TYPES } from './catalog.js';
import { clamp, finite, emptyResources, resourceEntries } from './utils.js';
import type {
  GameState,
  StateData,
  Team,
  Faction,
  Difficulty,
  ResourceKey,
  ResourceCost,
  ResourceStock,
  PopularityBreakdown,
  BuildingDefinition,
} from './types.js';
const FOOD = new Set<ResourceKey>(['food', 'wheat', 'flour', 'hops', 'ale']),
  ARMS = new Set<ResourceKey>([
    'bows',
    'crossbows',
    'spears',
    'pikes',
    'maces',
    'swords',
    'armor',
    'leather',
    'horses',
  ]);
export const factionFor = (s: GameState, team: Team = 'player'): Faction | undefined =>
  s.factions && Object.hasOwn(s.factions, team) ? s.factions[team] : undefined;
export function resourcesFor(s: GameState, team: Team = 'player'): ResourceStock {
  const f = factionFor(s, team);
  if (!f) throw Error('This faction is not active.');
  return f.resources;
}
export function hostile(s: GameState, a: Team, b: Team) {
  if (a === b) return false;
  if (!factionFor(s, a) || !factionFor(s, b)) return false;
  return !(s.multiplayerMode === 'coop' && [a, b].every((t) => t === 'player' || t === 'player2'));
}
export const affordable = (s: GameState, cost: ResourceCost, team: Team = 'player') =>
  !!factionFor(s, team) &&
  resourceEntries(cost || {}).every(
    ([k, v]) => finite(v) && v >= 0 && (resourcesFor(s, team)[k] || 0) >= v,
  );
export const workforce = (s: GameState, team: Team = 'player') =>
  s.buildings.reduce(
    (n, b) =>
      n + (b.team === team && b.hp > 0 && !b.paused && !b.fire ? TYPES[b.type].workers || 0 : 0),
    0,
  );
export const capacity = (s: GameState, team: Team = 'player') =>
  s.buildings.reduce(
    (n, b) => n + (b.team === team && b.hp > 0 ? TYPES[b.type].housing || 0 : 0),
    0,
  );
export const population = (s: GameState, team: Team = 'player') =>
  (factionFor(s, team)?.civilians || 0) + s.units.filter((u) => u.team === team && u.hp > 0).length;
export function storageCapacity(s: GameState, key: ResourceKey, team: Team = 'player') {
  if (key === 'gold') return 999999;
  const kind = FOOD.has(key) ? 'food' : ARMS.has(key) ? 'arms' : 'raw';
  return (
    (kind === 'arms' ? 40 : 500) +
    s.buildings.reduce(
      (n, b) =>
        n +
        (b.team === team && b.hp > 0 && TYPES[b.type].storage === kind
          ? TYPES[b.type].storageCapacity || 0
          : 0),
      0,
    )
  );
}
/** Kind rule trades productivity for popularity and military morale. */
export function fearFactor(s: GameState, team: Team = 'player') {
  const score = clamp(
    s.buildings.reduce(
      (n, b) =>
        n +
        (b.team === team && b.hp > 0
          ? b.type === 'garden'
            ? 1
            : b.type === 'gallows'
              ? -1
              : 0
          : 0),
      0,
    ),
    -5,
    5,
  );
  return { score, productivity: 1 - score * 0.05, morale: 1 + score * 0.05, popularity: score * 2 };
}
export function popularityBreakdown(
  s: GameState,
  team: Team = 'player',
): PopularityBreakdown | null {
  const f = factionFor(s, team);
  return f
    ? {
        base: 55,
        rations: f.rations * 10,
        tax: -f.tax * 9,
        faith: f.faith || 0,
        ale: f.aleBonus || 0,
        hunger: f.resources.food > 0 ? 0 : -45,
        fear: fearFactor(s, team).popularity,
        target: clamp(
          55 +
            f.rations * 10 -
            f.tax * 9 +
            (f.faith || 0) +
            (f.aleBonus || 0) +
            fearFactor(s, team).popularity -
            (f.resources.food > 0 ? 0 : 45),
          0,
          100,
        ),
      }
    : null;
}
export function spend(s: GameState, cost: ResourceCost, team: Team) {
  for (const [k, v] of resourceEntries(cost)) resourcesFor(s, team)[k] -= v;
}
export function aliases(s: StateData): GameState {
  for (const k of ['resources', 'civilians', 'popularity', 'tax', 'rations'] as const)
    Object.defineProperty(s, k, {
      configurable: true,
      enumerable: false,
      get() {
        return s.factions.player[k];
      },
      set(v: unknown) {
        if (k === 'resources') {
          if (v && typeof v === 'object') s.factions.player.resources = v as ResourceStock;
        } else if (typeof v === 'number') s.factions.player[k] = v;
      },
    });
  return s as GameState;
}
export function makeFaction(team: Team, difficulty: Difficulty): Faction {
  const r = emptyResources();
  Object.assign(r, {
    wood: 350,
    stone: 250,
    food: 320,
    gold: 400,
    iron: 20,
    pitch: 20,
    bows: 10,
    crossbows: 3,
    spears: 8,
    pikes: 3,
    maces: 3,
    swords: 5,
    armor: 8,
    leather: 6,
    horses: 2,
  });
  if (team === 'enemy') {
    const factor = difficulty === 'easy' ? 0.75 : difficulty === 'hard' ? 1.35 : 1;
    for (const k of ['wood', 'stone', 'food', 'gold'] as const) r[k] *= factor;
  }
  return {
    name: team === 'enemy' ? 'Emir Rashid' : team === 'player2' ? 'Second Lord' : 'Your Lord',
    resources: r,
    civilians: 28,
    popularity: 65,
    tax: 1,
    rations: 2,
    defeated: false,
    growth: 0,
    aiTimer: 7,
    attackTimer: 100,
    aiStep: 0,
    faith: 0,
    aleBonus: 0,
  };
}
export function production(s: GameState, dt: number, mutate: boolean) {
  const all: Partial<Record<Team, ResourceStock>> = {};
  for (const [team, f] of Object.entries(s.factions) as [Team, Faction][]) {
    let labor = f.civilians;
    const productivity = fearFactor(s, team).productivity;
    const r = mutate ? f.resources : { ...f.resources },
      out = emptyResources();
    let faith = 0,
      ale = 0;
    const ordered =
      r.food < 10
        ? [...s.buildings].sort((a, b) => {
            const priority = (d: BuildingDefinition) =>
              d.rate?.food ? 3 : d.rate?.flour ? 2 : d.rate?.wheat ? 1 : 0;
            return priority(TYPES[b.type]) - priority(TYPES[a.type]);
          })
        : s.buildings;
    for (const b of ordered) {
      if (b.team !== team || b.hp <= 0) continue;
      const d = TYPES[b.type];
      if (!d.workers) continue;
      if (b.paused || b.fire) {
        if (mutate) b.active = 0;
        continue;
      }
      const throughput = d.bonus ? 1 : productivity;
      let factor = Math.min(labor, d.workers) / d.workers;
      for (const [k, v] of resourceEntries(d.input || {}))
        factor = Math.min(factor, r[k] / Math.max(0.00001, v * throughput * dt));
      for (const [k, v] of resourceEntries(d.rate || {}))
        factor = Math.min(
          factor,
          Math.max(0, storageCapacity(s, k, team) - r[k]) / Math.max(0.00001, v * throughput * dt),
        );
      factor = clamp(factor, 0, 1);
      // Idle workshops release labor, so an empty chain can restart from its farm.
      labor = Math.max(0, labor - d.workers * factor);
      if (mutate) b.active = factor;
      for (const [k, v] of resourceEntries(d.input || {})) {
        r[k] -= v * factor * throughput * dt;
        out[k] -= v * factor * throughput;
      }
      for (const [k, v] of resourceEntries(d.rate || {})) {
        r[k] += v * factor * throughput * dt;
        out[k] += v * factor * throughput;
      }
      if (d.bonus === 'faith' && factor > 0.5) faith = 6;
      if (d.bonus === 'ale' && factor > 0.5) ale = 8;
    }
    const food = f.civilians * 0.04 * f.rations,
      eaten = Math.min(r.food, food * dt);
    r.food -= eaten;
    out.food -= eaten / dt;
    const revenue = f.civilians * 0.012 * f.tax;
    const nextGold = clamp(r.gold + revenue * dt, 0, 999999);
    out.gold += (nextGold - r.gold) / dt;
    r.gold = nextGold;
    if (mutate) {
      f.faith = faith;
      f.aleBonus = ale;
    }
    all[team] = out;
  }
  return all;
}
export function income(s: GameState, team: Team = 'player'): ResourceStock {
  return production(s, 0.05, false)[team] || emptyResources();
}
export function updatePolitics(s: GameState, dt: number) {
  for (const [team, f] of Object.entries(s.factions) as [Team, Faction][]) {
    if (f.defeated) continue;
    const target = popularityBreakdown(s, team)!.target;
    f.popularity = clamp(f.popularity + clamp(target - f.popularity, -dt * 1.5, dt * 1.5), 0, 100);
    f.growth += dt;
    const period = f.popularity >= 55 ? 8 : f.popularity < 35 ? 6 : 12;
    if (f.growth >= period) {
      f.growth = 0;
      if (
        f.civilians < 2 &&
        s.buildings.some((b) => b.team === team && b.type === 'keep' && b.hp > 0)
      )
        f.civilians++;
      else if (
        f.popularity >= 55 &&
        population(s, team) < capacity(s, team) &&
        population(s, team) < 90
      )
        f.civilians++;
      else if (f.popularity < 35 && f.civilians > 2) f.civilians--;
    }
  }
}
