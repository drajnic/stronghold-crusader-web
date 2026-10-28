import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { BUILTIN_MAP_DATA } from './builtin-map.js';
import type { Point } from './types.js';
import { TYPES } from './catalog.js';
export const TERRAIN_CODES = {
  s: 'sand',
  w: 'water',
  g: 'grass',
  t: 'trees',
  r: 'stone',
  i: 'iron',
  p: 'pitch',
} as const;
export interface MapDefinition {
  readonly version: 1;
  readonly width: 64;
  readonly height: 64;
  readonly name: string;
  readonly author: string;
  readonly description: string;
  readonly terrain: readonly string[];
  readonly spawns: Readonly<Record<'player' | 'player2' | 'enemy', Readonly<Point>>>;
  readonly raid: Readonly<Point>;
}
const teams = ['player', 'player2', 'enemy'] as const;
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Invalid map object.');
  return v as Record<string, unknown>;
}
function keys(v: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(v).some((key) => !allowed.includes(key))) throw Error('Unknown map field.');
}
function point(v: unknown): Readonly<Point> {
  const p = object(v);
  keys(p, ['x', 'y']);
  if (
    !Number.isSafeInteger(p.x) ||
    !Number.isSafeInteger(p.y) ||
    (p.x as number) < 1 ||
    (p.y as number) < 1 ||
    (p.x as number) > 62 ||
    (p.y as number) > 62
  )
    throw Error('Map anchors must be integer coordinates within 1–62.');
  return Object.freeze({ x: p.x as number, y: p.y as number });
}
const parsedMaps = new WeakSet<MapDefinition>();
export function parseMap(value: unknown): MapDefinition {
  const v = object(value);
  keys(v, [
    'version',
    'width',
    'height',
    'name',
    'author',
    'description',
    'terrain',
    'spawns',
    'raid',
  ]);
  if (v.version !== 1 || v.width !== 64 || v.height !== 64)
    throw Error('Map must use format version 1 and a 64 × 64 grid.');
  const text = (key: string, max: number) => {
    const t = v[key];
    if (
      typeof t !== 'string' ||
      t.length > max ||
      Array.from(t).some(
        (c) =>
          (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) &&
          !(key === 'description' && ['\n', '\r', '\t'].includes(c)),
      ) ||
      (key === 'name' && !t.trim())
    )
      throw Error(`Invalid map ${key}.`);
    return t;
  };
  if (
    !Array.isArray(v.terrain) ||
    v.terrain.length !== 64 ||
    v.terrain.some((r) => typeof r !== 'string' || !/^[swgtrip]{64}$/.test(r))
  )
    throw Error('Map terrain must contain 64 rows of 64 terrain codes (s,w,g,t,r,i,p).');
  const anchors = object(v.spawns);
  keys(anchors, teams);
  const map: MapDefinition = Object.freeze({
    version: 1,
    width: 64,
    height: 64,
    name: text('name', 80),
    author: text('author', 80),
    description: text('description', 500),
    terrain: Object.freeze([...v.terrain] as string[]),
    spawns: Object.freeze({
      player: point(anchors.player),
      player2: point(anchors.player2),
      enemy: point(anchors.enemy),
    }),
    raid: point(v.raid),
  });
  parsedMaps.add(map);
  return map;
}
export const MAX_MAP_BYTES = 16000;
export function decodeMap(raw: string): MapDefinition {
  if (new TextEncoder().encode(raw).byteLength > MAX_MAP_BYTES)
    throw Error('Map file is too large.');
  return parseMap(JSON.parse(raw));
}
export function encodeMap(map: MapDefinition): string {
  return JSON.stringify(parseMap(map), null, 2);
}
const fingerprints = new WeakMap<MapDefinition, string>();
export function mapFingerprint(map: MapDefinition): string {
  const cached = fingerprints.get(map);
  if (cached) return cached;
  const canonical = JSON.stringify(parseMap(map));
  const result = bytesToHex(sha256(new TextEncoder().encode(canonical)));
  if (parsedMaps.has(map)) fingerprints.set(map, result);
  return result;
}
export const STARTER_BUILDINGS = [
  ['keep', 0, 0],
  ['house', -3, 1],
  ['house', 4, 1],
  ['barracks', -3, -3],
  ['market', 4, -3],
  ['stockpile', 1, 4],
  ['granary', -3, 4],
] as const;
export function validateMap(input: MapDefinition): { errors: string[]; warnings: string[] } {
  let map: MapDefinition;
  try {
    map = parseMap(input);
  } catch (e) {
    return { errors: [(e as Error).message], warnings: [] };
  }
  const errors: string[] = [],
    warnings: string[] = [],
    occupied = new Set<string>();
  const walk = (x: number, y: number) =>
    x >= 1 && y >= 1 && x <= 62 && y <= 62 && !'wtri'.includes(map.terrain[y][x]);
  for (const team of teams) {
    const a = map.spawns[team];
    for (const [type, dx, dy] of STARTER_BUILDINGS)
      for (let y = 0; y < TYPES[type].size; y++)
        for (let x = 0; x < TYPES[type].size; x++) {
          const px = a.x + dx + x,
            py = a.y + dy + y,
            key = `${px},${py}`;
          if (px < 1 || py < 1 || px > 62 || py > 62 || map.terrain[py]?.[px] === 'w')
            errors.push(`${team} starting camp clips the border or water.`);
          if (occupied.has(key)) errors.push('Starting camps overlap.');
          occupied.add(key);
        }
    for (const [dx, dy] of [
      [0, 3],
      [2, 3],
      [-1, 0],
      [3, 0],
    ])
      if (!walk(a.x + dx, a.y + dy)) errors.push(`${team} starting soldiers need open land.`);
  }
  for (let i = 0; i < teams.length; i++) {
    const team = teams[i],
      a = map.spawns[team];
    for (const other of teams.slice(i + 1)) {
      const b = map.spawns[other];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 14)
        errors.push('Starting camps must be at least 14 tiles apart.');
    }
    for (const [dx, dy] of [
      [0, 3],
      [2, 3],
      [-1, 0],
      [3, 0],
    ])
      if (occupied.has(`${a.x + dx},${a.y + dy}`))
        errors.push(`${team} starting soldiers overlap a camp.`);
    for (const code of ['g', 't', 'r']) {
      let nearby = false;
      for (let y = Math.max(1, a.y - 18); y <= Math.min(62, a.y + 18); y++)
        for (let x = Math.max(1, a.x - 18); x <= Math.min(62, a.x + 18); x++)
          if (map.terrain[y][x] === code && Math.hypot(x - a.x, y - a.y) <= 18) nearby = true;
      if (!nearby)
        warnings.push(
          `${team} has no nearby ${TERRAIN_CODES[code as keyof typeof TERRAIN_CODES]}.`,
        );
    }
  }
  const open = (x: number, y: number) => walk(x, y) && !occupied.has(`${x},${y}`);
  if (!open(map.raid.x, map.raid.y)) errors.push('Raid entry needs open land.');
  const start = map.raid,
    seen = new Set<string>(),
    queue = [start];
  if (open(start.x, start.y)) seen.add(`${start.x},${start.y}`);
  for (let i = 0; i < queue.length; i++)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = queue[i].x + dx,
        y = queue[i].y + dy,
        key = `${x},${y}`;
      if (open(x, y) && !seen.has(key)) {
        seen.add(key);
        queue.push({ x, y });
      }
    }
  for (const team of teams) {
    const a = map.spawns[team];
    if (
      [
        [0, 3],
        [2, 3],
        [-1, 0],
        [3, 0],
      ].some(([dx, dy]) => !seen.has(`${a.x + dx},${a.y + dy}`))
    )
      errors.push(`${team} camp is disconnected from the raid entry and other camps.`);
  }
  for (const code of ['g', 't', 'r', 'i', 'p'])
    if (!map.terrain.some((row) => row.includes(code)))
      warnings.push(`Map has no ${TERRAIN_CODES[code as keyof typeof TERRAIN_CODES]} resources.`);
  return { errors: [...new Set(errors)], warnings };
}
export const DEFAULT_MAP = parseMap(BUILTIN_MAP_DATA);
/** Gameplay equality intentionally excludes presentation-only metadata. */
export function isClassicMap(map: MapDefinition): boolean {
  return (
    map.terrain.every((row, i) => row === DEFAULT_MAP.terrain[i]) &&
    teams.every(
      (team) =>
        map.spawns[team].x === DEFAULT_MAP.spawns[team].x &&
        map.spawns[team].y === DEFAULT_MAP.spawns[team].y,
    ) &&
    map.raid.x === DEFAULT_MAP.raid.x &&
    map.raid.y === DEFAULT_MAP.raid.y
  );
}
