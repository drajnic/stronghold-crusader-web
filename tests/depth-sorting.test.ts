import assert from 'node:assert/strict';
import test from 'node:test';
import {
  sortByFootprint,
  visualUnitPosition,
  garrisonPosition,
  type DepthItem,
} from '../src/client/render/depth.js';
import type { Building, Unit } from '../src/game/index.js';
const keep: DepthItem = { x: 10, y: 10, width: 3, height: 3, key: 'keep' };
const point = (key: string, x: number, y: number): DepthItem => ({
  key,
  x,
  y,
  width: 0,
  height: 0,
});
void test('large building edges order adjacent troops even when center depth disagrees', () => {
  for (const front of [point('front', 13.1, 10.1), point('front', 10.1, 13.1)]) {
    assert.deepEqual(
      sortByFootprint([front, keep]).map((i) => i.key),
      ['keep', 'front'],
    );
  }
  for (const back of [point('back', 9.9, 12.9), point('back', 12.9, 9.9)]) {
    assert.deepEqual(
      sortByFootprint([keep, back]).map((i) => i.key),
      ['back', 'keep'],
    );
  }
});
void test('unrelated side silhouettes and tied units have deterministic order', () => {
  const items = [keep, point('u2', 14, 9), point('u1', 14, 9), point('side', 7, 15)];
  assert.deepEqual(sortByFootprint(items), sortByFootprint([...items].reverse()));
  assert.deepEqual(
    sortByFootprint(items)
      .filter((i) => i.key.startsWith('u'))
      .map((i) => i.key),
    ['u1', 'u2'],
  );
});
void test('wall or gate edge remains behind a troop at its front corner', () => {
  for (const size of [1, 2]) {
    const wall = { x: 4, y: 4, width: size, height: size, key: 'wall' };
    const troop = point('troop', 4 + size + 0.1, 4.1);
    assert.deepEqual(
      sortByFootprint([troop, wall]).map((i) => i.key),
      ['wall', 'troop'],
    );
  }
});
void test('unit ordering uses the same interpolated position as the sprite', () => {
  const u = { id: 1, x: 14, y: 10 } as Unit;
  const visual = visualUnitPosition(u, new Map([[1, { x: 9.9, y: 12.9 }]]));
  assert.deepEqual(
    sortByFootprint([keep, point('unit', visual.x, visual.y)]).map((i) => i.key),
    ['unit', 'keep'],
  );
  assert.equal(visualUnitPosition(u, new Map()), u);
});
void test('six garrison slots stay distinct and inside their tower footprint', () => {
  const tower = { x: 10, y: 20 } as Building;
  const slots = Array.from({ length: 6 }, (_, i) => garrisonPosition(tower, i));
  assert.equal(new Set(slots.map((p) => `${p.x}:${p.y}`)).size, 6);
  for (const p of slots) assert.ok(p.x > 10 && p.x < 12 && p.y > 20 && p.y < 22);
});

void test('ordinary online motion keeps smooth positions without mutating snapshots', async () => {
  const { interpolateUnits } = await import('../src/client/render/interpolation.js');
  const { createGame } = await import('../src/game/index.js');
  const { staticPositionClear } = await import('../src/game/spatial.js');
  const state = createGame();
  state.buildings = [];
  state.units = [];
  let origin: { x: number; y: number } | undefined;
  for (let y = 2; y < 55 && !origin; y++)
    for (let x = 2; x < 55 && !origin; x++)
      if (
        Array.from({ length: 25 }, (_, i) => ({
          x: x + (i % 5) + 0.5,
          y: y + Math.floor(i / 5) + 0.5,
        })).every((p) => staticPositionClear(state, p, 0.24))
      )
        origin = { x, y };
  assert.ok(origin);
  const make = (id: number, x: number, y: number): Unit => ({
    id,
    type: 'swordsman',
    team: 'player',
    hp: 100,
    x,
    y,
    attack: 0,
    path: [],
    goal: null,
    repath: 0,
    stance: 'hold',
    targetId: null,
    garrisonId: null,
  });
  const a = make(1, origin.x + 3.5, origin.y + 1.5),
    b = make(2, origin.x + 3.5, origin.y + 2.5);
  state.units = [a, b];
  const from = new Map([
    [1, { x: a.x - 1, y: a.y }],
    [2, { x: b.x - 1, y: b.y }],
  ]);
  const before = JSON.stringify(state.units);
  const smooth = interpolateUnits(state, from, 95);
  assert.equal(smooth.get(1)?.x, a.x - 0.5);
  assert.equal(smooth.get(2)?.x, b.x - 0.5);
  assert.equal(JSON.stringify(state.units), before);
  const crossing = new Map([
    [1, { x: b.x, y: b.y }],
    [2, { x: a.x, y: a.y }],
  ]);
  const safe = interpolateUnits(state, crossing, 95);
  assert.deepEqual(safe.get(1), { x: a.x, y: a.y });
  assert.deepEqual(safe.get(2), { x: b.x, y: b.y });
  const cornerState = {
    ...state,
    buildings: [{ id: 9, type: 'wall', x: origin.x + 2, y: origin.y + 2, hp: 100 } as Building],
  };
  const cornerUnit = make(3, origin.x + 2.6, origin.y + 1.5);
  cornerState.units = [cornerUnit];
  const corner = interpolateUnits(
    cornerState,
    new Map([[3, { x: origin.x + 1.5, y: origin.y + 2.6 }]]),
    95,
  );
  assert.deepEqual(corner.get(3), { x: cornerUnit.x, y: cornerUnit.y });
});
