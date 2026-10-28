import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_MAP, parseMap } from '../src/game/index.js';
import { DrawingSurface } from '../src/client/render/drawing.js';
import { deleteMap, readMaps, saveMapCopy } from '../src/client/ui/map-library.js';

void test('map terrain cache changes with content but survives cloned network snapshots', () => {
  const canvas = { getContext: () => ({}) } as unknown as HTMLCanvasElement;
  const surface = new DrawingSurface(canvas);
  const cache = {} as HTMLCanvasElement;
  surface.terrainCache = cache;
  assert.equal(surface.setMap(parseMap(JSON.parse(JSON.stringify(DEFAULT_MAP)))), false);
  assert.equal(surface.terrainCache, cache);
  const map = parseMap({ ...DEFAULT_MAP, terrain: Array(64).fill('w'.repeat(64)) });
  assert.equal(surface.setMap(map), true);
  assert.equal(surface.terrainCache, null);
  assert.ok(surface.tiles.every((tile) => tile.t === 'water'));
  surface.terrainCache = cache;
  assert.equal(surface.setMap(parseMap(JSON.parse(JSON.stringify(map)))), false);
  assert.equal(surface.terrainCache, cache);
  assert.equal(surface.setMap(DEFAULT_MAP), true);
  assert.ok(surface.tiles.some((tile) => tile.t !== 'water'));
});

void test('local map library rejects corrupt entries, preserves drafts, and reports quota failure', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let stored = '{broken';
  let full = false;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        if (full) throw Error('quota');
        stored = value;
      },
    },
  });
  try {
    assert.deepEqual(readMaps(), []);
    assert.throws(() => saveMapCopy(DEFAULT_MAP), /preserved/);
    assert.equal(stored, '{broken');
    assert.throws(() => deleteMap('anything'), /preserved/);
    assert.equal(stored, '{broken');
    stored = '[]';
    saveMapCopy(DEFAULT_MAP);
    saveMapCopy({ ...DEFAULT_MAP, terrain: Array(64).fill('w'.repeat(64)) });
    assert.equal(readMaps().length, 2);
    const id = readMaps()[0].id;
    deleteMap(id);
    assert.equal(readMaps().length, 1);
    assert.equal(readMaps()[0].map.terrain[0], 'w'.repeat(64));
    full = true;
    assert.throws(() => saveMapCopy(DEFAULT_MAP), /storage is unavailable or full/);
    assert.equal(readMaps().length, 1);
    stored = JSON.stringify([null, { id: 'bad', map: {} }, { id: 'good', map: DEFAULT_MAP }]);
    assert.equal(readMaps().length, 1);
    full = false;
    const corruptEntries = stored;
    assert.throws(() => saveMapCopy(DEFAULT_MAP), /preserved/);
    assert.throws(() => deleteMap('good'), /preserved/);
    assert.equal(stored, corruptEntries);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

void test('renderer minimap rebuilds for changed maps, retains cache for equivalent snapshots, then restores default', async () => {
  const { Renderer } = await import('../src/client/render/renderer.js');
  const { createGame } = await import('../src/game/index.js');
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const drawn: unknown[] = [];
  const cachedColors: string[][] = [];
  const context = {
    drawImage: (canvas: unknown) => drawn.push(canvas),
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => {
        const colors: string[] = [];
        cachedColors.push(colors);
        const paint = {
          fillStyle: '',
          fillRect() {
            colors.push(this.fillStyle);
          },
        };
        return { width: 0, height: 0, getContext: () => paint };
      },
    },
  });
  try {
    const canvas = {
      width: 128,
      height: 128,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    const renderer = new Renderer(canvas);
    const state = createGame();
    renderer.minimap(canvas, state);
    const original = drawn.at(-1);
    renderer.minimap(canvas, { ...state, map: parseMap(JSON.parse(JSON.stringify(state.map))) });
    assert.equal(drawn.at(-1), original);
    const changed = {
      ...state,
      map: parseMap({ ...DEFAULT_MAP, terrain: Array(64).fill('w'.repeat(64)) }),
    };
    renderer.minimap(canvas, changed);
    assert.notEqual(drawn.at(-1), original);
    assert.ok(cachedColors.at(-1)?.includes('#438f94'));
    assert.ok(renderer.tiles.every((tile) => tile.t === 'water'));
    renderer.minimap(canvas, state);
    assert.notEqual(drawn.at(-1), drawn.at(-2));
    assert.ok(renderer.tiles.some((tile) => tile.t === 'grass'));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

void test('fast paint strokes have no gaps, form one undo step and preserve library source', async () => {
  const { paintStroke, strokeCells, EditorHistory, decodeDraft } =
    await import('../src/client/ui/map-editor-model.js');
  const source = parseMap({ ...DEFAULT_MAP, terrain: Array(64).fill('s'.repeat(64)) });
  const history = new EditorHistory();
  history.checkpoint(source);
  let draft = paintStroke(source, { x: 4, y: 4 }, { x: 30, y: 18 }, 'w', 1);
  draft = paintStroke(draft, { x: 30, y: 18 }, { x: 50, y: 18 }, 'w', 1);
  for (const point of strokeCells({ x: 4, y: 4 }, { x: 30, y: 18 }))
    assert.equal(draft.terrain[point.y][point.x], 'w');
  for (let x = 30; x <= 50; x++) assert.equal(draft.terrain[18][x], 'w');
  assert.equal(source.terrain[4][4], 's');
  const undone = history.undo(draft);
  assert.deepEqual(undone, source);
  assert.equal(history.canUndo, false);
  assert.deepEqual(history.redo(undone), draft);
  const wide = paintStroke(source, { x: 0, y: 0 }, { x: 0, y: 0 }, 'g', 5);
  assert.equal(wide.terrain[2].slice(0, 3), 'ggg');
  assert.equal(wide.terrain[3][0], 's');
  assert.equal(decodeDraft(JSON.stringify({ ...draft, name: '' })).name, '');
  assert.throws(() => decodeDraft('{bad'));
});

void test('live metadata is part of the exported model before blur, painting, save or play', async () => {
  const { updateMetadata, paintStroke, EditorHistory } =
    await import('../src/client/ui/map-editor-model.js');
  const { encodeMap } = await import('../src/game/index.js');
  const history = new EditorHistory();
  history.checkpoint(DEFAULT_MAP);
  let draft = updateMetadata(DEFAULT_MAP, {
    name: 'Saffron Crossing',
    author: 'Student demo',
    description: 'Live edit',
  });
  assert.equal(JSON.parse(encodeMap(draft)).name, 'Saffron Crossing');
  draft = paintStroke(draft, { x: 4, y: 4 }, { x: 8, y: 8 }, 'g', 1);
  assert.equal(JSON.parse(encodeMap(draft)).author, 'Student demo');
  assert.equal(
    updateMetadata(draft, {
      name: draft.name,
      author: draft.author,
      description: draft.description,
    }),
    draft,
  );
  assert.equal(history.undo(draft).name, DEFAULT_MAP.name);
});
