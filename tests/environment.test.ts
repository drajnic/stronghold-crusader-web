import assert from 'node:assert/strict';
import test from 'node:test';
import {
  regionContours,
  smoothNoise,
  viewportBounds,
} from '../src/client/render/environment-geometry.js';

const area = (points: { x: number; y: number }[]) =>
  points.reduce((sum, p, i) => {
    const next = points[(i + 1) % points.length];
    return sum + p.x * next.y - next.x * p.y;
  }, 0) / 2;
void test('terrain contours conserve world area and keep disconnected oasis regions separate', () => {
  const cells = new Set(['0,0', '1,0', '1,1', '4,3', '4,4']);
  const contours = regionContours(6, (x, y) => cells.has(`${x},${y}`));
  assert.equal(contours.length, 2);
  assert.equal(
    contours.reduce((sum, loop) => sum + area(loop), 0),
    cells.size,
  );
  assert.ok(
    contours.every((loop) => loop.every((p) => p.x >= 0 && p.y >= 0 && p.x <= 6 && p.y <= 6)),
  );
  assert.deepEqual(
    regionContours(6, () => false),
    [],
  );
  assert.equal(area(regionContours(6, () => true)[0]), 36);
});
void test('terrain noise stays continuous across simulation tile boundaries and is deterministic', () => {
  for (const x of [-3, 0, 1, 10, 63])
    for (const y of [-2, 0, 7, 64]) {
      const center = smoothNoise(x, y);
      assert.ok(center >= 0 && center < 1);
      assert.equal(center, smoothNoise(x, y));
      assert.ok(Math.abs(smoothNoise(x - 1e-5, y) - smoothNoise(x + 1e-5, y)) < 0.001);
    }
});
void test('viewport queries include tall sprite overhang and reject wholly off-map regions', () => {
  const inverse = (x: number, y: number) => ({ x: x / 64 + y / 32 + 16, y: y / 32 - x / 64 + 40 });
  const bounds = viewportBounds(inverse, 800, 600, 64, 140);
  for (const [x, y] of [
    [-140, -140],
    [940, -140],
    [940, 740],
    [-140, 740],
  ]) {
    const p = inverse(x, y);
    if (p.x >= 0 && p.y >= 0 && p.x < 64 && p.y < 64)
      assert.ok(
        p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY,
      );
  }
  const outside = viewportBounds(() => ({ x: 120, y: 120 }), 800, 600, 64);
  assert.ok(outside.minX > outside.maxX && outside.minY > outside.maxY);
});

void test('presentation clock smooths snapshot gaps but bounds paused or terminal animation', async () => {
  const { visualTime } = await import('../src/client/render/clock.js');
  const { createGame } = await import('../src/game/index.js');
  const s = createGame({ mode: 'sandbox' });
  assert.equal(visualTime(s, 1000), 0);
  assert.equal(visualTime(s, 1100), 0.1);
  assert.equal(visualTime(s, 5000), 0.2);
  s.time = 0.5;
  assert.equal(visualTime(s, 5000), 0.5);
  assert.equal(visualTime(s, 5050), 0.55);
  s.status = 'victory';
  assert.equal(visualTime(s, 9000), 0.5);
});

void test('fresh online snapshots invalidate occupied vegetation even when entity count and revision stay equal', async () => {
  const { EnvironmentScene } = await import('../src/client/render/environment.js');
  const { createGame, serialize, deserialize } = await import('../src/game/index.js');
  const scene = new EnvironmentScene(),
    view = {
      width: 800,
      height: 600,
      project: (x: number, y: number) => ({ x: (x - 6) * 32 + 400, y: (y - 32) * 16 + 300 }),
      inverse: (x: number, y: number) => ({ x: (x - 400) / 32 + 6, y: (y - 300) / 16 + 32 }),
    };
  const s = deserialize(serialize(createGame({ mode: 'sandbox' })), { rebuildPaths: false }),
    palm = (items: ReturnType<typeof scene.visible>) =>
      items.some((item) => item.kind === 'palm' && item.x === 6.5 && item.y === 32.5);
  assert.ok(palm(scene.visible(view, s)));
  const replacement = JSON.parse(serialize(s)) as typeof s,
    house = replacement.buildings.find((b) => b.type === 'house');
  assert.ok(house);
  house.x = 6;
  house.y = 32;
  const next = deserialize(JSON.stringify(replacement), { rebuildPaths: false });
  assert.equal(next.buildings.length, s.buildings.length);
  assert.equal(next.mapRevision, s.mapRevision);
  assert.equal(palm(scene.visible(view, next)), false);
  assert.ok(palm(scene.visible(view, s)));
});
