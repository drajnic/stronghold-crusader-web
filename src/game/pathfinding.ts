import { SIZE } from './catalog.js';
import { clamp, finite } from './utils.js';
import { terrain, buildingAt, passable } from './map.js';
import { hostile } from './economy.js';
import { staticPositionClear, unitRadius } from './spatial.js';
import type { GameState, Point, Team } from './types.js';
export function pathfind(
  s: GameState,
  start: Point,
  end: Point,
  team: Team = 'player',
  radius = 0.23,
): Point[] {
  if (!start || !end || ![start.x, start.y, end.x, end.y].every(finite)) return [];
  const sx = clamp(Math.floor(start.x), 1, SIZE - 2),
    sy = clamp(Math.floor(start.y), 1, SIZE - 2),
    ex = clamp(Math.floor(end.x), 1, SIZE - 2),
    ey = clamp(Math.floor(end.y), 1, SIZE - 2),
    origin = sy * SIZE + sx,
    target = ey * SIZE + ex;
  // Build soft crowd costs once per search rather than sorting neighbour buckets
  // for each A* edge. Each body touches only a handful of possible cell centres.
  const congestion = new Float64Array(SIZE * SIZE);
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
        if (Math.hypot(body.x - x - 0.5, body.y - y - 0.5) < reach)
          congestion[y * SIZE + x] += body.goal || body.targetId ? 1 : 6;
  }
  const walkability = new Int8Array(SIZE * SIZE);
  const walkable = (x: number, y: number) => {
    const key = y * SIZE + x;
    if (!walkability[key])
      walkability[key] = (
        radius <= 0.5
          ? passable(s, x, y, team)
          : staticPositionClear(s, { x: x + 0.5, y: y + 0.5 }, radius)
      )
        ? 1
        : -1;
    return walkability[key] > 0;
  };
  const dist = new Float64Array(SIZE * SIZE).fill(Infinity),
    from = new Int32Array(SIZE * SIZE).fill(-1),
    heap: { k: number; g: number; f: number }[] = [];
  const push = (k: number, g: number) => {
    const n = { k, g, f: g + Math.abs((k % SIZE) - ex) + Math.abs(Math.floor(k / SIZE) - ey) };
    let i = heap.length;
    heap.push(n);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= n.f) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = n;
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1;
        if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++;
        if (heap[c].f >= last.f) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = last;
    }
    return first;
  };
  dist[origin] = 0;
  push(origin, 0);
  let closest = origin,
    best = Infinity,
    steps = 0;
  while (heap.length && steps++ < 12000) {
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
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
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
      if (ng < dist[key]) {
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
