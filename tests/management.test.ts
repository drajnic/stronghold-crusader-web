import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/game/index.js';
import { parseAction } from '../src/game/action-schema.js';
function add(s: m.GameState, type: m.BuildingType, team: m.Team = 'player') {
  const b: m.Building = { id: s.nextId++, type, team, x: 1, y: 1, hp: m.TYPES[type].hp, shot: 0 };
  s.buildings.push(b);
  return b;
}
function economy() {
  const s = m.createGame({ mode: 'sandbox' });
  s.buildings = [];
  s.factions.player.civilians = 2;
  s.rations = 0;
  return s;
}
void test('fear derives from living owned buildings and clamps both tradeoffs', () => {
  const s = economy();
  for (let i = 0; i < 8; i++) add(s, 'garden');
  add(s, 'gallows', 'enemy');
  assert.deepEqual(m.fearFactor(s), { score: 5, productivity: 0.75, morale: 1.25, popularity: 10 });
  assert.equal(m.popularityBreakdown(s)?.fear, 10);
  s.buildings.forEach((b) => {
    b.hp = 0;
  });
  for (let i = 0; i < 8; i++) add(s, 'gallows');
  assert.deepEqual(m.fearFactor(s), {
    score: -5,
    productivity: 1.25,
    morale: 0.75,
    popularity: -10,
  });
  assert.equal(m.TYPES.garden.size, 2);
  assert.equal(m.TYPES.gallows.category, 'Town');
  assert.ok(Object.values(m.TYPES.garden.cost).some((v) => v > 0));
});
void test('workplace pause releases labor immediately and rejects invalid ownership and inputs', () => {
  const s = economy(),
    mill = add(s, 'mill'),
    bakery = add(s, 'bakery');
  assert.equal(m.workforce(s), 4);
  assert.equal(m.applyAction(s, { type: 'workplace', id: mill.id, paused: true }).ok, true);
  assert.equal(m.workforce(s), 2);
  assert.equal(mill.active, 0);
  const wheat = s.resources.wheat;
  s.resources.flour = 10;
  m.production(s, 1, true);
  assert.equal(s.resources.wheat, wheat);
  assert.equal(bakery.active, 1);
  assert.equal(m.applyAction(s, { type: 'workplace', id: mill.id, paused: false }).ok, true);
  assert.equal(mill.active, 0);
  assert.equal(
    m.applyAction(s, { type: 'workplace', id: add(s, 'house').id, paused: true }).ok,
    false,
  );
  assert.equal(
    m.applyAction(s, { type: 'workplace', id: add(s, 'mill', 'enemy').id, paused: true }).ok,
    false,
  );
  assert.equal(parseAction({ type: 'workplace', id: mill.id, paused: 1 }), null);
  assert.equal(parseAction({ type: 'workplace', id: 1.5, paused: true }), null);
});
void test('productivity scales conserved inputs and outputs, obeys caps, and preview matches step', () => {
  const s = economy(),
    mill = add(s, 'mill');
  add(s, 'gallows');
  s.resources.wheat = 0.03;
  const before = { ...s.resources },
    preview = m.income(s);
  m.production(s, 0.05, true);
  for (const key of m.RESOURCE_KEYS)
    assert.ok(Math.abs((s.resources[key] - before[key]) / 0.05 - preview[key]) < 1e-9, key);
  assert.ok(Math.abs(s.resources.flour - before.flour - 0.03) < 1e-9);
  assert.ok(s.resources.wheat >= 0);
  assert.ok((mill.active || 0) < 1);
  s.resources.wheat = 10;
  s.resources.flour = m.storageCapacity(s, 'flour') - 0.01;
  m.production(s, 1, true);
  assert.equal(s.resources.flour, m.storageCapacity(s, 'flour'));
  assert.ok(Math.abs(s.resources.wheat - 9.99) < 1e-9);
});
void test('service pause removes bonuses and fear does not change service consumption', () => {
  const s = economy(),
    inn = add(s, 'inn');
  add(s, 'gallows');
  s.resources.ale = 10;
  m.production(s, 1, true);
  assert.equal(s.resources.ale, 9.82);
  assert.equal(s.factions.player.aleBonus, 8);
  m.applyAction(s, { type: 'workplace', id: inn.id, paused: true });
  assert.equal(s.factions.player.aleBonus, 0);
  m.production(s, 1, true);
  assert.equal(s.resources.ale, 9.82);
});
void test('paused saves roundtrip optionally and malformed flags reject', () => {
  const s = m.createGame({ mode: 'sandbox' });
  const b = s.buildings.find((b) => m.TYPES[b.type].workers);
  assert.ok(b);
  b.paused = true;
  const saved = m.serialize(s);
  assert.equal(m.deserialize(saved).buildings.find((other) => other.id === b.id)?.paused, true);
  const data = JSON.parse(saved) as { buildings: { paused?: unknown }[] };
  for (const bad of [null, 1, 'true', {}]) {
    data.buildings[0]!.paused = bad;
    assert.throws(() => m.deserialize(JSON.stringify(data)), /building/i);
  }
});
void test('fear never creates labor and allied workplaces remain separately owned', () => {
  const s = economy();
  add(s, 'gallows');
  const first = add(s, 'mill'),
    second = add(s, 'mill');
  s.resources.wheat = 20;
  m.production(s, 1, true);
  assert.equal(first.active, 1);
  assert.equal(second.active, 0);
  assert.ok(Math.abs(s.resources.flour - 1.575) < 1e-9);
  const coop = m.createGame({ mode: 'multiplayer', multiplayerMode: 'coop' });
  const ally = add(coop, 'mill', 'player2');
  add(coop, 'garden', 'player2');
  assert.equal(m.fearFactor(coop).score, 0);
  assert.equal(m.fearFactor(coop, 'player2').score, 1);
  assert.equal(m.applyAction(coop, { type: 'workplace', id: ally.id, paused: true }).ok, false);
  assert.equal(
    m.applyAction(coop, { type: 'workplace', id: ally.id, paused: true }, 'player2').ok,
    true,
  );
  ally.hp = 0;
  assert.equal(
    m.applyAction(coop, { type: 'workplace', id: ally.id, paused: false }, 'player2').ok,
    false,
  );
});
void test('kind and fear buildings spend their actual costs and politics uses the displayed target', () => {
  const s = m.createGame({ mode: 'sandbox' });
  for (const type of ['garden', 'gallows'] as const) {
    const before = { ...s.resources };
    let built = false;
    for (let y = 1; y < m.SIZE - 3 && !built; y++)
      for (let x = 1; x < m.SIZE - 3 && !built; x++)
        if (m.canPlace(s, type, x, y).ok) built = m.place(s, type, x, y).ok;
    assert.equal(built, true);
    for (const key of m.RESOURCE_KEYS)
      assert.equal(s.resources[key], before[key] - (m.TYPES[type].cost[key] || 0));
  }
  add(s, 'garden');
  const target = m.popularityBreakdown(s)!.target;
  s.popularity = target - 1;
  m.updatePolitics(s, 1);
  assert.equal(s.popularity, target);
});
