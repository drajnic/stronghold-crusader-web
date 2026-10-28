import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/game/index.js';
import { positionClear, unitRadius } from '../src/game/spatial.js';
import type {
  GameState,
  Team,
  BuildingType,
  TroopType,
  Unit,
  Building,
  GameOptions,
} from '../src/game/index.js';
function required<T>(value: T | undefined | null): T {
  assert.ok(value);
  return value;
}
const advance = (s: GameState, seconds: number) => {
  for (let n = 0; n < Math.ceil(seconds / 0.05) && s.status === 'playing'; n++) m.update(s, 0.05);
};
const sandbox = () => m.createGame({ mode: 'sandbox' });
function buildAt(s: GameState, type: BuildingType, team: Team = 'player'): Building {
  for (let y = 1; y < m.SIZE - 3; y++)
    for (let x = 1; x < m.SIZE - 3; x++)
      if (m.canPlace(s, type, x, y, team).ok)
        return required(m.place(s, type, x, y, team).building);
  throw Error(`No site for ${type}`);
}
function rich(s: GameState, team: Team = 'player') {
  for (const k of m.RESOURCE_KEYS) m.resourcesFor(s, team)[k] = 1000;
}
function unit(s: GameState, type: TroopType, team: Team, x: number, y: number): Unit {
  const u: Unit = {
    id: s.nextId++,
    type,
    team,
    x,
    y,
    hp: m.TROOPS[type].hp,
    attack: 0,
    path: [],
    goal: null,
    repath: 0,
    stance: 'hold',
    garrisonId: null,
    targetId: null,
  };
  s.units.push(u);
  return u;
}
function building(s: GameState, type: BuildingType, team: Team, x: number, y: number): Building {
  const b: Building = {
    id: s.nextId++,
    type,
    team,
    x,
    y,
    hp: m.TYPES[type].hp,
    shot: 0,
    open: true,
  };
  s.buildings.push(b);
  return b;
}
void test('64×64 factories, factions, alliances and campaign scenarios are distinct and roundtrip', () => {
  assert.equal(m.SIZE, 64);
  assert.ok(Object.keys(m.TYPES).length >= 30);
  assert.ok(Object.values(m.TROOPS).filter((d) => !d.untrainable).length >= 18);
  for (const options of [
    { mode: 'skirmish' },
    { mode: 'skirmish', scenario: 1 },
    { mode: 'skirmish', scenario: 2 },
    { mode: 'survival' },
    { mode: 'sandbox' },
    ...[0, 1, 2].map((scenario) => ({ mode: 'campaign', scenario })),
    { mode: 'multiplayer', multiplayerMode: 'coop' },
    { mode: 'multiplayer', multiplayerMode: 'versus' },
  ] as GameOptions[]) {
    const s = m.createGame(options),
      loaded = m.deserialize(m.serialize(s));
    assert.equal(loaded.mode, s.mode);
    assert.deepEqual(loaded.factions, s.factions);
    assert.equal(loaded.buildings.length, s.buildings.length);
    assert.ok(loaded.buildings.every((b) => b.team));
    assert.equal(m.population(s), 32);
  }
  const coop = m.createGame({ mode: 'multiplayer' });
  assert.equal(m.hostile(coop, 'player', 'player2'), false);
  assert.equal(m.hostile(coop, 'player', 'enemy'), true);
  const versus = m.createGame({ mode: 'multiplayer', multiplayerMode: 'versus' });
  assert.equal(m.hostile(versus, 'player', 'player2'), true);
  assert.equal(versus.factions.enemy, undefined);
});
void test('economy net-income preview matches real short-step output and labor allocation', () => {
  const s = sandbox(),
    before = { ...s.resources },
    rate = m.income(s);
  m.update(s, 0.05);
  for (const k of m.RESOURCE_KEYS)
    assert.ok(Math.abs(s.resources[k] - before[k] - rate[k] * 0.05) < 1e-7, k);
  assert.equal(m.workforce(s), 10);
  assert.equal(m.capacity(s), 36);
  assert.equal(m.population(s), 32);
  s.civilians = 1;
  assert.ok(m.income(s).wood > 0);
  assert.equal(m.income(s).stone, 0);
});
void test('production chains consume wheat/flour/hops/iron/wood rather than minting outputs', () => {
  const s = sandbox();
  rich(s);
  s.buildings = s.buildings.filter((b) => b.type === 'keep');
  s.civilians = 40;
  for (const [type, x] of [
    ['mill', 10],
    ['bakery', 13],
    ['brewery', 16],
    ['fletcher', 19],
    ['blacksmith', 22],
    ['armorer', 25],
  ] as [BuildingType, number][])
    building(s, type, 'player', x, 39);
  for (const k of m.RESOURCE_KEYS) s.resources[k] = 0;
  s.resources.food = 10;
  s.tax = 0;
  s.rations = 0;
  advance(s, 2);
  for (const k of [
    'food',
    'flour',
    'ale',
    'bows',
    'crossbows',
    'swords',
    'maces',
    'armor',
  ] as const)
    assert.equal(s.resources[k], k === 'food' ? 10 : 0, k);
  Object.assign(s.resources, { wheat: 20, hops: 10, wood: 20, iron: 20 });
  advance(s, 1);
  assert.ok(s.resources.wheat < 20);
  assert.ok(s.resources.flour > 0);
  assert.ok(s.resources.food > 10);
  assert.ok(s.resources.hops < 10 && s.resources.ale > 0);
  assert.ok(s.resources.wood < 20 && s.resources.bows > 0 && s.resources.crossbows > 0);
  assert.ok(s.resources.iron < 20 && s.resources.swords > 0 && s.resources.armor > 0);
});
void test('storage stops production; marketplace uses actual prices and ownership', () => {
  const s = sandbox();
  s.resources.wood = m.storageCapacity(s, 'wood');
  const before = s.resources.wood;
  advance(s, 1);
  assert.equal(s.resources.wood, before);
  s.resources.gold = 100;
  const r = s.resources.stone;
  assert.equal(
    m.applyAction(s, { type: 'trade', resource: 'stone', amount: 3, buy: true }).ok,
    true,
  );
  assert.equal(s.resources.stone, r + 3);
  assert.equal(s.resources.gold, 100 - 3 * m.PRICES.stone.buy);
  assert.equal(
    m.applyAction(s, { type: 'trade', resource: 'stone', amount: 2, buy: false }).ok,
    true,
  );
  assert.equal(
    m.applyAction(s, { type: 'trade', resource: 'gold', amount: 2, buy: true }).ok,
    false,
  );
  assert.equal(
    m.applyAction(s, { type: 'trade', resource: 'wood', amount: Infinity, buy: true }).ok,
    false,
  );
});
void test('rations, taxation, faith and ale alter popularity, migration and treasury', () => {
  const good = sandbox(),
    bad = sandbox();
  good.tax = -1;
  good.rations = 3;
  bad.tax = 3;
  bad.rations = 0;
  bad.resources.food = 0;
  bad.buildings = bad.buildings.filter((b) => b.type !== 'farm');
  advance(good, 70);
  advance(bad, 70);
  assert.ok(good.popularity > bad.popularity + 40);
  assert.ok(good.civilians > bad.civilians);
  assert.ok(bad.resources.gold > good.resources.gold);
  assert.ok(bad.civilians >= 2, 'economic recovery floor retains two civilians');
  const s = sandbox();
  rich(s);
  buildAt(s, 'chapel');
  buildAt(s, 'inn');
  s.resources.ale = 10;
  advance(s, 1);
  assert.equal(required(m.popularityBreakdown(s)).faith, 6);
  assert.equal(required(m.popularityBreakdown(s)).ale, 8);
  assert.ok(s.resources.ale < 10);
});
void test('all recruits need their facility, equipment, civilians and distinct clear spawns', () => {
  const s = sandbox();
  s.resources.bows = 0;
  assert.equal(m.recruit(s, 'archer').ok, false);
  assert.equal(m.recruit(s, 'raider').ok, false);
  assert.equal(m.recruit(s, '__proto__').ok, false);
  s.resources.bows = 4;
  const before = { gold: s.resources.gold, civilians: s.civilians };
  const a = m.recruit(s, 'archer'),
    b = m.recruit(s, 'archer');
  assert.ok(a.ok && b.ok);
  assert.notDeepEqual(
    [required(a.unit).x, required(a.unit).y],
    [required(b.unit).x, required(b.unit).y],
  );
  assert.equal(s.resources.bows, 2);
  assert.equal(s.resources.gold, before.gold - 40);
  assert.equal(s.civilians, before.civilians - 2);
  rich(s);
  buildAt(s, 'mercenary');
  buildAt(s, 'siege');
  const swords = s.resources.swords;
  assert.ok(m.recruit(s, 'arabianswordsman').ok);
  assert.equal(s.resources.swords, swords);
  const civ = s.civilians,
    wood = s.resources.wood;
  assert.ok(m.recruit(s, 'catapult').ok);
  assert.equal(s.civilians, civ - 2);
  assert.equal(s.resources.wood, wood - required(m.TROOPS.catapult.cost.wood));
  s.civilians = 2;
  assert.equal(m.recruit(s, 'slave').ok, false);
});
void test('construction validates finite bounds, terrain, exact costs, hostile property and prototype keys', () => {
  const s = sandbox();
  assert.equal(m.canPlace(s, 'tower', 15, 43).ok, false);
  assert.equal(m.canPlace(s, 'house', NaN, 5).ok, false);
  assert.equal(m.canPlace(s, 'house', 6, 42).ok, false);
  assert.equal(m.canPlace(s, '__proto__', 10, 10).ok, false);
  assert.equal(m.canPlace(s, 'farm', 18, 49).ok, false);
  assert.equal(m.canPlace(s, 'quarry', 10, 48).ok, false);
  const before = s.resources.wood,
    b = buildAt(s, 'house');
  assert.equal(s.resources.wood, before - required(m.TYPES.house.cost.wood));
  assert.equal(m.capacity(s), 46);
  assert.equal(m.applyAction(s, { type: 'demolish', id: b.id }, 'enemy').ok, false);
});
void test('commands reject cross-team IDs and invalid targets; formations use distinct goals', () => {
  const s = m.createGame({ mode: 'multiplayer', multiplayerMode: 'versus' }),
    own = s.units.filter((u) => u.team === 'player'),
    foreign = required(s.units.find((u) => u.team === 'player2'));
  assert.equal(m.applyAction(s, { type: 'command', ids: [foreign.id], x: 20, y: 30 }).ok, false);
  assert.equal(
    m.applyAction(s, { type: 'command', ids: [own[0].id, foreign.id], x: 20, y: 30 }).ok,
    false,
  );
  assert.equal(m.applyAction(s, { type: 'command', ids: [own[0].id], x: NaN, y: 30 }).ok, false);
  assert.equal(m.applyAction(s, { type: 'policy', tax: 99 }).ok, false);
  assert.equal(m.applyAction(s, { type: 'policy', tax: 2 }, '__proto__').ok, false);
  assert.ok(
    m.command(
      s,
      own.map((u) => u.id),
      23,
      46,
    ).ok,
  );
  assert.equal(
    new Set(own.map((u) => `${required(u.goal).x},${required(u.goal).y}`)).size,
    own.length,
  );
  advance(s, 20);
  assert.equal(new Set(own.map((u) => `${Math.floor(u.x)},${Math.floor(u.y)}`)).size, own.length);
});
void test('closed gates block all armies, open gates pass; tower garrison extends range and protects troops', () => {
  const s = sandbox();
  rich(s);
  const gate = buildAt(s, 'gate');
  assert.equal(m.passable(s, gate.x, gate.y, 'player'), true);
  m.applyAction(s, { type: 'gate', id: gate.id, open: false });
  assert.equal(m.passable(s, gate.x, gate.y, 'player'), false);
  assert.equal(m.passable(s, gate.x, gate.y, 'enemy'), false);
  const tower = building(s, 'tower', 'player', 16, 37),
    archer = required(s.units.find((u) => u.type === 'archer'));
  assert.equal(
    m.applyAction(s, { type: 'garrison', ids: [archer.id], buildingId: tower.id }).ok,
    true,
  );
  const foe = unit(s, 'swordsman', 'enemy', 17, 29);
  const hp = foe.hp;
  advance(s, 2);
  assert.ok(foe.hp < hp, 'garrisoned bow reaches beyond ordinary range');
  assert.equal(archer.garrisonId, tower.id);
  assert.ok(m.applyAction(s, { type: 'ungarrison', buildingId: tower.id }).ok);
  assert.equal(archer.garrisonId, null);
  assert.equal(m.passable(s, Math.floor(archer.x), Math.floor(archer.y), 'player'), true);
});
void test('siege engines deal building damage, armor reduces arrows, repair cannot outheal combat', () => {
  const s = sandbox();
  s.units = [];
  const wall = building(s, 'wall', 'enemy', 20, 40),
    cat = unit(s, 'catapult', 'player', 15, 40);
  cat.targetId = wall.id;
  cat.stance = 'defensive';
  advance(s, 0.05);
  assert.ok(wall.hp <= m.TYPES.wall.hp - m.TROOPS.catapult.buildingDamage);
  assert.equal(m.applyAction(s, { type: 'repair', id: wall.id }, 'enemy').ok, false);
  const armored = unit(s, 'swordsman', 'enemy', 15, 36),
    bare = unit(s, 'slave', 'enemy', 18, 36);
  const hpA = armored.hp,
    hpB = bare.hp;
  const a = unit(s, 'archer', 'player', 15, 34),
    b = unit(s, 'archer', 'player', 18, 34);
  a.targetId = armored.id;
  b.targetId = bare.id;
  advance(s, 0.05);
  assert.ok(hpA - armored.hp < hpB - bare.hp);
});
void test('pathfinding breaches unavoidable hostile fortifications without freezing', () => {
  const s = sandbox();
  s.buildings = s.buildings.filter((b) => b.type === 'keep');
  s.units = [];
  for (let x = 1; x < m.SIZE - 1; x++) building(s, 'wall', 'enemy', x, 39);
  const ram = unit(s, 'ram', 'player', 16.5, 41.5);
  ram.stance = 'defensive';
  m.command(s, [ram.id], 16, 36);
  assert.ok(ram.path.some((p) => Math.floor(p.y) === 39));
  advance(s, 30);
  assert.ok(ram.y < 39, `ram crossed breach: ${ram.x},${ram.y}`);
});
void test('skirmish AI invests through real costs and recruitment, no free raid spawning', () => {
  const s = m.createGame({ mode: 'skirmish' }),
    f = required(s.factions.enemy);
  for (const k of m.RESOURCE_KEYS) f.resources[k] = 0;
  f.tax = 0;
  f.civilians = 2;
  s.buildings = s.buildings.filter(
    (b) => b.team !== 'enemy' || ['keep', 'barracks', 'house', 'market'].includes(b.type),
  );
  const initial = s.units.filter((u) => u.team === 'enemy').length;
  advance(s, 30);
  assert.equal(s.wave, 0);
  assert.equal(s.units.filter((u) => u.team === 'enemy').length, initial);
  assert.equal(s.buildings.filter((b) => b.team === 'enemy' && b.type === 'fletcher').length, 0);
  const funded = m.createGame({ mode: 'skirmish' });
  advance(funded, 90);
  assert.ok(funded.buildings.some((b) => b.team === 'enemy' && b.type === 'fletcher'));
  assert.ok(funded.units.filter((u) => u.team === 'enemy').length > 4);
  assert.ok(Object.values(required(funded.factions.enemy).resources).every((v) => v >= -1e-8));
});
void test('sandbox remains peaceful until a manual invasion, competitive modes detect keep loss', () => {
  const s = sandbox();
  advance(s, 140);
  assert.equal(s.wave, 0);
  assert.equal(s.units.filter((u) => u.team === 'enemy').length, 0);
  assert.equal(m.applyAction(s, { type: 'invade' }).ok, true);
  assert.ok(s.units.some((u) => u.team === 'enemy'));
  const duel = m.createGame({ mode: 'multiplayer', multiplayerMode: 'versus' });
  required(duel.buildings.find((b) => b.team === 'player' && b.type === 'keep')).hp = 0;
  advance(duel, 0.05);
  assert.equal(duel.winner, 'player2');
  const skirmish = m.createGame();
  required(skirmish.buildings.find((b) => b.team === 'enemy' && b.type === 'keep')).hp = 0;
  advance(skirmish, 0.05);
  assert.equal(skirmish.status, 'victory');
  const lost = sandbox();
  required(lost.buildings.find((b) => b.type === 'keep')).hp = 0;
  advance(lost, 0.05);
  assert.equal(lost.status, 'defeat');
});
void test('save validator rejects old versions, nonfinite IDs, hostile garrisons and malformed geometry', () => {
  const s = sandbox(),
    raw = m.serialize(s);
  for (const value of ['not json', '{}', '{"version":1}'])
    assert.throws(() => m.deserialize(value), Error);
  const cases: ((d: GameState) => unknown)[] = [
    (d) => (d.units[0].id = 1e50),
    (d) => Object.assign(d.units[0], { x: null }),
    (d) => (d.units[0].goal = { x: 999, y: 3 }),
    (d) => (d.factions.player.resources.wood = -2),
    (d) => (d.units[0].garrisonId = d.buildings[0].id),
    (d) => d.buildings.push({ ...d.buildings[0], id: d.nextId++ }),
    (d) => (d.buildings = []),
  ];
  for (const edit of cases) {
    const d = JSON.parse(raw) as GameState;
    edit(d);
    assert.throws(() => m.deserialize(JSON.stringify(d)), Error);
  }
  m.command(s, [s.units[0].id], 25, 46);
  advance(s, 1);
  const loaded = m.deserialize(m.serialize(s));
  assert.deepEqual(loaded.resources, s.resources);
  assert.deepEqual(loaded.units[0].goal, s.units[0].goal);
  assert.ok(loaded.units[0].path.length);
  assert.equal(m.deserialize(m.serialize(s), { rebuildPaths: false }).units[0].path.length, 0);
});
void test('a legal economy, market, recruitment and garrison strategy wins campaign one', () => {
  const s = m.createGame({ mode: 'campaign', scenario: 0, difficulty: 'easy' }),
    sites: [number, number][] = [
      [15, 39],
      [18, 37],
      [11, 38],
      [21, 36],
      [8, 38],
      [15, 36],
    ];
  let built = 0;
  for (let n = 0; n < 600 / 0.05 && s.status === 'playing'; n++) {
    if (n % 200 === 0) {
      if (built < sites.length && m.place(s, 'tower', ...sites[built]).ok) built++;
      m.recruit(s, 'archer');
      for (const tower of s.buildings.filter((b) => b.team === 'player' && b.type === 'tower')) {
        const space = 6 - s.units.filter((u) => u.garrisonId === tower.id).length,
          ids = s.units
            .filter(
              (u) =>
                u.team === 'player' &&
                m.TROOPS[u.type].range > 3 &&
                !u.garrisonId &&
                Math.hypot(u.x - tower.x, u.y - tower.y) < 12,
            )
            .slice(0, space)
            .map((u) => u.id);
        if (ids.length) m.applyAction(s, { type: 'garrison', buildingId: tower.id, ids });
      }
      if (s.resources.bows < 1 && s.resources.gold > 50)
        m.applyAction(s, { type: 'trade', resource: 'bows', amount: 2, buy: true });
    }
    m.update(s, 0.05);
  }
  assert.equal(s.status, 'victory');
  assert.equal(s.wave, 4);
  assert.ok(s.kills >= 60);
  assert.ok(required(s.buildings.find((b) => b.type === 'keep')).hp > 0);
});
void test('a legal siege expedition destroys the skirmish enemy keep and wins', () => {
  const s = m.createGame({ mode: 'skirmish', difficulty: 'normal' });
  let workshop;
  for (let y = 36; y < 52 && !workshop; y++)
    for (let x = 10; x < 25 && !workshop; x++) {
      const r = m.place(s, 'siege', x, y);
      if (r.ok) workshop = r.building;
    }
  assert.ok(workshop);
  for (const resource of [
    'bows',
    'crossbows',
    'spears',
    'pikes',
    'maces',
    'swords',
    'armor',
    'leather',
    'horses',
  ] as const) {
    const amount = Math.floor(s.resources[resource]);
    if (amount) assert.ok(m.applyAction(s, { type: 'trade', resource, amount, buy: false }).ok);
  }
  const keep = required(s.buildings.find((b) => b.team === 'enemy' && b.type === 'keep'));
  let siegeCount = 0;
  for (let n = 0; n < 350 / 0.05 && s.status === 'playing'; n++) {
    if (n % 200 === 0) {
      if (s.resources.iron < 15 && s.resources.gold > 200)
        m.applyAction(s, { type: 'trade', resource: 'iron', amount: 15, buy: true });
      const r = m.recruit(s, 'trebuchet');
      if (r.ok) {
        siegeCount++;
        assert.ok(
          m.applyAction(s, {
            type: 'command',
            ids: [required(r.unit).id],
            x: keep.x,
            y: keep.y,
            targetId: keep.id,
          }).ok,
        );
      }
      if (s.resources.wood > 150 && s.resources.gold < 250)
        m.applyAction(s, { type: 'trade', resource: 'wood', amount: 100, buy: false });
    }
    m.update(s, 0.05);
  }
  assert.ok(siegeCount >= 2);
  assert.equal(s.status, 'victory');
  assert.equal(s.winner, 'player');
  assert.equal(keep.hp, 0);
  assert.equal(m.deserialize(m.serialize(s), { rebuildPaths: false }).status, 'victory');
  assert.ok(required(s.buildings.find((b) => b.team === 'player' && b.type === 'keep')).hp > 0);
});
void test('coop continues with one allied lord and ends correctly with both lords or enemy defeated', () => {
  const s = m.createGame({ mode: 'multiplayer', multiplayerMode: 'coop' });
  required(s.buildings.find((b) => b.team === 'player' && b.type === 'keep')).hp = 0;
  advance(s, 0.05);
  assert.equal(s.status, 'playing');
  assert.equal(s.factions.player.defeated, true);
  assert.equal(m.applyAction(s, { type: 'policy', tax: 0 }).ok, false);
  required(s.buildings.find((b) => b.team === 'enemy' && b.type === 'keep')).hp = 0;
  advance(s, 0.05);
  assert.equal(s.status, 'victory');
  const lost = m.createGame({ mode: 'multiplayer' });
  for (const b of lost.buildings) if (b.type === 'keep' && b.team !== 'enemy') b.hp = 0;
  advance(lost, 0.05);
  assert.equal(lost.status, 'defeat');
});
void test('zero-civilian famine recovers through keep migrants and real farm work', () => {
  const s = sandbox();
  s.civilians = 0;
  s.popularity = 20;
  s.resources.food = 0;
  advance(s, 120);
  assert.ok(s.civilians >= 2);
  assert.ok(s.resources.food > 0);
  assert.ok(s.popularity > 50);
  const w = m.createGame({ mode: 'skirmish', scenario: 2 }),
    wolf = m.createGame({ mode: 'skirmish', scenario: 1 });
  assert.equal(required(w.factions.enemy).name, 'The Warden');
  assert.ok(w.buildings.filter((b) => b.team === 'enemy' && b.type === 'tower').length > 1);
  assert.ok(wolf.buildings.some((b) => b.team === 'enemy' && b.type === 'mercenary'));
});
void test('famine can restart an empty bread chain with two workers; public saves omit incidental secrets', () => {
  const s = sandbox();
  rich(s);
  buildAt(s, 'wheatfarm');
  buildAt(s, 'mill');
  buildAt(s, 'bakery');
  s.buildings = s.buildings.filter((b) => b.type !== 'farm');
  s.civilians = 2;
  s.resources.food = 0;
  s.resources.wheat = 0;
  s.resources.flour = 0;
  advance(s, 20);
  assert.ok(s.resources.food > 0);
  Object.assign(s, { roomToken: 'private-token' });
  Object.assign(s.factions.player, { secret: 'private-token' });
  Object.assign(s.units[0], { token: 'private-token' });
  assert.equal(m.serialize(s).includes('private-token'), false);
});

void test('actual movement traverses open gates and friendly pitch traps without stalling', () => {
  for (const [type, team] of [
    ['gate', 'player'],
    ['gate', 'enemy'],
    ['pitchtrap', 'player'],
  ] as [BuildingType, Team][]) {
    const s = sandbox();
    s.units = [];
    const u = unit(s, 'archer', team, 9.5, 10.5);
    u.stance = 'defensive';
    const b = building(s, type, 'player', 10, 10);
    b.open = true;
    assert.ok(m.command(s, [u.id], 13, 10, team).ok);
    for (let n = 0; n < 400 && u.goal; n++) m.update(s, 0.05);
    assert.ok(Math.hypot(u.x - 13.5, u.y - 10.5) < 0.1, `${team} crossed ${type}: ${u.x},${u.y}`);
    assert.equal(u.path.length, 0);
  }
});
void test('hold stance prevents autonomous pursuit while explicit movement and attack orders execute', () => {
  const s = sandbox();
  s.units = [];
  const u = unit(s, 'swordsman', 'player', 9.5, 10.5),
    foe = unit(s, 'slave', 'enemy', 15.5, 10.5);
  advance(s, 2);
  assert.equal(u.x, 9.5);
  assert.ok(m.command(s, [u.id], 12, 12).ok);
  advance(s, 8);
  assert.ok(Math.hypot(u.x - 12.5, u.y - 12.5) < 0.1);
  assert.equal(u.stance, 'hold');
  assert.ok(m.command(s, [u.id], foe.x, foe.y, 'player', { targetId: foe.id }).ok);
  advance(s, 10);
  assert.equal(foe.hp, 0);
});
void test('watchtowers accept ranged infantry and reject cavalry and siege in orders and saves', () => {
  const s = sandbox();
  s.units = [];
  const tower = building(s, 'tower', 'player', 10, 10);
  for (const type of [
    'horse_archer',
    'catapult',
    'trebuchet',
    'ballista',
    'ram',
    'swordsman',
  ] as TroopType[]) {
    const u = unit(s, type, 'player', 9.5, 10.5);
    assert.equal(m.TROOPS[type].canGarrison, false);
    assert.equal(
      m.applyAction(s, { type: 'garrison', ids: [u.id], buildingId: tower.id }).ok,
      false,
      type,
    );
    u.garrisonId = tower.id;
    assert.throws(() => m.deserialize(m.serialize(s)), /garrison/);
    u.garrisonId = null;
  }
  const archer = unit(s, 'crossbowman', 'player', 9.5, 10.5);
  assert.equal(m.TROOPS.crossbowman.canGarrison, true);
  assert.ok(m.applyAction(s, { type: 'garrison', ids: [archer.id], buildingId: tower.id }).ok);
});
void test('trebuchet minimum range applies to explicit buildings and blocking walls', () => {
  const close = sandbox();
  close.units = [];
  const wall = building(close, 'wall', 'enemy', 20, 40),
    treb = unit(close, 'trebuchet', 'player', 18.5, 40.5);
  assert.ok(m.command(close, [treb.id], 20, 40, 'player', { targetId: wall.id }).ok);
  advance(close, 10);
  assert.equal(wall.hp, m.TYPES.wall.hp);
  const breach = sandbox();
  breach.units = [];
  for (let x = 1; x < m.SIZE - 1; x++) building(breach, 'wall', 'enemy', x, 39);
  const blocked = unit(breach, 'trebuchet', 'player', 20.5, 40.5);
  assert.ok(m.command(breach, [blocked.id], 20, 35).ok);
  advance(breach, 10);
  assert.ok(
    breach.buildings.filter((b) => b.type === 'wall').every((b) => b.hp === m.TYPES.wall.hp),
  );
  const far = sandbox();
  far.units = [];
  const target = building(far, 'wall', 'enemy', 20, 40),
    valid = unit(far, 'trebuchet', 'player', 15.5, 40.5);
  assert.ok(m.command(far, [valid.id], 20, 40, 'player', { targetId: target.id }).ok);
  advance(far, 0.05);
  assert.ok(target.hp < m.TYPES.wall.hp);
});

void test('terminal battle snapshots, allied keep loss and paused demolitions hydrate without corpses', () => {
  for (const options of [
    { mode: 'skirmish' },
    { mode: 'multiplayer', multiplayerMode: 'versus' },
    { mode: 'multiplayer', multiplayerMode: 'coop' },
  ] as GameOptions[]) {
    const s = m.createGame(options);
    const doomed = options.multiplayerMode === 'versus' ? 'player2' : 'enemy';
    required(s.buildings.find((b) => b.team === doomed && b.type === 'keep')).hp = 0;
    advance(s, 0.05);
    assert.equal(s.status, 'victory');
    assert.ok(s.units.every((u) => u.hp > 0));
    const wire = JSON.parse(m.serialize(s)) as GameState;
    assert.ok(wire.units.every((u) => u.hp > 0));
    const loaded = m.deserialize(JSON.stringify(wire), { rebuildPaths: false });
    assert.equal(loaded.status, 'victory');
    assert.equal(loaded.winner, 'player');
  }
  const coop = m.createGame({ mode: 'multiplayer' });
  required(coop.buildings.find((b) => b.team === 'player2' && b.type === 'keep')).hp = 0;
  advance(coop, 0.05);
  assert.equal(coop.status, 'playing');
  assert.equal(required(m.deserialize(m.serialize(coop)).factions.player2).defeated, true);
  const paused = sandbox(),
    house = required(paused.buildings.find((b) => b.type === 'house'));
  assert.ok(m.applyAction(paused, { type: 'demolish', id: house.id }).ok);
  assert.equal(paused.time, 0);
  const loaded = m.deserialize(m.serialize(paused));
  assert.equal(
    loaded.buildings.some((b) => b.id === house.id),
    false,
  );
});
void test('demolition preserves over-capacity stocks after a store is lost and save teams cannot inherit prototypes', () => {
  const s = sandbox();
  s.resources.wood = 900;
  required(s.buildings.find((b) => b.type === 'stockpile')).hp = 0;
  assert.equal(m.storageCapacity(s, 'wood'), 500);
  const house = required(s.buildings.find((b) => b.type === 'house'));
  assert.ok(m.applyAction(s, { type: 'demolish', id: house.id }).ok);
  assert.equal(s.resources.wood, 900);
  const raw = m.serialize(s);
  for (const team of ['constructor', 'toString', '__proto__']) {
    const u = JSON.parse(raw) as GameState;
    Object.assign(u.units[0], { team });
    assert.throws(() => m.deserialize(JSON.stringify(u)), /entity/);
    const b = JSON.parse(raw) as GameState;
    Object.assign(b.buildings[0], { team });
    assert.throws(() => m.deserialize(JSON.stringify(b)), /entity/);
  }
});

void test('deterministic command replays match canonical snapshots and repeat identically across every mode', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  interface ReplayFixture {
    options: GameOptions;
    commands: { tick: number; action: unknown }[];
    expected: { tick: number; hash: string }[];
  }
  const fixtures = JSON.parse(
    await readFile(new URL('./fixtures/simulation-replay.json', import.meta.url), 'utf8'),
  ) as ReplayFixture[];
  for (const fixture of fixtures) {
    const runs: string[][] = [];
    for (let run = 0; run < 2; run++) {
      const hashes: string[] = [];
      let s = m.createGame(fixture.options);
      for (let tick = 0; tick <= 4200; tick++) {
        if (tick) {
          for (const entry of fixture.commands)
            if (entry.tick === tick) m.applyAction(s, entry.action);
          m.update(s, 0.05);
          if (tick === 160) s = m.deserialize(m.serialize(s));
        }
        const expected = fixture.expected.find((e) => e.tick === tick);
        if (expected) {
          for (const u of s.units)
            if (u.hp > 0 && !u.garrisonId)
              assert.ok(
                positionClear(s, u, unitRadius(u), u.id),
                `Replay troop ${u.id} has clear ground at tick ${tick}`,
              );
          const snapshot = JSON.parse(m.serialize(s)) as Record<string, unknown>;
          delete snapshot.events;
          // The replay fixture measures simulation behavior, independent of save envelope migration.
          delete snapshot.map;
          snapshot.version = 2;
          const hash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
          hashes.push(hash);
          assert.equal(hash, expected.hash, `${JSON.stringify(fixture.options)} at tick ${tick}`);
        }
      }
      runs.push(hashes);
    }
    assert.deepEqual(runs[0], runs[1], `Repeated ${JSON.stringify(fixture.options)} replay`);
  }
});

void test('border attack orders retain legal continuous goals and rejected movement preserves garrisons', () => {
  const s = sandbox();
  s.units = [];
  const archer = unit(s, 'archer', 'player', 60.5, 10.5),
    target = unit(s, 'slave', 'enemy', 62.8, 10.5);
  assert.ok(m.command(s, [archer.id], 62, 10, 'player', { targetId: target.id }).ok);
  assert.deepEqual(archer.goal, { x: 62.8, y: 10.5 });
  assert.doesNotThrow(() => m.deserialize(m.serialize(s)));
  const tower = building(s, 'tower', 'player', 10, 10);
  archer.x = 9.5;
  archer.y = 10.5;
  assert.ok(m.applyAction(s, { type: 'garrison', buildingId: tower.id, ids: [archer.id] }).ok);
  for (let y = 33; y <= 57; y++) for (let x = 33; x <= 57; x++) building(s, 'wall', 'player', x, y);
  assert.ok(m.command(s, [archer.id], 45, 45).ok);
  assert.equal(archer.garrisonId, tower.id);
});
void test('save hydration restores bounded event history and rejects non-integer tutorial counters', () => {
  const s = sandbox();
  s.time = 10;
  s.events = [
    { time: 1, text: 'A caravan arrived.' },
    { time: 3, text: 'The lord lowered taxes.' },
  ];
  const raw = JSON.parse(m.serialize(s)) as GameState;
  Object.assign(raw.tutorial, { built: Infinity, recruited: 0.5 });
  raw.events.push({ time: 500, text: 'future event' });
  const loaded = m.deserialize(JSON.stringify(raw));
  assert.deepEqual(loaded.events, s.events);
  assert.deepEqual(loaded.tutorial, { built: 0, recruited: 0, firstRepelled: false });
});

void test('survival public raid API stops at the final wave and victory waits for the battlefield to clear', () => {
  const s = m.createGame({ mode: 'survival' });
  for (let i = 0; i < 4; i++) assert.ok(m.launchWave(s).ok);
  assert.equal(s.wave, 4);
  assert.equal(m.launchWave(s).ok, false);
  advance(s, 0.05);
  assert.equal(s.status, 'playing');
  for (const u of s.units) if (u.team === 'enemy') u.hp = 0;
  advance(s, 0.05);
  assert.equal(s.status, 'victory');
  assert.doesNotThrow(() => m.deserialize(m.serialize(s)));
});
