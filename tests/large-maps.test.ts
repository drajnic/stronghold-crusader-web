import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SMALL_MAP,
  MEDIUM_MAP,
  LARGE_MAP,
  BUILTIN_MAPS,
  mapSizeLabel,
  MAX_BUILDINGS,
  MAX_UNITS,
  place,
  createGame,
  validateMap,
  parseMap,
  encodeMap,
  decodeMap,
  serialize,
  deserialize,
  canPlace,
  command,
  pathfind,
  passable,
  applyAction,
} from '../src/game/index.js';
import { addBuilding, addUnit } from '../src/game/entities.js';
import { buildingAt } from '../src/game/map.js';
import { staticPositionClear } from '../src/game/spatial.js';

void test('all modes use the Small basin and unsupported map dimensions are rejected', () => {
  assert.deepEqual(validateMap(SMALL_MAP), { errors: [], warnings: [] });
  for (const mode of ['skirmish', 'sandbox', 'survival', 'multiplayer', 'campaign'] as const) {
    const s = createGame({ mode });
    assert.equal(s.map.width, 128);
    assert.ok(s.buildings.some((b) => b.type === 'farm'));
    assert.doesNotThrow(() => deserialize(serialize(s)));
  }
  assert.deepEqual(decodeMap(encodeMap(SMALL_MAP)), SMALL_MAP);
  for (const change of [
    { width: 64, height: 64 },
    { width: 96, height: 96 },
    { width: 128, height: 64 },
    { version: 1 },
    { terrain: SMALL_MAP.terrain.slice(1) },
  ])
    assert.throws(() => parseMap({ ...SMALL_MAP, ...change }));
});

void test('placement, collision, commands, rally and save validation use the actual map bounds', () => {
  const s = createGame({ mode: 'sandbox' });
  s.buildings = [];
  s.units = [];
  addBuilding(s, 'keep', 24, 94, 'player');
  const b = addBuilding(s, 'wall', 85, 85, 'player');
  assert.equal(buildingAt(s, 85, 85), b);
  assert.equal(buildingAt(s, -43, 86), undefined);
  assert.equal(buildingAt(s, 128, 5), undefined);
  assert.equal(passable(s, 85, 85), false);
  assert.equal(staticPositionClear(s, { x: 85.5, y: 85.5 }, 0.23), false);
  assert.equal(canPlace(s, 'wall', 90, 90).ok, true);
  assert.equal(canPlace(s, 'wall', 127, 90).ok, false);
  const u = addUnit(s, 'spearman', 'player', 80.5, 80.5);
  assert.equal(command(s, [u.id], 112, 112).ok, true);
  assert.ok(u.path.at(-1)!.x > 100);
  const barracks = addBuilding(s, 'barracks', 88, 88, 'player');
  assert.equal(
    applyAction(s, { type: 'rally', id: barracks.id, point: { x: 110, y: 110 } }).ok,
    true,
  );
  const saved = serialize(s);
  assert.equal(deserialize(saved).units[0].goal!.x, u.goal!.x);
  const bad = JSON.parse(saved);
  bad.units[0].x = 127;
  assert.throws(() => deserialize(JSON.stringify(bad)));
  assert.equal(command(s, [u.id], 128, 90).ok, false);
  assert.equal(canPlace(s, 'wall', 128, 90).ok, false);
  assert.equal(
    applyAction(s, { type: 'rally', id: barracks.id, point: { x: 128, y: 110 } }).ok,
    false,
  );
});

void test('bounded path search reaches the far end of a 128-cell maze', () => {
  const rows = Array.from({ length: 128 }, () => Array<string>(128).fill('s'));
  for (let x = 10; x < 120; x += 10)
    for (let y = 1; y < 127; y++) if (y !== (x % 20 ? 125 : 2)) rows[y][x] = 'w';
  const map = parseMap({ ...SMALL_MAP, terrain: rows.map((row) => row.join('')) });
  const s = createGame({ mode: 'sandbox' });
  s.map = map;
  s.units = [];
  s.buildings = [];
  const path = pathfind(s, { x: 2.5, y: 2.5 }, { x: 124.5, y: 124.5 });
  assert.deepEqual(path.at(-1), { x: 124.5, y: 124.5 });
  assert.ok(path.length > 1000);
});

void test('formation orders reject disconnected destinations with bounded terrain work', () => {
  const s = createGame({ mode: 'sandbox' });
  const rows = Array.from({ length: 128 }, () =>
    Array.from({ length: 128 }, (_, x) => (x === 64 ? 'w' : 's')).join(''),
  );
  s.map = parseMap({ ...SMALL_MAP, terrain: rows });
  s.buildings = [];
  s.units = [];
  for (let i = 0; i < MAX_UNITS; i++)
    addUnit(s, 'spearman', 'player', 5.5 + (i % 16), 5.5 + Math.floor(i / 16));
  let terrainReads = 0;
  s.map = {
    ...s.map,
    terrain: new Proxy(rows, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) terrainReads++;
        return Reflect.get(target, key, receiver) as unknown;
      },
    }),
  };
  assert.equal(
    command(
      s,
      s.units.map((u) => u.id),
      100,
      100,
    ).ok,
    true,
  );
  assert.ok(s.units.every((u) => u.goal === null && u.path.length === 0));
  // One connectivity flood plus bounded local candidate checks; repeated A*
  // over all 625 candidates per soldier would read millions of terrain rows.
  assert.ok(terrainReads < s.map.width * s.map.height * 4, `${terrainReads} terrain reads`);
});

void test('the shared building cap allows the final legal build and preserves saveability', () => {
  const s = createGame({ mode: 'sandbox' });
  s.buildings = s.buildings.filter((b) => b.type === 'keep');
  s.units = [];
  for (let y = 1; s.buildings.length < MAX_BUILDINGS - 1; y++)
    for (let x = 1; x < 127 && s.buildings.length < MAX_BUILDINGS - 1; x++)
      addBuilding(s, 'wall', x, y, 'player');
  assert.equal(place(s, 'wall', 30, 94).ok, true);
  assert.equal(s.buildings.length, MAX_BUILDINGS);
  assert.equal(deserialize(serialize(s)).buildings.length, MAX_BUILDINGS);
  const before = { ...s.resources };
  const rejected = place(s, 'wall', 31, 94);
  assert.equal(rejected.ok, false);
  assert.match(rejected.reason!, /building limit/);
  assert.deepEqual(s.resources, before);
  assert.equal(s.buildings.length, MAX_BUILDINGS);
});

void test('all three pre-generated sizes validate, start with real economies and save exactly', () => {
  for (const map of BUILTIN_MAPS) {
    assert.deepEqual(validateMap(map), { errors: [], warnings: [] });
    assert.deepEqual(decodeMap(encodeMap(map)), map);
    const s = createGame({ map, mode: 'multiplayer' });
    for (const team of ['player', 'player2', 'enemy'] as const)
      for (const type of ['keep', 'farm', 'quarry', 'lumber'])
        assert.ok(s.buildings.some((b) => b.team === team && b.type === type));
    const restored = deserialize(serialize(s));
    assert.deepEqual(restored.map, map);
    assert.equal(serialize(restored), serialize(s));
  }
  assert.equal(mapSizeLabel(SMALL_MAP.width), 'Small (128 × 128)');
  assert.equal(mapSizeLabel(MEDIUM_MAP.width), 'Medium (256 × 256)');
  assert.equal(mapSizeLabel(LARGE_MAP.width), 'Large (512 × 512)');
});

void test('512-cell borders, actions, saved entities and long paths use the full battlefield', () => {
  const s = createGame({ map: LARGE_MAP, mode: 'sandbox' });
  s.buildings = [];
  s.units = [];
  const keep = addBuilding(s, 'keep', 480, 480, 'player');
  const u = addUnit(s, 'spearman', 'player', 490.5, 490.5);
  assert.equal(canPlace(s, 'wall', 495, 480).ok, true);
  assert.equal(canPlace(s, 'wall', 511, 495).ok, false);
  assert.equal(buildingAt(s, 512, 5), undefined);
  assert.equal(command(s, [u.id], 500, 500).ok, true);
  assert.ok(u.path.at(-1)!.x > 499);
  assert.equal(command(s, [u.id], 511, 500).ok, false);
  const barracks = addBuilding(s, 'barracks', 475, 480, 'player');
  assert.equal(
    applyAction(s, { type: 'rally', id: barracks.id, point: { x: 500, y: 500 } }).ok,
    true,
  );
  assert.equal(deserialize(serialize(s)).buildings.find((b) => b.id === keep.id)!.x, 480);
  const bad = JSON.parse(serialize(s));
  bad.units[0].x = 511;
  assert.throws(() => deserialize(JSON.stringify(bad)));
  const rows = Array.from({ length: 512 }, () => 's'.repeat(512));
  s.map = parseMap({ ...LARGE_MAP, terrain: rows });
  s.units = [];
  s.buildings = [];
  const route = pathfind(s, { x: 2.5, y: 2.5 }, { x: 509.5, y: 509.5 });
  assert.deepEqual(route.at(-1), { x: 509.5, y: 509.5 });
  assert.equal(route.length, 1014);
});
