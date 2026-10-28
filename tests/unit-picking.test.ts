import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame, TROOPS } from '../src/game/index.js';
import type { Point, Unit } from '../src/game/index.js';
import { hitRenderedUnit } from '../src/client/render/unit-picking.js';
function soldier(type: Unit['type'], id = 1): Unit {
  return {
    id,
    type,
    team: 'player',
    x: 10,
    y: 10,
    hp: TROOPS[type].hp,
    attack: 0,
    path: [],
    goal: null,
    repath: 0,
    stance: 'hold',
    targetId: null,
    garrisonId: null,
  };
}
function projection(zoom: number, visualPositions = new Map<number, Point>()) {
  return {
    camera: { zoom },
    visualPositions,
    project(x: number, y: number, height = 0): Point {
      return { x: 500 + (x - y) * 32 * zoom, y: 300 + (x + y) * 16 * zoom - height * zoom };
    },
  };
}
void test('infantry helmets and upper bodies remain selectable at every supported zoom without oversized empty corners', () => {
  const state = createGame();
  const unit = soldier('swordsman');
  state.units = [unit];
  for (const zoom of [0.35, 0.83, 1.6]) {
    const surface = projection(zoom),
      foot = surface.project(unit.x, unit.y);
    for (const y of [-31, -18, -4])
      assert.equal(
        hitRenderedUnit(state, surface, { x: foot.x, y: foot.y + y * zoom })?.id,
        unit.id,
      );
    assert.equal(
      hitRenderedUnit(state, surface, { x: foot.x + 19 * zoom, y: foot.y - 28 * zoom }),
      undefined,
    );
    assert.equal(hitRenderedUnit(state, surface, { x: foot.x, y: foot.y - 43 * zoom }), undefined);
  }
});
void test('mounted rider helmets and horse heads use their taller silhouette, including mirrored facing', () => {
  const state = createGame();
  for (const id of [1, 3]) {
    const unit = soldier('knight', id);
    state.units = [unit];
    const surface = projection(0.83),
      foot = surface.project(unit.x, unit.y),
      direction = id === 3 ? -1 : 1;
    assert.equal(
      hitRenderedUnit(state, surface, { x: foot.x - direction * 0.83, y: foot.y - 44 * 0.83 })?.id,
      id,
    );
    assert.equal(
      hitRenderedUnit(state, surface, { x: foot.x + direction * 21 * 0.83, y: foot.y - 26 * 0.83 })
        ?.id,
      id,
    );
    assert.equal(
      hitRenderedUnit(state, surface, { x: foot.x + direction * 35 * 0.83, y: foot.y - 30 * 0.83 }),
      undefined,
    );
  }
});
void test('siege picking follows each roof, frame and throwing arm rather than a giant rectangular bound', () => {
  const state = createGame(),
    surface = projection(1.2);
  const cases: { type: Unit['type']; point: Point }[] = [
    { type: 'ram', point: { x: 0, y: -30 } },
    { type: 'trebuchet', point: { x: -3 + Math.cos(-0.75) * 34, y: -36 + Math.sin(-0.75) * 34 } },
    { type: 'catapult', point: { x: -3 + Math.cos(-1.1) * 23, y: -19 + Math.sin(-1.1) * 23 } },
    { type: 'ballista', point: { x: -8, y: -29 } },
  ];
  for (const { type, point } of cases) {
    const unit = soldier(type);
    state.units = [unit];
    const foot = surface.project(unit.x, unit.y);
    assert.equal(
      hitRenderedUnit(state, surface, { x: foot.x + point.x * 1.2, y: foot.y + point.y * 1.2 })?.id,
      unit.id,
      type,
    );
    assert.equal(
      hitRenderedUnit(state, surface, { x: foot.x - 30 * 1.2, y: foot.y - 49 * 1.2 }),
      undefined,
      `${type} empty corner`,
    );
  }
});
void test('interpolated anchors, closest body scoring, ownership filters and garrisons preserve selection intent', () => {
  const state = createGame(),
    first = soldier('archer'),
    second = soldier('archer', 2);
  second.x += 0.2;
  state.units = [first, second];
  const surface = projection(0.83),
    foot = surface.project(first.x, first.y);
  assert.equal(
    hitRenderedUnit(state, surface, { x: foot.x, y: foot.y - 18 * 0.83 })?.id,
    first.id,
    'closest body wins even when another unit appears later',
  );
  const visual = { x: 14, y: 12 };
  surface.visualPositions.set(first.id, visual);
  state.units = [first];
  const drawn = surface.project(visual.x, visual.y);
  assert.equal(
    hitRenderedUnit(state, surface, { x: drawn.x, y: drawn.y - 28 * 0.83 })?.id,
    first.id,
  );
  assert.equal(
    hitRenderedUnit(state, surface, { x: foot.x, y: foot.y - 28 * 0.83 }),
    undefined,
    'old authoritative position is not clickable',
  );
  assert.equal(
    hitRenderedUnit(state, surface, { x: drawn.x, y: drawn.y - 18 * 0.83 }, () => false),
    undefined,
  );
  first.garrisonId = 99;
  assert.equal(
    hitRenderedUnit(state, surface, { x: drawn.x, y: drawn.y - 18 * 0.83 }),
    undefined,
    'garrisons remain selected through their building',
  );
});
