import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MAP,
  mapFingerprint,
  decodeMap,
  encodeMap,
  parseMap,
  validateMap,
  createGame,
  serialize,
  deserialize,
  terrain,
  passable,
} from '../src/game/index.js';

const draft = () => JSON.parse(encodeMap(DEFAULT_MAP));
void test('map format round trips and rejects unsupported, malformed and hostile inputs', () => {
  assert.deepEqual(decodeMap(encodeMap(DEFAULT_MAP)), DEFAULT_MAP);
  for (const edit of [
    (m: ReturnType<typeof draft>) => (m.version = 2),
    (m: ReturnType<typeof draft>) => (m.terrain[0] = 's'.repeat(63)),
    (m: ReturnType<typeof draft>) => (m.spawns.player.x = 3.5),
    (m: ReturnType<typeof draft>) => (m.raid.x = Infinity),
    (m: ReturnType<typeof draft>) => (m.name = 'x'.repeat(81)),
  ]) {
    const m = draft();
    edit(m);
    assert.throws(() => parseMap(m));
  }
  assert.throws(() => decodeMap(' '.repeat(16001)));
});
void test('draft validation diagnoses unsafe camps and disconnected land without forbidding drafts', () => {
  const m = draft();
  m.spawns.player.x = 1;
  assert.doesNotThrow(() => parseMap(m));
  assert.ok(validateMap(parseMap(m)).errors.length);
  assert.throws(() => createGame({ map: parseMap(m) }));
  const split = draft();
  split.terrain = Array.from({ length: 64 }, () => 's'.repeat(30) + 'w' + 's'.repeat(33));
  assert.ok(validateMap(parseMap(split)).errors.some((e) => e.includes('disconnected')));
  const overlap = draft();
  overlap.spawns.enemy = overlap.spawns.player;
  assert.ok(validateMap(parseMap(overlap)).errors.some((e) => e.includes('overlap')));
});
void test('maps are isolated, frozen, and embedded in save version 3', () => {
  const m = draft();
  m.name = 'Custom valley';
  m.terrain[10] = m.terrain[10].substring(0, 10) + 'w' + m.terrain[10].substring(11);
  const a = createGame({ map: parseMap(m) }),
    b = createGame();
  assert.equal(terrain(10, 10, a.map), 'water');
  assert.equal(terrain(10, 10, b.map), 'sand');
  assert.equal(passable(a, 10, 10), false);
  assert.equal(passable(b, 10, 10), true);
  const raw = serialize(a);
  m.terrain[10] = 's'.repeat(64);
  assert.equal(terrain(10, 10, deserialize(raw).map), 'water');
  assert.equal(JSON.parse(raw).version, 3);
  assert.ok(Object.isFrozen(a.map));
  assert.ok(Object.isFrozen(a.map.spawns.player));
  assert.ok(Object.isFrozen(a.map.terrain));
});
void test('legacy version 2 saves acquire the frozen original terrain', () => {
  const raw = JSON.parse(serialize(createGame()));
  raw.version = 2;
  delete raw.map;
  const restored = deserialize(JSON.stringify(raw));
  assert.equal(restored.map, DEFAULT_MAP);
  assert.equal(restored.version, 3);
  assert.equal(serialize(restored), serialize(deserialize(serialize(createGame()))));
});

void test('custom camp anchors translate buildings and remain saveable in every supported mode', () => {
  const m = draft();
  m.name = 'Moved camps';
  m.terrain = Array.from({ length: 64 }, () => 's'.repeat(64));
  m.spawns.player = { x: 18, y: 44 };
  m.spawns.player2 = { x: 44, y: 44 };
  m.spawns.enemy = { x: 44, y: 15 };
  for (const mode of ['skirmish', 'survival', 'sandbox', 'campaign', 'multiplayer'] as const) {
    const s = createGame({ mode, map: parseMap(m) });
    const keep = s.buildings.find((b) => b.team === 'player' && b.type === 'keep');
    assert.equal(keep?.x, 18);
    assert.equal(keep?.y, 44);
    assert.equal(s.buildings.filter((b) => b.team === 'player').length, 7);
    assert.equal(deserialize(serialize(s)).map.name, 'Moved camps');
  }
});

void test('classic setup depends on map gameplay data across imports, metadata changes and hosting', () => {
  const original = createGame();
  for (const map of [
    parseMap(JSON.parse(JSON.stringify(DEFAULT_MAP))),
    decodeMap(encodeMap(DEFAULT_MAP)),
    parseMap({ ...DEFAULT_MAP, name: 'Renamed valley' }),
  ]) {
    assert.deepEqual(createGame({ map }).buildings, original.buildings);
    assert.deepEqual(createGame({ map }).units, original.units);
    const multi = createGame({ mode: 'multiplayer', map });
    assert.deepEqual(multi.buildings, createGame({ mode: 'multiplayer' }).buildings);
  }
});
void test('map fields and metadata reject hidden or unsupported data', () => {
  for (const map of [
    { ...draft(), unexpected: true },
    { ...draft(), name: 'Hidden\u0000name' },
    { ...draft(), spawns: { ...draft().spawns, visitor: { x: 1, y: 1 } } },
    { ...draft(), raid: { x: 4, y: 5, z: 0 } },
  ])
    assert.throws(() => parseMap(map));
});
void test('readiness checks the actual camps and rejects a raid inside a camp', () => {
  const m = draft();
  m.raid = { ...m.spawns.player };
  assert.ok(validateMap(parseMap(m)).errors.some((e) => e.includes('Raid entry')));
});
void test('legacy migration tiles match a frozen terrain fixture', async () => {
  const { createHash } = await import('node:crypto');
  assert.equal(
    createHash('sha256').update(DEFAULT_MAP.terrain.join('\n')).digest('hex'),
    '1e038197fe547fd913b74dfc09ec8a7e1a25775d0a49554057a3c50db267e367',
  );
});

void test('SHA-256 fingerprint matches the canonical frozen vector and independent UTF-8 digest', async () => {
  const { createHash } = await import('node:crypto');
  assert.equal(
    mapFingerprint(DEFAULT_MAP),
    '4830d2319632b8e328776a9495ce89a6af9d63a40772375f10f32e231bcdf799',
  );
  const map = parseMap({ ...draft(), description: 'Žlté údolie\nDruhý riadok\tpoznámka' });
  assert.equal(
    mapFingerprint(map),
    createHash('sha256')
      .update(JSON.stringify(parseMap(map)), 'utf8')
      .digest('hex'),
  );
  assert.equal(mapFingerprint(map), mapFingerprint(parseMap(JSON.parse(JSON.stringify(map)))));
  assert.notEqual(mapFingerprint(map), mapFingerprint(DEFAULT_MAP));
  assert.equal(decodeMap(encodeMap(map)).description, map.description);
  assert.throws(() => parseMap({ ...draft(), name: 'A\nB' }));
  assert.throws(() => parseMap({ ...draft(), author: 'A\tB' }));
});
