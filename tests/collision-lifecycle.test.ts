import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  SMALL_MAP,
  applyAction,
  canPlace,
  command,
  deserialize,
  serialize,
  update,
  passable,
  parseMap,
} from '../src/game/index.js';
import { addBuilding, addUnit, findOpen } from '../src/game/entities.js';
import { positionClear, unitRadius } from '../src/game/spatial.js';

function emptyBattle() {
  const s = createGame({ mode: 'sandbox' });
  s.buildings = [];
  s.units = [];
  return s;
}

void test('spawning respects continuous troop footprints across cell boundaries', () => {
  const s = emptyBattle();
  const first = addUnit(s, 'spearman', 'player', 10.99, 10.5);
  const p = findOpen(s, 11, 10, 'player', undefined, undefined, 9, 'catapult');
  assert.ok(p);
  assert.ok(positionClear(s, { x: p.x + 0.5, y: p.y + 0.5 }, unitRadius('catapult')));
  const second = addUnit(s, 'spearman', 'player', first.x, first.y);
  assert.ok(
    Math.hypot(first.x - second.x, first.y - second.y) >=
      unitRadius(first) + unitRadius(second) - 1e-7,
  );
});

void test('construction and gate closure reject intersecting soldier edges', () => {
  const s = emptyBattle();
  addBuilding(s, 'keep', 14, 14, 'player');
  const u = addUnit(s, 'spearman', 'player', 9.9, 10.5);
  assert.equal(canPlace(s, 'wall', 10, 10).reason, 'A soldier is standing here.');
  const gate = addBuilding(s, 'gate', 10, 10, 'player');
  assert.equal(applyAction(s, { type: 'gate', id: gate.id, open: false }).ok, false);
  assert.equal(gate.open, true);
  u.x = 8;
  assert.equal(applyAction(s, { type: 'gate', id: gate.id, open: false }).ok, true);
});

void test('commanded tower occupants emerge on free ground before moving', () => {
  const s = emptyBattle();
  const tower = addBuilding(s, 'tower', 10, 10, 'player');
  const u = addUnit(s, 'archer', 'player', 9, 10);
  u.garrisonId = tower.id;
  u.x = 11;
  u.y = 11;
  assert.equal(command(s, [u.id], 18, 10).ok, true);
  assert.equal(u.garrisonId, null);
  assert.ok(positionClear(s, u, unitRadius(u), u.id));
});

void test('legacy overlapping saved soldiers are separated on load', () => {
  const s = createGame({ mode: 'sandbox' });
  s.units[1]!.x = s.units[0]!.x;
  s.units[1]!.y = s.units[0]!.y;
  const loaded = deserialize(serialize(s));
  for (const u of loaded.units) assert.ok(positionClear(loaded, u, unitRadius(u), u.id));
});

void test('network hydration preserves authoritative troop coordinates', () => {
  const s = createGame({ mode: 'sandbox' });
  s.units[1]!.x = s.units[0]!.x;
  s.units[1]!.y = s.units[0]!.y;
  const loaded = deserialize(serialize(s), { rebuildPaths: false });
  assert.deepEqual(
    loaded.units.map(({ x, y }) => ({ x, y })),
    s.units.map(({ x, y }) => ({ x, y })),
  );
});

void test('ordering a soldier to its current cell preserves its destination', () => {
  const s = emptyBattle();
  const u = addUnit(s, 'spearman', 'player', 10.5, 10.5);
  command(s, [u.id], u.x, u.y);
  assert.deepEqual(u.goal, { x: 10.5, y: 10.5 });
});

void test('public commands move thirty mixed troops through crossing traffic without overlaps', () => {
  const s = createGame({ mode: 'sandbox' });
  s.units = [];
  const types = ['spearman', 'knight', 'catapult'] as const;
  const troops = Array.from({ length: 30 }, (_, i) =>
    addUnit(s, types[i % 3]!, 'player', i < 15 ? 10.5 : 21.5, 7.5 + (i % 15)),
  );
  const destinations = new Map<number, { x: number; y: number }>();
  for (const u of troops) {
    command(s, [u.id], u.x < 15 ? 22.5 : 9.5, u.y);
    assert.ok(u.goal);
    destinations.set(u.id, { ...u.goal });
  }
  for (let tick = 0; tick < 900; tick++) {
    update(s, 0.05);
    for (const u of troops)
      assert.ok(positionClear(s, u, unitRadius(u), u.id), `tick ${tick}, unit ${u.id}`);
  }
  const arrived = troops.filter(
    (u) => Math.hypot(u.x - destinations.get(u.id)!.x, u.y - destinations.get(u.id)!.y) < 0.5,
  );
  assert.ok(arrived.length >= 27, `${arrived.length}/30 arrived`);
});

void test('public commands avoid idle bodies and solid resource terrain', () => {
  const s = createGame({ mode: 'sandbox' });
  s.units = [];
  const idle = addUnit(s, 'catapult', 'player', 47.5, 21.5);
  idle.stance = 'hold';
  const types = ['spearman', 'knight', 'catapult'] as const;
  const troops = Array.from({ length: 30 }, (_, i) =>
    addUnit(s, types[i % 3]!, 'player', 45.5 + (i % 5), 12.5 + Math.floor(i / 5)),
  );
  command(
    s,
    troops.map((u) => u.id),
    53.5,
    21.5,
  );
  const goals = troops.map((u) => ({ ...u.goal! }));
  for (let tick = 0; tick < 900; tick++) {
    update(s, 0.05);
    for (const u of [...troops, idle])
      assert.ok(positionClear(s, u, unitRadius(u), u.id), `tick ${tick}, unit ${u.id}`);
  }
  const arrived = troops.filter((u, i) => Math.hypot(u.x - goals[i]!.x, u.y - goals[i]!.y) < 0.5);
  assert.ok(arrived.length >= 27, `${arrived.length}/30 arrived`);
});

void test('open gates and traps clear resource decor beneath their footprints', () => {
  const s = emptyBattle();
  const rows = Array.from({ length: 128 }, () => 's'.repeat(128));
  rows[37] = rows[37].slice(0, 22) + 't' + rows[37].slice(23);
  rows[21] = rows[21].slice(0, 53) + 'i' + rows[21].slice(54);
  s.map = parseMap({ ...SMALL_MAP, terrain: rows });
  assert.equal(passable(s, 22, 37), false);
  const gate = addBuilding(s, 'gate', 22, 37, 'player');
  assert.equal(passable(s, 22, 37), true);
  applyAction(s, { type: 'gate', id: gate.id, open: false });
  assert.equal(passable(s, 22, 37), false);
  addBuilding(s, 'pitchtrap', 53, 21, 'player');
  assert.equal(passable(s, 53, 21), true);
});
