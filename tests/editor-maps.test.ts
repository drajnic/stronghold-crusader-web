import assert from 'node:assert/strict';
import test from 'node:test';
import { SMALL_MAP, MEDIUM_MAP, parseMap } from '../src/game/index.js';
import { DrawingSurface } from '../src/client/render/drawing.js';
import {
  deleteMap,
  deleteUnsupportedMaps,
  readMaps,
  saveMapCopy,
} from '../src/client/ui/map-library.js';

void test('map terrain cache changes with content but survives cloned network snapshots', () => {
  const canvas = { getContext: () => ({}) } as unknown as HTMLCanvasElement;
  const surface = new DrawingSurface(canvas);
  const cache = {} as HTMLCanvasElement;
  surface.terrainChunks.set('0:0', cache);
  assert.equal(surface.setMap(parseMap(JSON.parse(JSON.stringify(SMALL_MAP)))), false);
  assert.equal(surface.terrainChunks.get('0:0'), cache);
  const map = parseMap({ ...SMALL_MAP, terrain: Array(128).fill('w'.repeat(128)) });
  assert.equal(surface.setMap(map), true);
  assert.equal(surface.terrainChunks.size, 0);
  assert.ok(surface.tiles.every((tile) => tile.t === 'water'));
  surface.terrainChunks.set('0:0', cache);
  assert.equal(surface.setMap(parseMap(JSON.parse(JSON.stringify(map)))), false);
  assert.equal(surface.terrainChunks.get('0:0'), cache);
  assert.equal(surface.setMap(SMALL_MAP), true);
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
    assert.throws(() => saveMapCopy(SMALL_MAP), /preserved/);
    assert.equal(stored, '{broken');
    assert.throws(() => deleteMap('anything'), /preserved/);
    assert.equal(stored, '{broken');
    stored = '[]';
    saveMapCopy(SMALL_MAP);
    saveMapCopy({ ...SMALL_MAP, terrain: Array(128).fill('w'.repeat(128)) });
    assert.equal(readMaps().length, 2);
    const id = readMaps()[0].id;
    deleteMap(id);
    assert.equal(readMaps().length, 1);
    assert.equal(readMaps()[0].map.terrain[0], 'w'.repeat(128));
    const supported = JSON.parse(stored) as unknown[];
    stored = JSON.stringify([
      ...supported,
      { id: 'obsolete', map: { ...SMALL_MAP, version: 1, width: 64, height: 64 } },
    ]);
    assert.throws(() => saveMapCopy(SMALL_MAP), /preserved/);
    assert.equal(deleteUnsupportedMaps(), 1);
    assert.equal(deleteUnsupportedMaps(), 0);
    assert.deepEqual(JSON.parse(stored), supported);
    saveMapCopy(SMALL_MAP);
    assert.equal(readMaps().length, 2);
    deleteMap(readMaps()[1].id);
    full = true;
    assert.throws(() => saveMapCopy(SMALL_MAP), /storage is unavailable or full/);
    assert.equal(readMaps().length, 1);
    stored = JSON.stringify([null, { id: 'bad', map: {} }, { id: 'good', map: SMALL_MAP }]);
    assert.equal(readMaps().length, 1);
    full = false;
    const corruptEntries = stored;
    assert.throws(() => saveMapCopy(SMALL_MAP), /preserved/);
    assert.throws(() => deleteMap('good'), /preserved/);
    assert.equal(stored, corruptEntries);
    assert.equal(deleteUnsupportedMaps(), 0);
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
  const cachedPixels: Uint8ClampedArray[] = [];
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
        const paint = {
          createImageData(width: number, height: number) {
            assert.equal(width, 128);
            assert.equal(height, 128);
            return { width, height, data: new Uint8ClampedArray(width * height * 4) };
          },
          putImageData(pixels: ImageData, x: number, y: number) {
            assert.deepEqual([x, y], [0, 0]);
            cachedPixels.push(pixels.data.slice());
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
    assert.equal(cachedPixels.length, 1);
    const changed = {
      ...state,
      map: parseMap({ ...MEDIUM_MAP, terrain: Array(256).fill('w'.repeat(256)) }),
    };
    renderer.minimap(canvas, changed);
    assert.notEqual(drawn.at(-1), original);
    const water = cachedPixels.at(-1)!;
    for (let offset = 0; offset < water.length; offset += 4)
      assert.deepEqual([...water.slice(offset, offset + 4)], [67, 143, 148, 255]);
    renderer.minimap(canvas, state);
    assert.notEqual(drawn.at(-1), drawn.at(-2));
    assert.equal(cachedPixels.length, 3);
    assert.deepEqual(cachedPixels.at(-1), cachedPixels[0]);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

void test('fast paint strokes have no gaps, form one undo step and preserve library source', async () => {
  const { paintStroke, strokeCells, EditorHistory, decodeDraft } =
    await import('../src/client/ui/map-editor-model.js');
  const source = parseMap({ ...SMALL_MAP, terrain: Array(128).fill('s'.repeat(128)) });
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
  assert.throws(
    () => decodeDraft(JSON.stringify({ ...SMALL_MAP, width: 64, height: 64 })),
    /Unsupported/,
  );
});

void test('live metadata is part of the exported model before blur, painting, save or play', async () => {
  const { updateMetadata, paintStroke, EditorHistory } =
    await import('../src/client/ui/map-editor-model.js');
  const { encodeMap } = await import('../src/game/index.js');
  const history = new EditorHistory();
  history.checkpoint(SMALL_MAP);
  let draft = updateMetadata(SMALL_MAP, {
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
  assert.equal(history.undo(draft).name, SMALL_MAP.name);
});

void test('128 map strokes and anchors reach far edges and preserve version through recovery', async () => {
  const { SMALL_MAP } = await import('../src/game/index.js');
  const { paintStroke, decodeDraft } = await import('../src/client/ui/map-editor-model.js');
  const source = { ...SMALL_MAP, terrain: Array(128).fill('s'.repeat(128)) };
  let draft = paintStroke(source, { x: 90, y: 127 }, { x: 127, y: 127 }, 'w', 3);
  assert.equal(draft.terrain[127].slice(89), 'w'.repeat(39));
  assert.equal(draft.terrain[126][127], 'w');
  assert.equal(draft.terrain[125][127], 's');
  draft = paintStroke(draft, { x: 0, y: 0 }, { x: 120, y: 119 }, 'raid', 1);
  assert.deepEqual(draft.raid, { x: 120, y: 119 });
  assert.equal(decodeDraft(JSON.stringify(draft)).version, 2);
  assert.equal(decodeDraft(JSON.stringify(draft)).terrain[127][127], 'w');
  const canvas = { getContext: () => ({}) } as unknown as HTMLCanvasElement;
  const surface = new DrawingSurface(canvas);
  surface.setMap(source);
  assert.equal(surface.tiles.length, 128 * 128);
  assert.deepEqual(surface.tiles.at(-1), { x: 127, y: 127, t: 'sand', h: surface.tiles.at(-1)!.h });
  surface.setMap(MEDIUM_MAP);
  assert.equal(surface.tiles.length, 256 * 256);
});

void test('512 editor strokes affect only touched rows, preserve source, and undo/recover far anchors', async () => {
  const { LARGE_MAP } = await import('../src/game/index.js');
  const { paintStroke, EditorHistory, decodeDraft } =
    await import('../src/client/ui/map-editor-model.js');
  const source = { ...LARGE_MAP, terrain: Array(512).fill('s'.repeat(512)) };
  const history = new EditorHistory();
  history.checkpoint(source);
  let draft = paintStroke(source, { x: 500, y: 510 }, { x: 511, y: 511 }, 'w', 3);
  assert.equal(draft.terrain[511][511], 'w');
  assert.equal(draft.terrain[508], source.terrain[508]);
  assert.equal(source.terrain[511][511], 's');
  draft = paintStroke(draft, { x: 0, y: 0 }, { x: 510, y: 509 }, 'raid', 1);
  assert.deepEqual(draft.raid, { x: 510, y: 509 });
  assert.equal(decodeDraft(JSON.stringify(draft)).terrain[511][511], 'w');
  assert.deepEqual(history.undo(draft), source);
  assert.deepEqual(history.redo(source), draft);
});

void test('map selectors expose three named built-ins, preserve selection, and reject legacy library maps', async () => {
  const { BUILTIN_MAPS } = await import('../src/game/index.js');
  const { getSelectedMap, refreshMapSelectors } = await import('../src/client/ui/map-library.js');
  const descriptors = new Map(
    ['document', 'Option', 'localStorage'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  class FakeOption {
    constructor(
      public text: string,
      public value: string,
    ) {}
  }
  const select = {
    value: 'builtin-512',
    options: [] as FakeOption[],
    replaceChildren(...options: FakeOption[]) {
      this.options = options;
      this.value = options[0]?.value || '';
    },
    add(option: FakeOption) {
      this.options.push(option);
    },
  };
  Object.defineProperty(globalThis, 'Option', { configurable: true, value: FakeOption });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { getElementById: () => select },
  });
  let stored = JSON.stringify([{ id: 'supported', map: SMALL_MAP }]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => stored },
  });
  try {
    refreshMapSelectors();
    assert.equal(select.value, 'builtin-512');
    assert.deepEqual(
      select.options.slice(0, 3).map((option) => option.text.split(' · ')[0]),
      ['Small (128 × 128)', 'Medium (256 × 256)', 'Large (512 × 512)'],
    );
    for (const map of BUILTIN_MAPS) {
      select.value = `builtin-${map.width}`;
      assert.equal(getSelectedMap('skirmish-map'), map);
    }
    select.value = 'supported';
    assert.equal(getSelectedMap('skirmish-map')?.width, 128);
    refreshMapSelectors();
    assert.equal(select.value, 'supported');
    stored = '[]';
    assert.throws(() => getSelectedMap('skirmish-map'), /selected map is unavailable/);
    stored = JSON.stringify([
      { id: 'supported', map: { ...SMALL_MAP, terrain: Array(128).fill('w'.repeat(128)) } },
    ]);
    assert.throws(() => getSelectedMap('skirmish-map'), /no longer playable/);
    stored = JSON.stringify([
      {
        id: 'supported',
        map: {
          ...SMALL_MAP,
          version: 1,
          width: 64,
          height: 64,
          terrain: Array(64).fill('s'.repeat(64)),
        },
      },
    ]);
    const legacyStorage = stored;
    refreshMapSelectors();
    assert.equal(select.value, 'supported');
    assert.throws(() => getSelectedMap('skirmish-map'), /64 × 64 maps are unsupported/);
    assert.deepEqual(readMaps(), []);
    assert.throws(() => saveMapCopy(SMALL_MAP), /unsupported.*preserved/);
    assert.throws(() => deleteMap('supported'), /preserved/);
    assert.equal(stored, legacyStorage);
    stored = '{corrupt';
    assert.throws(() => getSelectedMap('skirmish-map'), /selected map is unavailable/);
    select.value = 'builtin-1024';
    assert.throws(() => getSelectedMap('skirmish-map'), /selected map is unavailable/);
    select.value = 'builtin-512';
    assert.equal(getSelectedMap('skirmish-map'), BUILTIN_MAPS[2]);
    select.value = '';
    assert.throws(() => getSelectedMap('skirmish-map'), /No map is selected/);
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { getElementById: () => null },
    });
    assert.throws(() => getSelectedMap('missing-selector'), /No map is selected/);
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

void test('failed draft recovery protects raw storage through blur, navigation and edits until explicit replacement', async () => {
  const { EditorDraftStorage } = await import('../src/client/ui/map-editor-model.js');
  const original = JSON.stringify({ ...SMALL_MAP, width: 64, height: 64 });
  let stored = original;
  let full = false;
  const recovery = new EditorDraftStorage(
    () => stored,
    (raw) => {
      if (full) throw Error('quota');
      stored = raw;
    },
  );
  assert.throws(() => recovery.recover(), /Unsupported/);
  assert.equal(recovery.protectedDraft, true);
  // These are the same persistence calls made by blur, close and edit handlers.
  for (const raw of [JSON.stringify(SMALL_MAP), JSON.stringify({ ...SMALL_MAP, name: 'Edited' })]) {
    assert.equal(recovery.persist(raw), false);
    assert.equal(stored, original);
  }
  full = true;
  assert.throws(() => recovery.replace(JSON.stringify(SMALL_MAP)), /quota/);
  assert.equal(recovery.protectedDraft, true);
  assert.equal(stored, original);
  full = false;
  recovery.replace(JSON.stringify(SMALL_MAP));
  assert.equal(recovery.protectedDraft, false);
  assert.equal(recovery.persist(JSON.stringify(MEDIUM_MAP)), true);
  assert.equal(stored, JSON.stringify(MEDIUM_MAP));
});
