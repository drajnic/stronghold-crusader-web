import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game/factory.js';
import { addBuilding, addUnit } from '../src/game/entities.js';
import { clearShot } from '../src/game/line-of-fire.js';
import { updateAI } from '../src/game/ai.js';
import { shoot } from '../src/game/combat.js';
import { TROOPS, TYPES } from '../src/game/catalog.js';
import { fearFactor } from '../src/game/economy.js';

function field() {
  const s = createGame({ mode: 'sandbox' });
  s.units = [];
  s.buildings = [];
  return s;
}
void test('ground fire tests full diagonal fortification footprints and open/destroyed gates', () => {
  const s = field();
  const archer = addUnit(s, 'archer', 'player', 10, 10);
  const foe = addUnit(s, 'spearman', 'enemy', 16, 16);
  const gate = addBuilding(s, 'gate', 12, 12, 'player');
  gate.open = false;
  assert.equal(clearShot(s, archer, foe), false);
  gate.open = true;
  assert.equal(clearShot(s, archer, foe), true);
  gate.open = false;
  gate.hp = 0;
  assert.equal(clearShot(s, archer, foe), true);
  const wall = addBuilding(s, 'wall', 12, 12, 'enemy');
  assert.equal(clearShot(s, archer, wall), true);
  assert.equal(clearShot(s, archer, foe), false);
  archer.type = 'catapult';
  assert.equal(clearShot(s, archer, foe), true);
  archer.type = 'trebuchet';
  assert.equal(clearShot(s, archer, foe), true);
});
void test('elevated shots ignore low walls but other towers still block', () => {
  const s = field();
  const tower = addBuilding(s, 'tower', 8, 8, 'player');
  const archer = addUnit(s, 'archer', 'player', 9, 9);
  archer.garrisonId = tower.id;
  const foe = addUnit(s, 'spearman', 'enemy', 18, 9);
  addBuilding(s, 'wall', 12, 9, 'player');
  assert.equal(clearShot(s, archer, foe), true);
  const blocker = addBuilding(s, 'tower', 14, 8, 'enemy');
  assert.equal(clearShot(s, archer, foe), false);
  assert.equal(clearShot(s, archer, blocker), true);
});
void test('troop damage uses morale and blocked direct shooting cannot bypass walls', () => {
  const s = field();
  const archer = addUnit(s, 'archer', 'player', 10, 10);
  const foe = addUnit(s, 'slave', 'enemy', 15, 10);
  const before = foe.hp;
  shoot(s, archer, foe, TROOPS.archer);
  assert.equal(
    foe.hp,
    before -
      TROOPS.archer.damage * fearFactor(s, 'player').morale * (1 - (TROOPS.slave.armor || 0)),
  );
  addBuilding(s, 'wall', 12, 10, 'enemy');
  const hp = foe.hp;
  shoot(s, archer, foe, TROOPS.archer);
  assert.equal(foe.hp, hp);
});
void test('AI repairs through paid actions and advances impossible building orders deterministically', () => {
  const a = createGame({ mode: 'skirmish' });
  const b = structuredClone(a);
  for (const s of [a, b]) {
    const f = s.factions.enemy!;
    f.aiTimer = 0;
    f.attackTimer = 999;
    const keep = s.buildings.find((x) => x.team === 'enemy' && x.type === 'keep')!;
    keep.hp = TYPES.keep.hp / 2;
    f.civilians = 0; // Isolate paid construction and repair from recruitment costs.
    const wood = f.resources.wood,
      stone = f.resources.stone;
    updateAI(s, 0.25);
    assert.equal(keep.hp, TYPES.keep.hp);
    assert.ok(
      s.buildings.some((building) => building.team === 'enemy' && building.type === 'well'),
    );
    assert.equal(f.resources.wood, wood - TYPES.well.cost.wood! - 4);
    assert.equal(f.resources.stone, stone - TYPES.well.cost.stone! - 6);
    assert.equal(f.aiStep, 0, 'paid essential construction preserves the ordinary queue');
    f.aiTimer = 0;
    updateAI(s, 0.25);
    assert.ok(f.aiStep > 0);
  }
  assert.deepEqual(a, b);
});
void test('AI rotates recruitment instead of always choosing its first affordable troop', () => {
  const s = createGame({ mode: 'skirmish', scenario: 0 });
  const f = s.factions.enemy!;
  f.civilians = 100;
  f.attackTimer = 999;
  for (const key of Object.keys(f.resources) as (keyof typeof f.resources)[])
    f.resources[key] = 1000;
  addBuilding(s, 'mercenary', 55, 30, 'enemy');
  s.units = s.units.filter((u) => u.team !== 'enemy');
  for (let i = 1; i <= 5; i++) {
    s.time = i * 6;
    f.aiTimer = 0;
    updateAI(s, 0.25);
  }
  const types = new Set(s.units.filter((u) => u.team === 'enemy').map((u) => u.type));
  assert.ok(types.size >= 3);
});
void test('Coop AI chooses the nearest hostile keep including the second player', () => {
  const s = createGame({ mode: 'multiplayer', multiplayerMode: 'coop' });
  // Coop uses the balanced profile and must choose the nearest hostile keep.
  const home = s.buildings.find((b) => b.team === 'enemy' && b.type === 'keep')!;
  const targets = s.buildings.filter((b) => b.type === 'keep' && b.team !== 'enemy');
  targets[0].x = 2;
  targets[0].y = 2;
  targets[1].x = home.x - 10;
  targets[1].y = home.y;
  s.factions.enemy!.attackTimer = 0;
  s.factions.enemy!.aiTimer = 99;
  updateAI(s, 0.25);
  assert.ok(s.units.some((u) => u.team === 'enemy' && u.targetId === targets[1].id));
});

void test('tower occupants retain protection from armor but can be targeted through their own tower', () => {
  const s = field();
  const archer = addUnit(s, 'archer', 'player', 10, 10);
  const tower = addBuilding(s, 'tower', 14, 9, 'enemy');
  const occupant = addUnit(s, 'archer', 'enemy', 15, 10);
  occupant.garrisonId = tower.id;
  addBuilding(s, 'wall', 12, 10, 'enemy');
  assert.equal(clearShot(s, archer, occupant), true);
  addBuilding(s, 'tower', 12, 9, 'player');
  assert.equal(clearShot(s, archer, occupant), false);
});

void test('AI skips unavailable farm and mine terrain on a resource-free custom map', () => {
  const original = createGame({ mode: 'skirmish' });
  const s = createGame({
    mode: 'skirmish',
    map: {
      ...original.map,
      name: 'AI dry valley',
      terrain: Array.from({ length: 64 }, () => 's'.repeat(64)),
    },
  });
  const f = s.factions.enemy!;
  f.attackTimer = 999;
  for (let i = 0; i < 5; i++) {
    f.aiTimer = 0;
    s.time = i * 6;
    updateAI(s, 0.25);
  }
  assert.equal(f.aiStep, 4);
  assert.ok(s.buildings.some((b) => b.team === 'enemy' && b.type === 'fletcher'));
  assert.ok(Object.values(f.resources).every((n) => n >= 0));
});

void test('gardens and gallows change troop damage above and below neutral without changing hit points', () => {
  for (const type of ['garden', 'gallows'] as const) {
    const s = field();
    addBuilding(s, type, 25, 25, 'player');
    const archer = addUnit(s, 'archer', 'player', 10, 10);
    const foe = addUnit(s, 'slave', 'enemy', 14, 10);
    const before = foe.hp;
    const ownHP = archer.hp;
    shoot(s, archer, foe, TROOPS.archer);
    const neutral = TROOPS.archer.damage * (1 - (TROOPS.slave.armor || 0));
    assert.ok(type === 'garden' ? before - foe.hp > neutral : before - foe.hp < neutral);
    assert.equal(archer.hp, ownHP);
  }
});

void test('simulation cannot fire through a closed gate and resumes firing when it opens', async () => {
  const { update } = await import('../src/game/simulation.js');
  const s = createGame({ mode: 'sandbox' });
  s.units = [];
  const archer = addUnit(s, 'archer', 'player', 28, 28);
  const foe = addUnit(s, 'slave', 'enemy', 33, 28);
  foe.stance = 'hold';
  archer.stance = 'hold';
  const gate = addBuilding(s, 'gate', 30, 27, 'player');
  gate.open = false;
  const hp = foe.hp;
  update(s, 0.05);
  assert.equal(foe.hp, hp);
  gate.open = true;
  update(s, 0.05);
  assert.ok(foe.hp < hp);
});

void test('Warden garrisons existing archers even when recruitment is unavailable', () => {
  const s = createGame({ mode: 'skirmish', scenario: 2 });
  const f = s.factions.enemy!;
  f.civilians = 0;
  f.resources.food = 0;
  f.aiTimer = 0;
  f.attackTimer = 999;
  const tower = s.buildings.find((b) => b.team === 'enemy' && b.type === 'tower')!;
  const archer = s.units.find((u) => u.team === 'enemy' && u.type === 'archer')!;
  archer.x = tower.x + 3;
  archer.y = tower.y + 3;
  updateAI(s, 0.25);
  assert.equal(archer.garrisonId, tower.id);
});

void test('Warden requires six expedition troops and at least two siege escorts', () => {
  for (const [count, escorts, dispatch] of [
    [9, 9, false],
    [10, 1, false],
    [10, 2, true],
  ] as const) {
    const s = createGame({ mode: 'skirmish', scenario: 2 });
    s.units = [];
    const f = s.factions.enemy!;
    f.aiTimer = 999;
    f.attackTimer = 0;
    for (let i = 0; i < count; i++)
      addUnit(
        s,
        i < 4 || i >= count - escorts ? 'spearman' : 'catapult',
        'enemy',
        i < 4 ? 44 + i * 0.2 : 40 + i * 0.5,
        i < 4 ? 17 : 35,
      );
    updateAI(s, 0.25);
    assert.equal(
      s.units.some((u) => u.targetId !== null),
      dispatch,
    );
    if (!dispatch) assert.equal(f.attackTimer, 10);
  }
});

void test('Wolf prefers exposed resource sites over closer protected sites', () => {
  const s = createGame({ mode: 'skirmish', scenario: 1 });
  s.units = [];
  const f = s.factions.enemy!;
  f.aiTimer = 999;
  f.attackTimer = 0;
  const protectedSite = addBuilding(s, 'lumber', 34, 20, 'player');
  addBuilding(s, 'tower', 33, 18, 'player');
  const exposedSite = addBuilding(s, 'quarry', 25, 20, 'player');
  for (let i = 0; i < 8; i++) addUnit(s, 'slave', 'enemy', 42 + i * 0.5, 30);
  updateAI(s, 0.25);
  assert.ok(s.units.some((u) => u.targetId === exposedSite.id));
  assert.ok(s.units.every((u) => u.targetId !== protectedSite.id));
});

void test('a ranged expedition breaches walls while preserving explicit keep orders and clear ground for sixty seconds', async () => {
  const { update } = await import('../src/game/simulation.js');
  const { positionClear, unitRadius } = await import('../src/game/spatial.js');
  const s = createGame({ mode: 'sandbox' });
  s.units = [];
  s.buildings = s.buildings.filter((b) => b.type === 'keep');
  const keep = addBuilding(s, 'keep', 31, 27, 'enemy');
  const walls = [];
  for (let y = 26; y <= 31; y++)
    for (let x = 30; x <= 35; x++)
      if (x === 30 || x === 35 || y === 26 || y === 31)
        walls.push(addBuilding(s, 'wall', x, y, 'enemy'));
  const initial = walls.reduce((sum, b) => sum + b.hp, 0);
  for (let i = 0; i < 3; i++) {
    const u = addUnit(s, 'archer', 'player', 26, 27 + i);
    u.targetId = keep.id;
    u.goal = { x: 32, y: 28 };
  }
  for (let tick = 0; tick < 1200; tick++) {
    update(s, 0.05);
    for (const u of s.units)
      if (u.hp > 0 && !u.garrisonId) assert.ok(positionClear(s, u, unitRadius(u), u.id));
  }
  assert.ok(walls.reduce((sum, b) => sum + b.hp, 0) < initial);
  assert.ok(s.units.every((u) => u.targetId === keep.id));
});

void test('essential recovery keeps the ordinary build step queued', () => {
  const s = createGame({ mode: 'skirmish' });
  const f = s.factions.enemy!;
  s.buildings = s.buildings.filter((b) => b.team !== 'enemy' || b.type !== 'market');
  f.aiTimer = 0;
  f.attackTimer = 999;
  f.aiStep = 0;
  updateAI(s, 0.25);
  assert.ok(s.buildings.some((b) => b.team === 'enemy' && b.type === 'market'));
  assert.equal(f.aiStep, 0);
});
