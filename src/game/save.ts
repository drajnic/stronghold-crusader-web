import { FIRE_DURATION, FIRE_SPREAD_INTERVAL, isFlammable } from './fire.js';
import { DEFAULT_MAP, parseMap } from './map-definition.js';
import { TYPES, TROOPS, RESOURCE_KEYS, SIZE, MAX_UNITS, SCENARIOS } from './catalog.js';
import { clamp, finite, isRecord, emptyResources } from './utils.js';
import { aliases } from './economy.js';
import { cells, terrain } from './map.js';
import { pathfind } from './pathfinding.js';
import { resolveUnitOverlaps } from './spatial.js';
import type { GameState, Factions, Building, Point } from './types.js';
import { isTeam, isBuildingType, isTroopType, isStance } from './action-schema.js';
export function serialize(s: GameState): string {
  return JSON.stringify({
    version: 3,
    map: s.map,
    time: s.time,
    mode: s.mode,
    difficulty: s.difficulty,
    scenario: s.scenario,
    multiplayerMode: s.multiplayerMode,
    status: s.status,
    winner: s.winner,
    factions: Object.fromEntries(
      Object.entries(s.factions).map(([team, f]) => [
        team,
        {
          name: f.name,
          resources: Object.fromEntries(RESOURCE_KEYS.map((k) => [k, f.resources[k]])),
          civilians: f.civilians,
          popularity: f.popularity,
          tax: f.tax,
          rations: f.rations,
          defeated: f.defeated,
          growth: f.growth,
          aiTimer: f.aiTimer,
          attackTimer: f.attackTimer,
          aiStep: f.aiStep,
          faith: f.faith,
          aleBonus: f.aleBonus,
        },
      ]),
    ),
    buildings: s.buildings
      .filter((b) => b.hp > 0)
      .map((b) => ({
        id: b.id,
        type: b.type,
        team: b.team,
        x: b.x,
        y: b.y,
        hp: b.hp,
        shot: b.shot,
        open: b.open,
        active: b.active,
        ...(b.paused === true ? { paused: true } : {}),
        lastHit: b.lastHit,
        fire: b.fire ? { ...b.fire } : undefined,
        rallyPoint: b.rallyPoint ? { ...b.rallyPoint } : undefined,
      })),
    units: s.units
      .filter((u) => u.hp > 0)
      .map((u) => ({
        id: u.id,
        type: u.type,
        team: u.team,
        x: u.x,
        y: u.y,
        hp: u.hp,
        attack: u.attack,
        repath: u.repath,
        goal: u.goal ? { x: u.goal.x, y: u.goal.y } : null,
        stance: u.stance,
        garrisonId: u.garrisonId,
        attackMove: u.attackMove,
        path: [],
        targetId: [...s.units, ...s.buildings].some((e) => e.id === u.targetId && e.hp > 0)
          ? u.targetId
          : null,
      })),
    nextId: s.nextId,
    wave: s.wave,
    nextWave: s.nextWave,
    kills: s.kills,
    tutorial: s.tutorial,
    invasionActive: s.invasionActive,
    events: s.events.slice(-10),
  });
}

function invalid(message = 'This save is not valid.'): never {
  throw Error(message);
}
function record(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(message);
  return value;
}
function number(
  value: unknown,
  message: string,
  min = -Infinity,
  max = Infinity,
  integer = false,
): number {
  if (!finite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value)))
    invalid(message);
  return value;
}
function choice<T extends string>(
  value: unknown,
  values: readonly T[],
  message = 'This save is not valid.',
): T {
  if (typeof value !== 'string' || !values.includes(value as T)) invalid(message);
  return value as T;
}
const counter = (value: unknown): number =>
  finite(value) && Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1000000) : 0;
const bounded = (value: unknown, min: number, max: number, fallback: number) =>
  finite(value) ? clamp(value, min, max) : fallback;
/** Validate unknown JSON and rebuild a fresh domain object; transport fields never enter game state. */
export function deserialize(
  raw: string,
  { rebuildPaths = true }: { rebuildPaths?: boolean } = {},
): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalid('This save could not be read.');
  }
  const data = record(parsed, 'This save is not valid.');
  if (data.version !== 2 && data.version !== 3)
    invalid('This save uses an older game format. Start a new realm for the expanded game.');
  const mode = choice(data.mode, [
      'skirmish',
      'survival',
      'sandbox',
      'campaign',
      'multiplayer',
    ] as const),
    difficulty = choice(data.difficulty, ['easy', 'normal', 'hard'] as const),
    multiplayerMode = choice(data.multiplayerMode, ['coop', 'versus'] as const),
    status = choice(data.status, ['playing', 'victory', 'defeat'] as const),
    scenario = number(data.scenario, 'Invalid saved scenario.', 0, SCENARIOS.length - 1, true);
  const time = number(data.time, 'Invalid saved time.', 0),
    nextId = number(data.nextId, 'Invalid saved identifier.', 1, Number.MAX_SAFE_INTEGER, true),
    wave = number(data.wave, 'Invalid saved wave.', 0, 10000, true),
    nextWave = number(data.nextWave, 'Invalid saved wave time.');
  if (
    !Array.isArray(data.buildings) ||
    !Array.isArray(data.units) ||
    data.buildings.length > 1600 ||
    data.units.length > MAX_UNITS
  )
    invalid();
  const factionData = record(data.factions, 'Invalid saved factions.');
  const parsedFactions: Partial<Factions> = {};
  for (const [team, value] of Object.entries(factionData)) {
    if (!isTeam(team)) invalid('Invalid saved faction.');
    const f = record(value, 'Invalid saved faction.'),
      r = record(f.resources, 'Invalid saved resources.');
    const resources = emptyResources();
    for (const key of RESOURCE_KEYS)
      resources[key] = number(r[key], 'Invalid saved resources.', 0, 999999);
    if (typeof f.defeated !== 'boolean') invalid('Invalid saved faction.');
    parsedFactions[team] = {
      name: typeof f.name === 'string' ? f.name.slice(0, 80) : team,
      resources,
      civilians: number(f.civilians, 'Invalid saved faction.', 0, 160, true),
      popularity: number(f.popularity, 'Invalid saved faction.', 0, 100),
      tax: number(f.tax, 'Invalid saved faction.', -3, 3, true),
      rations: number(f.rations, 'Invalid saved faction.', 0, 3, true),
      defeated: f.defeated,
      growth: bounded(f.growth, 0, 20, 0),
      aiTimer: bounded(f.aiTimer, 0, 10, 5),
      attackTimer: bounded(f.attackTimer, 0, 200, 70),
      aiStep: finite(f.aiStep) && Number.isInteger(f.aiStep) ? clamp(f.aiStep, 0, 100000) : 0,
      faith: bounded(f.faith, 0, 6, 0),
      aleBonus: bounded(f.aleBonus, 0, 8, 0),
    };
  }
  if (!parsedFactions.player) invalid('The saved player faction is missing.');
  const factions: Factions = { ...parsedFactions, player: parsedFactions.player };
  if ((mode !== 'multiplayer' || multiplayerMode === 'coop') && !factions.enemy)
    invalid('The saved opposing faction is missing.');
  if (mode === 'multiplayer' && !factions.player2) invalid('The saved second lord is missing.');
  const tutorial = isRecord(data.tutorial) ? data.tutorial : {};
  const s = aliases({
    version: 3,
    map: data.version === 2 ? DEFAULT_MAP : parseMap(data.map),
    time,
    mode,
    difficulty,
    scenario,
    multiplayerMode,
    status,
    winner: isTeam(data.winner) ? data.winner : null,
    factions,
    buildings: [],
    units: [],
    effects: [],
    events: [],
    nextId,
    mapRevision: 0,
    wave,
    nextWave,
    kills: finite(data.kills) && Number.isInteger(data.kills) ? Math.max(0, data.kills) : 0,
    tutorial: {
      built: counter(tutorial.built),
      recruited: counter(tutorial.recruited),
      firstRepelled: !!tutorial.firstRepelled,
    },
    invasionActive: !!data.invasionActive,
  });
  const ids = new Set<number>(),
    occupied = new Set<number>();
  function entity(value: unknown) {
    const e = record(value, 'Invalid saved entity.');
    if (!finite(e.x) || !finite(e.y) || e.x >= SIZE - 1 || e.y >= SIZE - 1)
      invalid('Invalid saved entity.');
    const id = number(e.id, 'Invalid saved entity.', 1, nextId - 1, true);
    if (ids.has(id) || !isTeam(e.team) || !Object.hasOwn(factions, e.team))
      invalid('Invalid saved entity.');
    ids.add(id);
    return {
      data: e,
      id,
      team: e.team,
      x: number(e.x, 'Invalid saved entity.', 1),
      y: number(e.y, 'Invalid saved entity.', 1),
      hp: number(e.hp, 'Invalid saved entity.', Number.MIN_VALUE),
    };
  }
  // Entity bounds are validated explicitly; each building footprint is checked separately.
  for (const value of data.buildings) {
    const e = entity(value),
      b = e.data;
    if (
      !isBuildingType(b.type) ||
      !Number.isInteger(e.x) ||
      !Number.isInteger(e.y) ||
      e.x + TYPES[b.type].size > SIZE - 1 ||
      e.y + TYPES[b.type].size > SIZE - 1 ||
      (Object.hasOwn(b, 'paused') && typeof b.paused !== 'boolean') ||
      e.hp > TYPES[b.type].hp
    )
      invalid('Invalid saved building.');
    const building: Building = {
      id: e.id,
      type: b.type,
      team: e.team,
      x: e.x,
      y: e.y,
      hp: e.hp,
      lastHit: finite(b.lastHit) ? clamp(b.lastHit, 0, time) : undefined,
      open: b.type === 'gate' && !!b.open,
      shot: bounded(b.shot, 0, 5, 0),
      active: b.paused === true ? 0 : bounded(b.active, 0, 1, 1),
      ...(b.paused === true ? { paused: true } : {}),
    };
    if (Object.hasOwn(b, 'fire')) {
      const fire = record(b.fire, 'Invalid saved fire.');
      if (
        !isFlammable(building.type) ||
        Object.keys(fire).some((key) => !['remaining', 'spread'].includes(key))
      )
        invalid('Invalid saved fire.');
      building.fire = {
        remaining: number(fire.remaining, 'Invalid saved fire.', Number.MIN_VALUE, FIRE_DURATION),
        spread: number(fire.spread, 'Invalid saved fire.', Number.MIN_VALUE, FIRE_SPREAD_INTERVAL),
      };
      building.active = 0;
    }
    if (Object.hasOwn(b, 'rallyPoint')) {
      const point = record(b.rallyPoint, 'Invalid saved rally point.');
      if (
        Object.keys(point).some((key) => !['x', 'y'].includes(key)) ||
        !['barracks', 'mercenary', 'siege'].includes(building.type)
      )
        invalid('Invalid saved rally point.');
      building.rallyPoint = {
        x: number(point.x, 'Invalid saved rally point.', 1, SIZE - 1),
        y: number(point.y, 'Invalid saved rally point.', 1, SIZE - 1),
      };
      if (building.rallyPoint.x >= SIZE - 1 || building.rallyPoint.y >= SIZE - 1)
        invalid('Invalid saved rally point.');
    }
    for (const p of cells(building)) {
      const key = p.y * SIZE + p.x;
      if (occupied.has(key) || terrain(p.x, p.y, s.map) === 'water')
        invalid('Saved buildings overlap or occupy water.');
      occupied.add(key);
    }
    s.buildings.push(building);
  }
  const pending = data.units.map((value) => entity(value));
  for (const e of pending) {
    const u = e.data;
    if (!isTroopType(u.type) || e.hp > TROOPS[u.type].hp || e.x >= SIZE - 1 || e.y >= SIZE - 1)
      invalid('Invalid saved soldier.');
    let goal: Point | null = null;
    if (u.goal) {
      const g = record(u.goal, 'Invalid saved troop destination.');
      goal = {
        x: number(g.x, 'Invalid saved troop destination.', 1),
        y: number(g.y, 'Invalid saved troop destination.', 1),
      };
      if (goal.x >= SIZE - 1 || goal.y >= SIZE - 1) invalid('Invalid saved troop destination.');
    }
    let targetId: number | null = null;
    if (u.targetId != null) {
      targetId = number(
        u.targetId,
        'Invalid saved attack target.',
        1,
        Number.MAX_SAFE_INTEGER,
        true,
      );
      if (!ids.has(targetId)) invalid('Invalid saved attack target.');
    }
    let garrisonId: number | null = null;
    if (u.garrisonId != null) {
      garrisonId = number(
        u.garrisonId,
        'Invalid saved garrison.',
        1,
        Number.MAX_SAFE_INTEGER,
        true,
      );
      if (
        !TROOPS[u.type].canGarrison ||
        !s.buildings.some((b) => b.id === garrisonId && b.team === e.team && TYPES[b.type].garrison)
      )
        invalid('Invalid saved garrison.');
    }
    s.units.push({
      id: e.id,
      type: u.type,
      team: e.team,
      x: e.x,
      y: e.y,
      hp: e.hp,
      attack: bounded(u.attack, 0, 5, 0),
      repath: 0,
      path: [],
      goal,
      targetId,
      garrisonId,
      stance: isStance(u.stance) ? u.stance : 'defensive',
      attackMove: !!u.attackMove,
    });
  }
  for (const b of s.buildings)
    if (
      TYPES[b.type].garrison &&
      s.units.filter((u) => u.garrisonId === b.id).length > (TYPES[b.type].garrison || 0)
    )
      invalid('Saved tower is over capacity.');
  const kind = mode === 'campaign' ? SCENARIOS[scenario].kind : mode;
  for (const [team, f] of Object.entries(factions))
    if (
      status === 'playing' &&
      !f.defeated &&
      (team !== 'enemy' || kind === 'skirmish' || mode === 'multiplayer') &&
      !s.buildings.some((b) => b.team === team && b.type === 'keep')
    )
      invalid('The saved keep is missing.');
  if (Array.isArray(data.effects))
    for (const value of data.effects.slice(0, 140)) {
      if (!isRecord(value)) continue;
      const e = value;
      if (
        !finite(e.x) ||
        !finite(e.y) ||
        !finite(e.life) ||
        !finite(e.max) ||
        e.x < 0 ||
        e.y < 0 ||
        e.x >= SIZE ||
        e.y >= SIZE ||
        e.life <= 0 ||
        e.life > 1 ||
        e.max <= 0 ||
        e.max > 1 ||
        (e.tx !== undefined && (!finite(e.tx) || e.tx < 0 || e.tx >= SIZE)) ||
        (e.ty !== undefined && (!finite(e.ty) || e.ty < 0 || e.ty >= SIZE)) ||
        (e.type !== 'arrow' && e.type !== 'hit')
      )
        continue;
      s.effects.push({
        x: e.x,
        y: e.y,
        tx: e.tx,
        ty: e.ty,
        life: e.life,
        max: e.max,
        type: e.type,
      });
    }
  if (Array.isArray(data.events))
    for (const value of data.events.slice(-10)) {
      if (
        isRecord(value) &&
        finite(value.time) &&
        value.time >= 0 &&
        value.time <= time &&
        typeof value.text === 'string'
      )
        s.events.push({ time: value.time, text: value.text.slice(0, 200) });
    }
  if (rebuildPaths) resolveUnitOverlaps(s);
  if (rebuildPaths)
    for (const u of s.units) if (u.goal && !u.garrisonId) u.path = pathfind(s, u, u.goal, u.team);
  return s;
}
