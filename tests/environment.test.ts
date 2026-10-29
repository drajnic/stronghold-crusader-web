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
  const { createGame, serialize, deserialize, SMALL_MAP, parseMap } =
    await import('../src/game/index.js');
  const rows = Array<string>(128).fill('s'.repeat(128));
  rows[32] = `${'s'.repeat(6)}t${'s'.repeat(121)}`;
  const map = parseMap({ ...SMALL_MAP, terrain: rows });
  const scene = new EnvironmentScene(map),
    view = {
      width: 800,
      height: 600,
      project: (x: number, y: number) => ({ x: (x - 6) * 32 + 400, y: (y - 32) * 16 + 300 }),
      inverse: (x: number, y: number) => ({ x: (x - 400) / 32 + 6, y: (y - 300) / 16 + 32 }),
    };
  const s = deserialize(serialize(createGame({ mode: 'sandbox', map })), { rebuildPaths: false }),
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

void test('projected terrain chunks cover far cameras through512 and bound memory independently of world size', async () => {
  const { terrainChunkBounds, TERRAIN_CHUNK_SIZE, TERRAIN_CHUNK_LIMIT } =
    await import('../src/client/render/terrain.js');
  for (const size of [128, 256, 512]) {
    for (const x of [0, size / 2, size - 1]) {
      for (const y of [0, size / 2, size - 1]) {
        const bounds = terrainChunkBounds(1200, 800, size, { x, y, zoom: 0.5 });
        assert.ok(bounds.minX >= 0 && bounds.minY >= 0);
        assert.ok(bounds.maxX < Math.ceil((size * 64) / TERRAIN_CHUNK_SIZE));
        assert.ok(bounds.maxY < Math.ceil((size * 32 + 2) / TERRAIN_CHUNK_SIZE));
        const px = size * 32 + (x - y) * 32,
          py = (x + y) * 16;
        assert.ok(Math.floor(px / TERRAIN_CHUNK_SIZE) >= bounds.minX);
        assert.ok(Math.floor(py / TERRAIN_CHUNK_SIZE) >= bounds.minY);
      }
    }
  }
  assert.ok(TERRAIN_CHUNK_LIMIT * TERRAIN_CHUNK_SIZE ** 2 * 4 <= 48 * 1024 ** 2);
});

void test('128 vegetation buckets remain unique beyond eighth column and include far edge', async () => {
  const { EnvironmentScene } = await import('../src/client/render/environment.js');
  const { SMALL_MAP, createGame } = await import('../src/game/index.js');
  const rows = Array.from({ length: 128 }, () => 's'.repeat(128).split(''));
  for (const [x, y] of [
    [72, 0],
    [8, 8],
    [126, 126],
  ])
    rows[y][x] = 't';
  const map = { ...SMALL_MAP, terrain: rows.map((row) => row.join('')) };
  const scene = new EnvironmentScene(map),
    state = createGame({ mode: 'sandbox', map });
  state.buildings = [];
  for (const [x, y] of [
    [72, 0],
    [8, 8],
    [126, 126],
  ]) {
    const view = {
      width: 100,
      height: 100,
      inverse: (px: number, py: number) => ({ x: x + (px - 50) / 32, y: y + (py - 50) / 32 }),
      project: (tx: number, ty: number) => ({ x: (tx - x) * 32 + 50, y: (ty - y) * 32 + 50 }),
    };
    const palms = scene.visible(view, state).filter((item) => item.kind === 'palm');
    assert.equal(palms.length, 1);
    assert.deepEqual([palms[0].x, palms[0].y], [x + 0.5, y + 0.5]);
  }
});

void test('large zoomed-out viewports fit their complete terrain working set in the LRU', async () => {
  const { terrainRasterScale, terrainChunkBounds, TERRAIN_CHUNK_LIMIT, TERRAIN_CHUNK_SIZE } =
    await import('../src/client/render/terrain.js');
  for (const [width, height] of [
    [1024, 600],
    [3840, 2160],
    [7680, 4320],
  ]) {
    for (const zoom of [0.42, 1]) {
      const scale = terrainRasterScale(width, height, zoom);
      const bounds = terrainChunkBounds(
        width,
        height,
        512,
        { x: 256, y: 256, zoom },
        TERRAIN_CHUNK_SIZE * scale,
      );
      assert.ok(
        (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1) <= TERRAIN_CHUNK_LIMIT,
      );
    }
  }
  assert.equal(terrainRasterScale(1024, 600, 1), 1);
});

void test('fractional terrain zoom shares exact device-pixel edges between adjacent chunks', async () => {
  const { DrawingSurface } = await import('../src/client/render/drawing.js');
  const { SMALL_MAP } = await import('../src/game/index.js');
  const { drawTerrain, terrainChunkBounds } = await import('../src/client/render/terrain.js');
  for (const dpr of [1, 1.25, 2]) {
    for (const zoom of [0.42, 0.83, 1]) {
      const draws: number[][] = [];
      const canvas = {
        width: 1024 * dpr,
        height: 600 * dpr,
        getContext: () => ({ drawImage: (_image: unknown, ...rect: number[]) => draws.push(rect) }),
      } as unknown as HTMLCanvasElement;
      const surface = new DrawingSurface(canvas);
      surface.setMap(SMALL_MAP);
      surface.width = 1024;
      surface.height = 600;
      surface.camera = { x: 24.3, y: 96.7, zoom };
      surface.terrainContours = { grass: [], water: [] };
      const bounds = terrainChunkBounds(1024, 600, 128, surface.camera);
      for (let y = bounds.minY; y <= bounds.maxY; y++)
        for (let x = bounds.minX; x <= bounds.maxX; x++)
          surface.terrainChunks.set(`1:${x}:${y}`, {} as HTMLCanvasElement);
      drawTerrain(surface);
      const columns = bounds.maxX - bounds.minX + 1;
      assert.ok(draws.length > 1);
      for (let i = 0; i < draws.length; i++) {
        const [left, top, width, height] = draws[i];
        for (const edge of [left, top, left + width, top + height])
          assert.ok(Math.abs(edge * dpr - Math.round(edge * dpr)) < 1e-8);
        if (i % columns) assert.ok(Math.abs(draws[i - 1][0] + draws[i - 1][2] - left) < 1e-8);
        if (i >= columns)
          assert.ok(Math.abs(draws[i - columns][1] + draws[i - columns][3] - top) < 1e-8);
      }
    }
  }
});

void test('512 vegetation prepares only viewport buckets and includes distant resources', async () => {
  const { EnvironmentScene } = await import('../src/client/render/environment.js');
  const { LARGE_MAP, createGame } = await import('../src/game/index.js');
  const rows = Array.from({ length: 512 }, () => 's'.repeat(512));
  rows[500] = rows[500].slice(0, 500) + 't' + rows[500].slice(501);
  let reads = 0;
  const map = { ...LARGE_MAP, terrain: rows };
  const state = createGame({ mode: 'sandbox', map });
  state.buildings = [];
  const scene = new EnvironmentScene({
    ...map,
    terrain: new Proxy(rows, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
        return Reflect.get(target, key, receiver);
      },
    }),
  });
  assert.equal(reads, 0);
  const view = {
    width: 100,
    height: 100,
    inverse: (x: number, y: number) => ({ x: 500 + (x - 50) / 32, y: 500 + (y - 50) / 32 }),
    project: (x: number, y: number) => ({ x: (x - 500) * 32 + 50, y: (y - 500) * 32 + 50 }),
  };
  const visible = scene.visible(view, state);
  assert.ok(visible.some((item) => item.kind === 'palm' && item.x === 500.5 && item.y === 500.5));
  assert.ok(reads < 10000, `viewport generated ${reads} terrain reads`);
  const first = reads;
  scene.visible(view, state);
  assert.equal(reads, first);
});

void test('custom512 jagged coastlines render without argument-size limits and cull distant islands', async () => {
  const { DrawingSurface } = await import('../src/client/render/drawing.js');
  const { LARGE_MAP } = await import('../src/game/index.js');
  const { drawTerrain, terrainContourBounds } = await import('../src/client/render/terrain.js');
  let curves = 0;
  const context = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === 'createLinearGradient' || key === 'createRadialGradient')
          return () => ({ addColorStop() {} });
        if (key === 'quadraticCurveTo') return () => curves++;
        return () => {};
      },
      set() {
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  const canvas = {
    width: 256,
    height: 256,
    getContext: () => context,
  } as unknown as HTMLCanvasElement;
  const surface = new DrawingSurface(canvas);
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  } as unknown as Document;
  try {
    const rows = Array.from({ length: 512 }, (_, y) =>
      y % 2 === 0 ? 'w'.repeat(512) : 'w' + 's'.repeat(511),
    );
    surface.setMap({ ...LARGE_MAP, terrain: rows });
    surface.width = 256;
    surface.height = 256;
    surface.camera = { x: 256, y: 256, zoom: 1 };
    drawTerrain(surface);
    const water = surface.terrainContours!.water;
    assert.ok(water.some((points) => points.length > 125000));
    assert.ok(
      water.every((points) => Object.values(terrainContourBounds(points)).every(Number.isFinite)),
    );
    assert.ok(curves > 125000);
    // Tens of thousands of separate one-cell islands should not all be painted
    // into a small distant viewport's cold terrain chunks.
    surface.setMap({
      ...LARGE_MAP,
      terrain: Array.from({ length: 512 }, (_, y) =>
        Array.from({ length: 512 }, (_, x) => (x % 3 === 0 && y % 3 === 0 ? 'w' : 's')).join(''),
      ),
    });
    curves = 0;
    drawTerrain(surface);
    assert.ok(surface.terrainContours!.water.length > 25000);
    assert.ok(curves < 10000, `${curves} curves for viewport islands`);
  } finally {
    globalThis.document = previousDocument;
  }
});
