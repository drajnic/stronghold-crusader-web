import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/game/index.js';
import { addBuilding } from '../src/game/entities.js';
import { parseAction } from '../src/game/action-schema.js';
import { staticPositionClear, unitRadius } from '../src/game/spatial.js';
function setup() {
  const s = m.createGame({ mode: 'sandbox' });
  s.buildings = s.buildings.filter((b) => b.type === 'keep');
  s.units = [];
  s.factions.player.civilians = 100;
  for (const key of m.RESOURCE_KEYS) s.resources[key] = 1000;
  const first = addBuilding(s, 'barracks', 10, 10, 'player');
  const second = addBuilding(s, 'barracks', 25, 10, 'player');
  return { s, first, second };
}
void test('rally validates ownership, facility, coordinates and clear, and survives save', () => {
  const { s, first } = setup();
  const point = { x: 18.5, y: 18.5 };
  assert.equal(m.applyAction(s, { type: 'rally', id: first.id, point }).ok, true);
  point.x = 99;
  assert.equal(first.rallyPoint?.x, 18.5);
  assert.deepEqual(
    m.deserialize(m.serialize(s)).buildings.find((b) => b.id === first.id)?.rallyPoint,
    first.rallyPoint,
  );
  for (const bad of [
    undefined,
    {},
    { x: NaN, y: 2 },
    { x: Infinity, y: 2 },
    { x: 0, y: 2 },
    { x: 2, y: m.SIZE - 1 },
  ])
    assert.equal(parseAction({ type: 'rally', id: first.id, point: bad }), null);
  assert.equal(parseAction({ type: 'rally', id: 1.5, point: null }), null);
  const house = addBuilding(s, 'house', 40, 10, 'player');
  assert.equal(m.applyAction(s, { type: 'rally', id: house.id, point: null }).ok, false);
  assert.equal(m.applyAction(s, { type: 'rally', id: first.id, point: null }, 'enemy').ok, false);
  first.hp = 0;
  assert.equal(m.applyAction(s, { type: 'rally', id: first.id, point: null }).ok, false);
  first.hp = 10;
  assert.equal(m.applyAction(s, { type: 'rally', id: first.id, point: null }).ok, true);
  assert.equal(first.rallyPoint, undefined);
});
void test('explicit facility recruits follow its rally by walking and default stays deterministic', () => {
  const { s, first, second } = setup();
  first.rallyPoint = { x: 17, y: 17 };
  second.rallyPoint = { x: 32, y: 17 };
  const result = m.applyAction(s, { type: 'recruit', unit: 'spearman', facilityId: second.id });
  assert.ok(result.unit);
  const u = result.unit;
  assert.ok(u.x >= second.x - 1);
  assert.ok(u.goal && u.goal.x >= 30);
  assert.ok(u.path.length > 0);
  assert.ok(Math.hypot(u.x - u.goal.x, u.y - u.goal.y) > 1, 'spawn is not teleported');
  assert.ok(staticPositionClear(s, u, unitRadius(u)));
  const original = { x: u.x, y: u.y };
  m.update(s, 0.2);
  assert.ok(Math.hypot(u.x - original.x, u.y - original.y) > 0);
  const defaultRecruit = m.applyAction(s, { type: 'recruit', unit: 'spearman' });
  assert.ok(defaultRecruit.unit?.goal && defaultRecruit.unit.goal.x < 20);
  const before = s.units.length;
  for (const facilityId of [
    999999,
    second.id + 0.5,
    addBuilding(s, 'house', 40, 20, 'player').id,
    addBuilding(s, 'barracks', 45, 10, 'enemy').id,
  ])
    assert.equal(m.applyAction(s, { type: 'recruit', unit: 'spearman', facilityId }).ok, false);
  assert.equal(s.units.length, before);
  second.fire = { remaining: 10, spread: 1 };
  assert.equal(
    m.applyAction(s, { type: 'recruit', unit: 'spearman', facilityId: second.id }).ok,
    false,
  );
  second.hp = 10;
  assert.equal(m.applyAction(s, { type: 'repair', id: second.id }).ok, false);
});
void test('blocked rally uses deterministic reachable fallback without occupying a wall', () => {
  function run() {
    const { s, first } = setup();
    addBuilding(s, 'wall', 18, 18, 'player');
    first.rallyPoint = { x: 18.5, y: 18.5 };
    const { unit } = m.applyAction(s, { type: 'recruit', unit: 'spearman' });
    assert.ok(unit?.goal);
    assert.ok(staticPositionClear(s, unit.goal, unitRadius(unit)));
    return unit.goal;
  }
  assert.deepEqual(run(), run());
});
void test('unreachable rally leaves recruits safely spawned without charging twice or teleporting', () => {
  const { s, first } = setup();
  for (let y = 1; y < m.SIZE - 1; y++) addBuilding(s, 'wall', 40, y, 'player');
  first.rallyPoint = { x: 60, y: 15 };
  const result = m.applyAction(s, { type: 'recruit', unit: 'spearman', facilityId: first.id });
  assert.equal(result.ok, true);
  assert.ok(result.unit);
  assert.equal(result.unit.goal, null);
  assert.deepEqual(result.unit.path, []);
  assert.ok(result.unit.x < 40);
  assert.ok(staticPositionClear(s, result.unit, unitRadius(result.unit)));
});

void test('recruitment reports burning facilities and rejects invalid facilities without spending', () => {
  const { s, first, second } = setup();
  first.fire = { remaining: 10, spread: 1 };
  second.fire = { remaining: 10, spread: 1 };
  const resources = { ...s.resources },
    civilians = s.factions.player.civilians;
  for (const facilityId of [first.id, undefined]) {
    const result = m.applyAction(s, { type: 'recruit', unit: 'spearman', facilityId });
    assert.deepEqual(result, { ok: false, reason: 'Extinguish this recruitment building first.' });
  }
  const wrong = addBuilding(s, 'house', 40, 20, 'player');
  const foreign = addBuilding(s, 'barracks', 45, 10, 'enemy');
  second.hp = 0;
  for (const facilityId of [second.id, wrong.id, foreign.id, 999999]) {
    const result = m.applyAction(s, { type: 'recruit', unit: 'spearman', facilityId });
    assert.deepEqual(result, { ok: false, reason: 'Choose an available recruitment building.' });
  }
  assert.deepEqual(s.resources, resources);
  assert.equal(s.factions.player.civilians, civilians);
  assert.equal(s.units.length, 0);
});
