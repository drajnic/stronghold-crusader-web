import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, update, command } from '../src/game/index.js';
import { pathfind } from '../src/game/pathfinding.js';
import { moveUnit } from '../src/game/movement.js';
import {
  UnitSpatialIndex,
  unitRadius,
  staticPositionClear,
  resolveUnitOverlaps,
} from '../src/game/spatial.js';
import type { GameState, TroopType, Unit } from '../src/game/types.js';
import { invalidate } from '../src/game/map.js';
function state() {
  const s = createGame({ mode: 'sandbox' });
  s.buildings = [];
  s.units = [];
  invalidate(s);
  return s;
}
function unit(s: GameState, x: number, y: number, type: TroopType = 'spearman') {
  const u: Unit = {
    id: s.nextId++,
    x,
    y,
    type,
    team: 'player',
    hp: 100,
    attack: 0,
    path: [],
    goal: null,
    repath: 0,
    stance: 'hold',
    targetId: null,
    garrisonId: null,
  };
  s.units.push(u);
  return u;
}
function disjoint(s: GameState) {
  for (const u of s.units) {
    assert.ok(staticPositionClear(s, u, unitRadius(u)));
    for (const v of s.units)
      if (u.id < v.id)
        assert.ok(
          Math.hypot(u.x - v.x, u.y - v.y) >= unitRadius(u) + unitRadius(v) - 1e-6,
          `${u.id} overlaps ${v.id}`,
        );
  }
}
void test('large movement budgets cannot tunnel through walls or idle bodies', () => {
  const s = state();
  const a = unit(s, 15.5, 10.5);
  unit(s, 18.5, 10.5, 'ram');
  s.buildings.push({
    id: s.nextId++,
    type: 'wall',
    team: 'player',
    x: 20,
    y: 10,
    hp: 100,
    shot: 0,
  });
  invalidate(s);
  const index = new UnitSpatialIndex(s.units);
  moveUnit(s, index, a, { x: 25.5, y: 10.5 }, 50);
  disjoint(s);
});
void test('overlapping old saves and units inside solid geometry are repaired deterministically', () => {
  const s = state();
  for (let i = 0; i < 20; i++) unit(s, 15.5, 10.5, i % 2 ? 'knight' : 'ram');
  resolveUnitOverlaps(s);
  disjoint(s);
  const positions = s.units.map((u) => [u.x, u.y]);
  resolveUnitOverlaps(s);
  assert.deepEqual(
    s.units.map((u) => [u.x, u.y]),
    positions,
  );
});
void test('gate and corner geometry includes the full footprint', () => {
  const s = state();
  s.buildings.push({
    id: s.nextId++,
    type: 'gate',
    team: 'player',
    x: 20,
    y: 10,
    hp: 100,
    shot: 0,
    open: false,
  });
  invalidate(s);
  assert.equal(staticPositionClear(s, { x: 20.5, y: 10.5 }, 0.43), false);
  s.buildings[0].open = true;
  assert.equal(staticPositionClear(s, { x: 20.5, y: 10.5 }, 0.43), true);
  s.buildings[0].open = false;
  assert.equal(staticPositionClear(s, { x: 19.8, y: 9.8 }, 0.43), false);
});
void test('crossing opposing groups make progress without stacking', () => {
  const s = state();
  const left = Array.from({ length: 5 }, (_, i) => unit(s, 12.5, 9 + i * 0.55));
  const right = Array.from({ length: 5 }, (_, i) => unit(s, 20.5, 9 + i * 0.55));
  for (const u of s.units) u.goal = { x: left.includes(u) ? 22 : 11, y: u.y };
  for (let n = 0; n < 700; n++) {
    const index = new UnitSpatialIndex(s.units);
    for (const u of s.units) moveUnit(s, index, u, u.goal!, 0.06);
    disjoint(s);
  }
  assert.ok(left.every((u) => u.x > 18));
  assert.ok(right.every((u) => u.x < 15));
});
void test('converging mixed footprints retain collision separation', () => {
  const s = state();
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8;
    unit(
      s,
      16 + Math.cos(a) * 4,
      12 + Math.sin(a) * 4,
      i % 3 === 0 ? 'ram' : i % 3 === 1 ? 'knight' : 'spearman',
    );
  }
  for (let n = 0; n < 150; n++) {
    const index = new UnitSpatialIndex(s.units);
    for (const u of s.units) moveUnit(s, index, u, { x: 16, y: 12 }, 0.06);
    disjoint(s);
  }
});
void test('mixed siege yields out of a single-file corridor without a permanent head-on lock', () => {
  const s = state();
  for (let x = 14; x <= 20; x++)
    for (const y of [9, 11])
      s.buildings.push({ id: s.nextId++, type: 'wall', team: 'player', x, y, hp: 100, shot: 0 });
  invalidate(s);
  const a = unit(s, 12.5, 10.5, 'ram'),
    b = unit(s, 22.5, 10.5, 'knight');
  a.goal = { x: 23.5, y: 10.5 };
  b.goal = { x: 11.5, y: 10.5 };
  for (let n = 0; n < 1600; n++) {
    const index = new UnitSpatialIndex(s.units);
    for (const u of s.units) {
      if (!u.path.length || n % 40 === 0) u.path = pathfind(s, u, u.goal!, u.team, unitRadius(u));
      if (u.path[0] && moveUnit(s, index, u, u.path[0], 0.06)) u.path.shift();
    }
    disjoint(s);
  }
  assert.ok(a.x > 21, `siege stuck at ${a.x}`);
  assert.ok(b.x < 14, `cavalry stuck at ${b.x}`);
});
void test('a stationary ally gives way through a narrow gateway', () => {
  const s = state();
  for (let x = 14; x <= 18; x++)
    for (const y of [9, 11])
      s.buildings.push({ id: s.nextId++, type: 'wall', team: 'player', x, y, hp: 100, shot: 0 });
  invalidate(s);
  const a = unit(s, 12.5, 10.5, 'ram');
  unit(s, 16.5, 10.5, 'knight');
  a.goal = { x: 22.5, y: 10.5 };
  for (let n = 0; n < 1200; n++) {
    const index = new UnitSpatialIndex(s.units);
    if (!a.path.length || n % 40 === 0) a.path = pathfind(s, a, a.goal, a.team, unitRadius(a));
    if (a.path[0] && moveUnit(s, index, a, a.path[0], 0.06)) a.path.shift();
    disjoint(s);
  }
  assert.ok(a.x > 20, `siege blocked by idle ally at ${a.x}`);
});
void test('destroyed towers release occupants into the same tick movement index', () => {
  const s = createGame({ mode: 'sandbox' });
  s.units = [];
  const tower = {
    id: s.nextId++,
    type: 'tower' as const,
    team: 'player' as const,
    x: 16,
    y: 10,
    hp: 1,
    shot: 10,
  };
  s.buildings.push(tower);
  invalidate(s);
  const attacker = unit(s, 15.5, 11, 'ram');
  attacker.team = 'enemy';
  attacker.targetId = tower.id;
  const occupant = unit(s, 17, 11, 'archer');
  occupant.garrisonId = tower.id;
  const mover = unit(s, 17, 9.65, 'knight');
  mover.goal = { x: 17, y: 13 };
  mover.path = [{ x: 17, y: 11 }];
  mover.repath = 10;
  update(s, 0.25);
  assert.equal(tower.hp, 0);
  assert.equal(occupant.garrisonId, null);
  disjoint(s);
});
void test('mixed three-unit choke queues with arbitrary IDs can yield as a group', () => {
  const s = state();
  for (let x = 14; x <= 20; x++)
    for (const y of [9, 11])
      s.buildings.push({ id: s.nextId++, type: 'wall', team: 'player', x, y, hp: 100, shot: 0 });
  invalidate(s);
  const a = unit(s, 12.5, 10.5, 'ram'),
    b = unit(s, 21.5, 10.5, 'ram'),
    c = unit(s, 22.5, 10.5, 'ram');
  a.id = 5;
  b.id = 8;
  c.id = 2;
  a.goal = { x: 24.5, y: 10.5 };
  b.goal = { x: 11.5, y: 10.5 };
  c.goal = { x: 10.5, y: 10.5 };
  for (let n = 0; n < 2000; n++) {
    const index = new UnitSpatialIndex(s.units);
    for (const u of s.units) {
      if (!u.path.length || n % 40 === 0) u.path = pathfind(s, u, u.goal!, u.team, unitRadius(u));
      if (u.path[0] && moveUnit(s, index, u, u.path[0], 0.06)) u.path.shift();
    }
    disjoint(s);
  }
  assert.ok(a.x > 21);
  assert.ok(b.x < 14);
  assert.ok(c.x < 14);
});
void test('publicly commanded coop shooters keep attack orders while giving way', () => {
  const s = createGame({ mode: 'multiplayer', multiplayerMode: 'coop' });
  s.units = [];
  s.buildings = [];
  for (const [team, x, y] of [
    ['player', 4, 4],
    ['player2', 4, 50],
    ['enemy', 55, 55],
  ] as const)
    s.buildings.push({ id: s.nextId++, type: 'keep', team, x, y, hp: 1000, shot: 0 });
  s.factions.enemy!.aiTimer = 1e6;
  s.factions.enemy!.attackTimer = 1e6;
  const a = unit(s, 12.5, 10.5, 'ram'),
    b = unit(s, 16.5, 10.5, 'archer');
  b.team = 'player2';
  for (let x = 14; x <= 18; x++)
    for (const y of [9, 11])
      s.buildings.push({ id: s.nextId++, type: 'wall', team: 'player', x, y, hp: 100, shot: 0 });
  const target = {
    id: s.nextId++,
    type: 'wall' as const,
    team: 'enemy' as const,
    x: 16,
    y: 13,
    hp: 1e9,
    shot: 0,
  };
  s.buildings.push(target);
  invalidate(s);
  assert.ok(command(s, [b.id], target.x, target.y, 'player2', { targetId: target.id }).ok);
  assert.ok(b.goal);
  assert.equal(b.targetId, target.id);
  assert.ok(command(s, [a.id], 22.5, 10.5).ok);
  for (let n = 0; n < 1200; n++) {
    update(s, 0.05);
    disjoint(s);
  }
  assert.ok(a.x > 20, `siege blocked at ${a.x}`);
  assert.equal(b.targetId, target.id);
  assert.ok(target.hp < 1e9);
});
