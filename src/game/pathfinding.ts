import { clamp, finite } from './utils.js';
import { terrain, buildingAt, passable } from './map.js';
import { hostile } from './economy.js';
import { staticPositionClear, unitRadius } from './spatial.js';
import type { GameState, Point, Team } from './types.js';
// Searches are synchronous. Reuse bounded scratch space; stamps avoid clearing the
// entire 512 battlefield for each troop's short local route.
const searchBuffers = new Map<
  number,
  {
    dist: Float64Array;
    from: Int32Array;
    visited: Uint32Array;
    walkability: Int8Array;
    walkStamp: Uint32Array;
    congestion: Float64Array;
    congestionCells: number[];
    stamp: number;
  }
>();
const neighbours = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export function pathfind(
  s: GameState,
  start: Point,
  end: Point,
  team: Team = 'player',
  radius = 0.23,
): Point[] {
  const SIZE = s.map.width;
  if (!start || !end || ![start.x, start.y, end.x, end.y].every(finite)) return [];
  const sx = clamp(Math.floor(start.x), 1, SIZE - 2),
    sy = clamp(Math.floor(start.y), 1, SIZE - 2),
    ex = clamp(Math.floor(end.x), 1, SIZE - 2),
    ey = clamp(Math.floor(end.y), 1, SIZE - 2),
    origin = sy * SIZE + sx,
    target = ey * SIZE + ex;
  // Build soft crowd costs once per search rather than sorting neighbour buckets
  // for each A* edge. Each body touches only a handful of possible cell centres.
  let buffers = searchBuffers.get(SIZE);
  if (!buffers) {
    const length = SIZE * SIZE;
    buffers = {
      dist: new Float64Array(length),
      from: new Int32Array(length),
      visited: new Uint32Array(length),
      walkability: new Int8Array(length),
      walkStamp: new Uint32Array(length),
      congestion: new Float64Array(length),
      congestionCells: [],
      stamp: 0,
    };
    searchBuffers.set(SIZE, buffers);
  }
  if (++buffers.stamp === 0xffffffff) {
    buffers.visited.fill(0);
    buffers.walkStamp.fill(0);
    buffers.stamp = 1;
  }
  const { dist, from, visited, walkability, walkStamp, congestion, stamp } = buffers;
  for (const key of buffers.congestionCells) congestion[key] = 0;
  buffers.congestionCells.length = 0;
  for (const body of s.units) {
    if (body.hp <= 0 || body.garrisonId || Math.hypot(body.x - start.x, body.y - start.y) < 0.001)
      continue;
    const reach = radius + unitRadius(body) + 0.15;
    for (
      let y = Math.max(1, Math.ceil(body.y - reach - 0.5));
      y <= Math.min(SIZE - 2, Math.floor(body.y + reach - 0.5));
      y++
    )
      for (
        let x = Math.max(1, Math.ceil(body.x - reach - 0.5));
        x <= Math.min(SIZE - 2, Math.floor(body.x + reach - 0.5));
        x++
      )
        if (Math.hypot(body.x - x - 0.5, body.y - y - 0.5) < reach) {
          const key = y * SIZE + x;
          if (!congestion[key]) buffers.congestionCells.push(key);
          congestion[key] += body.goal || body.targetId ? 1 : 6;
        }
  }
  const walkable = (x: number, y: number) => {
    const key = y * SIZE + x;
    if (walkStamp[key] !== stamp) {
      walkStamp[key] = stamp;
      walkability[key] = (
        radius <= 0.5
          ? passable(s, x, y, team)
          : staticPositionClear(s, { x: x + 0.5, y: y + 0.5 }, radius)
      )
        ? 1
        : -1;
    }
    return walkability[key] > 0;
  };
  const heap: { k: number; g: number; f: number }[] = [];
  const push = (k: number, g: number) => {
    const n = { k, g, f: g + Math.abs((k % SIZE) - ex) + Math.abs(Math.floor(k / SIZE) - ey) };
    let i = heap.length;
    heap.push(n);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!before(n, heap[p])) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = n;
  };
  const before = (a: { f: number; g: number }, b: { f: number; g: number }) =>
    a.f < b.f || (a.f === b.f && a.g > b.g);
  const pop = () => {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1;
        if (c + 1 < heap.length && before(heap[c + 1], heap[c])) c++;
        if (!before(heap[c], last)) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = last;
    }
    return first;
  };
  visited[origin] = stamp;
  from[origin] = -1;
  dist[origin] = 0;
  push(origin, 0);
  let closest = origin,
    best = Infinity,
    steps = 0;
  while (heap.length && steps++ < Math.max(12000, SIZE * SIZE * 4)) {
    const { k, g } = pop();
    if (g !== dist[k]) continue;
    const x = k % SIZE,
      y = Math.floor(k / SIZE),
      h = Math.abs(x - ex) + Math.abs(y - ey);
    if (h < best) {
      best = h;
      closest = k;
    }
    if (k === target) {
      closest = k;
      break;
    }
    for (const [dx, dy] of neighbours) {
      const nx = x + dx,
        ny = y + dy;
      if (
        nx < 1 ||
        ny < 1 ||
        nx >= SIZE - 1 ||
        ny >= SIZE - 1 ||
        terrain(nx, ny, s.map) === 'water'
      )
        continue;
      const b = buildingAt(s, nx, ny);
      let cost = 1;
      if (b && !passable(s, nx, ny, team)) {
        if (!hostile(s, team, b.team)) continue;
        cost += 5 + b.hp / 150;
      }
      if ((!b || passable(s, nx, ny, team)) && !walkable(nx, ny)) continue;
      cost += congestion[ny * SIZE + nx];
      const key = ny * SIZE + nx,
        ng = g + cost;
      if (visited[key] !== stamp || ng < dist[key]) {
        visited[key] = stamp;
        dist[key] = ng;
        from[key] = k;
        push(key, ng);
      }
    }
  }
  const path: Point[] = [];
  while (closest !== origin && from[closest] !== -1) {
    path.push({ x: (closest % SIZE) + 0.5, y: Math.floor(closest / SIZE) + 0.5 });
    closest = from[closest];
  }
  if (
    origin === target &&
    passable(s, ex, ey, team) &&
    Math.hypot(start.x - ex - 0.5, start.y - ey - 0.5) > 0.001
  )
    return [{ x: ex + 0.5, y: ey + 0.5 }];
  return path.reverse();
}
