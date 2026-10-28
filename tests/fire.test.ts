import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/game/index.js';
import { addBuilding, addUnit } from '../src/game/entities.js';
import { igniteBuilding, updateFires, wellTargets, FIRE_DURATION } from '../src/game/fire.js';
import { shoot } from '../src/game/combat.js';
function setup() {
  const s = m.createGame({ mode: 'sandbox' });
  s.buildings = [];
  s.units = [];
  s.rations = 0;
  return s;
}
void test('fire attacks ignite vulnerable buildings without refreshing and stone resists', () => {
  const s = setup();
  const house = addBuilding(s, 'house', 10, 10, 'enemy');
  const slave = addUnit(s, 'slave', 'player', 9, 11);
  shoot(s, slave, house, m.TROOPS.slave);
  assert.equal(house.fire?.remaining, FIRE_DURATION);
  updateFires(s, 0.25);
  const remaining = house.fire?.remaining;
  shoot(s, slave, house, m.TROOPS.slave);
  assert.equal(house.fire?.remaining, remaining);
  for (const type of ['keep', 'wall', 'tower', 'gate', 'stairs', 'moat', 'well'] as const)
    assert.equal(igniteBuilding(s, addBuilding(s, type, 30, 30, 'enemy')), false);
  const events = s.events.length;
  updateFires(s, 0.25);
  assert.equal(s.events.length, events);
});
void test('spread crosses teams, respects a full tile firebreak, and never chains within a step', () => {
  const s = setup();
  const first = addBuilding(s, 'house', 10, 10, 'player');
  const next = addBuilding(s, 'house', 12, 10, 'enemy');
  const third = addBuilding(s, 'house', 14, 10, 'player');
  const separated = addBuilding(s, 'house', 10, 13, 'player');
  igniteBuilding(s, first);
  first.fire!.spread = 0.1;
  updateFires(s, 0.25);
  assert.equal(next.fire?.remaining, FIRE_DURATION);
  assert.equal(third.fire, undefined);
  assert.equal(separated.fire, undefined);
  const hp = next.hp;
  updateFires(s, 0.25);
  assert.equal(next.hp, hp - 1.5);
});
void test('finite fire stops production, releases labor, and naturally extinguishes', () => {
  const s = setup();
  const mill = addBuilding(s, 'mill', 10, 10, 'player');
  const bakery = addBuilding(s, 'bakery', 20, 10, 'player');
  s.civilians = 2;
  s.resources.flour = 10;
  igniteBuilding(s, mill);
  m.production(s, 0.25, true);
  assert.equal(mill.active, 0);
  assert.equal(bakery.active, 1);
  assert.equal(m.workforce(s), 2);
  for (let i = 0; i < 96; i++) updateFires(s, 0.25);
  assert.equal(mill.fire, undefined);
  assert.equal(mill.hp, m.TYPES.mill.hp - 144);
});
void test('well staffing suppresses one nearest allied fire and paused wells release labor', () => {
  const s = setup();
  const well = addBuilding(s, 'well', 10, 10, 'player');
  const near = addBuilding(s, 'house', 12, 10, 'player');
  const far = addBuilding(s, 'house', 16, 10, 'player');
  const enemy = addBuilding(s, 'house', 10, 12, 'enemy');
  for (const b of [near, far, enemy]) igniteBuilding(s, b);
  s.civilians = 1;
  m.production(s, 0.25, true);
  assert.equal(well.active, 0.5);
  assert.equal(wellTargets(s).get(well.id), near);
  updateFires(s, 0.25);
  assert.equal(near.fire?.remaining, 23.25);
  assert.equal(far.fire?.remaining, 23.75);
  assert.equal(enemy.fire?.remaining, 23.75);
  assert.equal(near.hp, m.TYPES.house.hp - 1.5);
  well.paused = true;
  m.production(s, 0.25, true);
  assert.equal(wellTargets(s).size, 0);
  s.mode = 'multiplayer';
  s.multiplayerMode = 'coop';
  near.team = 'player2';
  well.paused = false;
  well.active = 1;
  assert.equal(wellTargets(s).get(well.id), near);
  s.multiplayerMode = 'versus';
  assert.equal(wellTargets(s).get(well.id), far);
});
void test('fire timers persist exactly and malformed present save fields reject', () => {
  const s = setup();
  const b = addBuilding(s, 'house', 10, 10, 'player');
  igniteBuilding(s, b);
  updateFires(s, 0.25);
  s.status = 'victory';
  const saved = m.serialize(s);
  assert.deepEqual(m.deserialize(saved).buildings[0]?.fire, b.fire);
  const data = JSON.parse(saved) as { buildings: Record<string, unknown>[] };
  for (const fire of [
    null,
    {},
    { remaining: -1, spread: 1 },
    { remaining: 25, spread: 1 },
    { remaining: 2, spread: 0 },
    { remaining: '2', spread: 1 },
  ]) {
    data.buildings[0]!.fire = fire;
    assert.throws(() => m.deserialize(JSON.stringify(data)), /fire/);
  }
  delete data.buildings[0]!.fire;
  assert.equal(m.deserialize(JSON.stringify(data)).buildings[0]?.fire, undefined);
});
void test('firethrower splash ignites buildings and burning death uses normal destruction bookkeeping', () => {
  const s = setup();
  const target = addBuilding(s, 'house', 10, 10, 'enemy');
  const adjacent = addBuilding(s, 'house', 12, 10, 'enemy');
  const thrower = addUnit(s, 'firethrower', 'player', 8, 11);
  shoot(s, thrower, target, m.TROOPS.firethrower);
  assert.ok(target.fire);
  assert.ok(adjacent.fire);
  target.hp = 1;
  const revision = s.mapRevision;
  const kills = s.kills;
  updateFires(s, 0.25);
  assert.equal(target.hp, 0);
  assert.equal(target.fire, undefined);
  assert.ok(s.mapRevision > revision);
  assert.equal(s.kills, kills + 1);
  assert.equal(s.tutorial.firstRepelled, true);
});
void test('save and reload continuation preserves fire damage, spread and extinguishing', () => {
  const s = setup();
  s.status = 'victory';
  const first = addBuilding(s, 'house', 10, 10, 'player');
  addBuilding(s, 'house', 12, 10, 'enemy');
  igniteBuilding(s, first);
  for (let i = 0; i < 23; i++) updateFires(s, 0.25);
  const loaded = m.deserialize(m.serialize(s));
  for (let i = 0; i < 80; i++) {
    updateFires(s, 0.25);
    updateFires(loaded, 0.25);
  }
  const view = (state: m.GameState) =>
    state.buildings.map((b) => ({ id: b.id, hp: b.hp, fire: b.fire }));
  assert.deepEqual(view(loaded), view(s));
});
void test('repeated snapshots preserve pulse timers without extending fire episodes', () => {
  let loaded = setup();
  loaded.status = 'victory';
  igniteBuilding(loaded, addBuilding(loaded, 'house', 10, 10, 'player'));
  addBuilding(loaded, 'house', 12, 10, 'enemy');
  const uninterrupted = m.deserialize(m.serialize(loaded));
  for (let i = 0; i < 100; i++) {
    updateFires(uninterrupted, 0.25);
    updateFires(loaded, 0.25);
    loaded = m.deserialize(m.serialize(loaded), { rebuildPaths: false });
    assert.deepEqual(
      loaded.buildings.map((b) => [b.hp, b.fire]),
      uninterrupted.buildings.map((b) => [b.hp, b.fire]),
    );
  }
});
void test('pitch traps ignite nearby vulnerable structures on either side', () => {
  const s = setup();
  addBuilding(s, 'keep', 40, 40, 'player');
  const trap = addBuilding(s, 'pitchtrap', 10, 10, 'player');
  const friendly = addBuilding(s, 'house', 11, 10, 'player');
  const hostile = addBuilding(s, 'house', 8, 10, 'enemy');
  const raider = addUnit(s, 'spearman', 'enemy', 10.5, 9.5);
  raider.x = 10.5;
  raider.y = 9.5;
  m.update(s, 0.05);
  assert.equal(trap.hp, 0);
  assert.ok(friendly.fire);
  assert.ok(hostile.fire);
});
void test('a pitch trap victim cannot trigger the next trap after dying', () => {
  const s = setup();
  addBuilding(s, 'keep', 40, 40, 'player');
  const first = addBuilding(s, 'pitchtrap', 10, 10, 'player');
  const second = addBuilding(s, 'pitchtrap', 11, 10, 'player');
  const victim = addUnit(s, 'slave', 'enemy', 11, 9.5);
  victim.x = 11;
  victim.y = 9.5;
  m.update(s, 0.05);
  assert.equal(victim.hp, 0);
  assert.equal(first.hp, 0);
  assert.equal(second.hp, m.TYPES.pitchtrap.hp);
  assert.equal(
    s.effects.some((e) => e.type === 'arrow'),
    false,
  );
});
void test('garrisoned troops neither activate nor take damage from pitch traps', () => {
  const s = setup();
  addBuilding(s, 'keep', 40, 40, 'player');
  const tower = addBuilding(s, 'tower', 10, 10, 'enemy');
  const trap = addBuilding(s, 'pitchtrap', 10, 10, 'player');
  const archer = addUnit(s, 'archer', 'enemy', 9, 9);
  archer.garrisonId = tower.id;
  archer.x = 10.5;
  archer.y = 10.5;
  m.update(s, 0.05);
  assert.equal(trap.hp, m.TYPES.pitchtrap.hp);
  const ground = addUnit(s, 'slave', 'enemy', 10.5, 9.5);
  ground.x = 10.5;
  ground.y = 9.5;
  const hp = archer.hp;
  m.update(s, 0.05);
  assert.equal(trap.hp, 0);
  assert.equal(archer.hp, hp);
});
