import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SMALL_MAP,
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

const draft = () => JSON.parse(encodeMap(SMALL_MAP));
void test('map format round trips and rejects unsupported, malformed and hostile inputs', () => {
  assert.deepEqual(decodeMap(encodeMap(SMALL_MAP)), SMALL_MAP);
  for (const edit of [
    (m: ReturnType<typeof draft>) => (m.version = 3),
    (m: ReturnType<typeof draft>) => (m.terrain[0] = 's'.repeat(127)),
    (m: ReturnType<typeof draft>) => (m.spawns.player.x = 3.5),
    (m: ReturnType<typeof draft>) => (m.raid.x = Infinity),
    (m: ReturnType<typeof draft>) => (m.name = 'x'.repeat(81)),
  ]) {
    const m = draft();
    edit(m);
    assert.throws(() => parseMap(m));
  }
  assert.throws(() => decodeMap(' '.repeat(327681)));
});
void test('the Small default map remains ready to play', () => {
  assert.deepEqual(validateMap(SMALL_MAP).errors, []);
});
void test('draft validation diagnoses unsafe camps and disconnected land without forbidding drafts', () => {
  const m = draft();
  m.spawns.player.x = 1;
  assert.doesNotThrow(() => parseMap(m));
  assert.ok(validateMap(parseMap(m)).errors.length);
  assert.throws(() => createGame({ map: parseMap(m) }));
  const split = draft();
  split.terrain = Array.from({ length: 128 }, () => 's'.repeat(64) + 'w' + 's'.repeat(63));
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
    b = createGame({ map: SMALL_MAP });
  assert.equal(terrain(10, 10, a.map), 'water');
  assert.equal(terrain(10, 10, b.map), 'sand');
  assert.equal(passable(a, 10, 10), false);
  assert.equal(passable(b, 10, 10), true);
  const raw = serialize(a);
  m.terrain[10] = 's'.repeat(128);
  assert.equal(terrain(10, 10, deserialize(raw).map), 'water');
  assert.equal(JSON.parse(raw).version, 3);
  assert.ok(Object.isFrozen(a.map));
  assert.ok(Object.isFrozen(a.map.spawns.player));
  assert.ok(Object.isFrozen(a.map.terrain));
});
void test('legacy saves and 64 tile maps are rejected without conversion', () => {
  const raw = JSON.parse(serialize(createGame()));
  raw.version = 2;
  delete raw.map;
  assert.throws(() => deserialize(JSON.stringify(raw)), /Unsupported save format/);
  for (const version of [1, 2]) {
    const map = {
      ...draft(),
      version,
      width: 64,
      height: 64,
      terrain: Array.from({ length: 64 }, () => 's'.repeat(64)),
    };
    assert.throws(() => parseMap(map), /64 × 64 maps are no longer supported/);
    assert.throws(
      () => deserialize(JSON.stringify({ ...raw, version: 3, map })),
      /Unsupported map format/,
    );
  }
  assert.throws(() => parseMap({ ...draft(), version: 1 }), /Unsupported map format/);
});

void test('custom camp anchors translate buildings and remain saveable in every supported mode', () => {
  const m = draft();
  m.name = 'Moved camps';
  m.terrain = Array.from({ length: 128 }, () => 's'.repeat(128));
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

void test('preset setup depends on map gameplay data across imports, metadata changes and hosting', () => {
  const original = createGame({ map: SMALL_MAP });
  for (const map of [
    parseMap(JSON.parse(JSON.stringify(SMALL_MAP))),
    decodeMap(encodeMap(SMALL_MAP)),
    parseMap({ ...SMALL_MAP, name: 'Renamed valley' }),
  ]) {
    assert.deepEqual(createGame({ map }).buildings, original.buildings);
    assert.deepEqual(createGame({ map }).units, original.units);
    const multi = createGame({ mode: 'multiplayer', map });
    assert.deepEqual(
      multi.buildings,
      createGame({ mode: 'multiplayer', map: SMALL_MAP }).buildings,
    );
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
void test('SHA-256 fingerprint matches the canonical frozen vector and independent UTF-8 digest', async () => {
  const { createHash } = await import('node:crypto');
  assert.equal(
    mapFingerprint(SMALL_MAP),
    'f39f9986192cbd3b8628570832900d0bda197b7877b9b9b30373dab3d0f39bd4',
  );
  const map = parseMap({ ...draft(), description: 'Žlté údolie\nDruhý riadok\tpoznámka' });
  assert.equal(
    mapFingerprint(map),
    createHash('sha256')
      .update(JSON.stringify(parseMap(map)), 'utf8')
      .digest('hex'),
  );
  assert.equal(mapFingerprint(map), mapFingerprint(parseMap(JSON.parse(JSON.stringify(map)))));
  assert.notEqual(mapFingerprint(map), mapFingerprint(SMALL_MAP));
  assert.equal(decodeMap(encodeMap(map)).description, map.description);
  assert.throws(() => parseMap({ ...draft(), name: 'A\nB' }));
  assert.throws(() => parseMap({ ...draft(), author: 'A\tB' }));
});
