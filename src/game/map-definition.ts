import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import smallMapData from './maps/small.json';
import mediumMapData from './maps/medium.json';
import largeMapData from './maps/large.json';
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
export type MapSize = 128 | 256 | 512;
export function mapSizeLabel(size: MapSize): string {
  return `${({ 128: 'Small', 256: 'Medium', 512: 'Large' } as const)[size]} (${size} × ${size})`;
}
export interface MapDefinition {
  readonly version: 2;
  readonly width: MapSize;
  readonly height: MapSize;
  readonly name: string;
  readonly author: string;
  readonly description: string;
  readonly terrain: readonly string[];
  readonly spawns: Readonly<Record<'player' | 'player2' | 'enemy', Readonly<Point>>>;
  readonly raid: Readonly<Point>;
}
const teams = ['player', 'player2', 'enemy'] as const;
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Invalid map object.');
  return v as Record<string, unknown>;
}
function keys(v: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(v).some((key) => !allowed.includes(key))) throw Error('Unknown map field.');
}
function point(v: unknown, size: number): Readonly<Point> {
  const p = object(v);
  keys(p, ['x', 'y']);
  if (
    !Number.isSafeInteger(p.x) ||
    !Number.isSafeInteger(p.y) ||
    (p.x as number) < 1 ||
    (p.y as number) < 1 ||
    (p.x as number) > size - 2 ||
    (p.y as number) > size - 2
  )
    throw Error(`Map anchors must be integer coordinates within 1–${size - 2}.`);
  return Object.freeze({ x: p.x as number, y: p.y as number });
}
const parsedMaps = new WeakSet<MapDefinition>();
export function parseMap(value: unknown): MapDefinition {
  if (value && typeof value === 'object' && parsedMaps.has(value as MapDefinition))
    return value as MapDefinition;
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
  if (v.version !== 2 || ![128, 256, 512].includes(v.width as number) || v.height !== v.width)
    throw Error(
      'Unsupported map format. Use version 2 with a 128 × 128 (Small), 256 × 256 (Medium), or 512 × 512 (Large) grid. Legacy 64 × 64 maps are no longer supported.',
    );
  const size = v.width as MapSize;
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
    v.terrain.length !== size ||
    v.terrain.some((r) => typeof r !== 'string' || r.length !== size || !/^[swgtrip]+$/.test(r))
  )
    throw Error(`Map terrain must contain ${size} rows of ${size} terrain codes (s,w,g,t,r,i,p).`);
  const anchors = object(v.spawns);
  keys(anchors, teams);
  const map: MapDefinition = Object.freeze({
    version: 2,
    width: size,
    height: size,
    name: text('name', 80),
    author: text('author', 80),
    description: text('description', 500),
    terrain: Object.freeze([...v.terrain] as string[]),
    spawns: Object.freeze({
      player: point(anchors.player, size),
      player2: point(anchors.player2, size),
      enemy: point(anchors.enemy, size),
    }),
    raid: point(v.raid, size),
  });
  parsedMaps.add(map);
  return map;
}
export const MAX_MAP_SIZE = 512;
export const MAX_MAP_BYTES = 327680;
export const MAX_MAP_UPLOAD_BYTES = MAX_MAP_BYTES + 65536;
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
    occupied = new Uint8Array(map.width * map.height);
  const occupiedAt = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < map.width && y < map.height && occupied[y * map.width + x] !== 0;
  const walk = (x: number, y: number) =>
    x >= 1 &&
    y >= 1 &&
    x <= map.width - 2 &&
    y <= map.height - 2 &&
    !'wtri'.includes(map.terrain[y][x]);
  for (const team of teams) {
    const a = map.spawns[team];
    for (const [type, dx, dy] of STARTER_BUILDINGS)
      for (let y = 0; y < TYPES[type].size; y++)
        for (let x = 0; x < TYPES[type].size; x++) {
          const px = a.x + dx + x,
            py = a.y + dy + y,
            key = py * map.width + px;
          if (
            px < 1 ||
            py < 1 ||
            px > map.width - 2 ||
            py > map.height - 2 ||
            map.terrain[py]?.[px] === 'w'
          )
            errors.push(`${team} starting camp clips the border or water.`);
          if (occupiedAt(px, py)) errors.push('Starting camps overlap.');
          if (px >= 0 && py >= 0 && px < map.width && py < map.height) occupied[key] = 1;
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
      if (occupiedAt(a.x + dx, a.y + dy)) errors.push(`${team} starting soldiers overlap a camp.`);
    for (const code of ['g', 't', 'r']) {
      let nearby = false;
      for (let y = Math.max(1, a.y - 18); y <= Math.min(map.height - 2, a.y + 18); y++)
        for (let x = Math.max(1, a.x - 18); x <= Math.min(map.width - 2, a.x + 18); x++)
          if (map.terrain[y][x] === code && Math.hypot(x - a.x, y - a.y) <= 18) nearby = true;
      if (!nearby)
        warnings.push(
          `${team} has no nearby ${TERRAIN_CODES[code as keyof typeof TERRAIN_CODES]}.`,
        );
    }
  }
  const open = (x: number, y: number) => walk(x, y) && !occupied[y * map.width + x];
  if (!open(map.raid.x, map.raid.y)) errors.push('Raid entry needs open land.');
  const start = map.raid,
    seen = new Uint8Array(map.width * map.height),
    queue = new Int32Array(map.width * map.height);
  let head = 0,
    tail = 0;
  if (open(start.x, start.y)) {
    const key = start.y * map.width + start.x;
    seen[key] = 1;
    queue[tail++] = key;
  }
  while (head < tail) {
    const cell = queue[head++],
      cx = cell % map.width,
      cy = Math.floor(cell / map.width);
    for (const [dx, dy] of NEIGHBORS) {
      const x = cx + dx,
        y = cy + dy,
        key = y * map.width + x;
      if (!seen[key] && open(x, y)) {
        seen[key] = 1;
        queue[tail++] = key;
      }
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
      ].some(([dx, dy]) => !seen[(a.y + dy) * map.width + a.x + dx])
    )
      errors.push(`${team} camp is disconnected from the raid entry and other camps.`);
  }
  for (const code of ['g', 't', 'r', 'i', 'p'])
    if (!map.terrain.some((row) => row.includes(code)))
      warnings.push(`Map has no ${TERRAIN_CODES[code as keyof typeof TERRAIN_CODES]} resources.`);
  return { errors: [...new Set(errors)], warnings };
}
export const SMALL_MAP = parseMap(smallMapData);
export const MEDIUM_MAP = parseMap(mediumMapData);
export const LARGE_MAP = parseMap(largeMapData);
export const BUILTIN_MAPS = Object.freeze([SMALL_MAP, MEDIUM_MAP, LARGE_MAP] as const);
