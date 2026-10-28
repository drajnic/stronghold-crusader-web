import type { Point } from '../../game/index.js';

interface TileBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export const environmentNoise = (x: number, y: number): number => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
export function smoothNoise(x: number, y: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    tx = x - ix,
    ty = y - iy,
    sx = tx * tx * (3 - 2 * tx),
    sy = ty * ty * (3 - 2 * ty);
  const a = environmentNoise(ix, iy) * (1 - sx) + environmentNoise(ix + 1, iy) * sx,
    b = environmentNoise(ix, iy + 1) * (1 - sx) + environmentNoise(ix + 1, iy + 1) * sx;
  return a * (1 - sy) + b * sy;
}
/** Visible world bounds come from the inverse projection, including tall sprite overhang. */
export function viewportBounds(
  inverse: (x: number, y: number) => Point,
  width: number,
  height: number,
  size: number,
  margin = 140,
): TileBounds {
  const corners = [
    inverse(-margin, -margin),
    inverse(width + margin, -margin),
    inverse(width + margin, height + margin),
    inverse(-margin, height + margin),
  ];
  return {
    minX: Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x)))),
    minY: Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y)))),
    maxX: Math.min(size - 1, Math.ceil(Math.max(...corners.map((p) => p.x)))),
    maxY: Math.min(size - 1, Math.ceil(Math.max(...corners.map((p) => p.y)))),
  };
}
/** Cell-edge contours retain the exact simulation region; painters only round their corners. */
export function regionContours(
  size: number,
  contains: (x: number, y: number) => boolean,
): Point[][] {
  const edges = new Map<string, Point[]>();
  const add = (a: Point, b: Point) => {
    const key = `${a.x},${a.y}`;
    const ends = edges.get(key);
    if (ends) ends.push(b);
    else edges.set(key, [b]);
  };
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < size && y < size && contains(x, y);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add({ x, y }, { x: x + 1, y });
      if (!inside(x + 1, y)) add({ x: x + 1, y }, { x: x + 1, y: y + 1 });
      if (!inside(x, y + 1)) add({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
      if (!inside(x - 1, y)) add({ x, y: y + 1 }, { x, y });
    }
  const loops: Point[][] = [];
  let remaining = size * size * 4;
  while (edges.size && remaining > 0) {
    const first = edges.keys().next().value;
    if (first === undefined) break;
    const [x, y] = first.split(',').map(Number);
    const loop: Point[] = [{ x, y }];
    let current = first;
    while (remaining-- > 0) {
      const next = edges.get(current)?.pop();
      if (!next) {
        edges.delete(current);
        break;
      }
      if (!edges.get(current)?.length) edges.delete(current);
      current = `${next.x},${next.y}`;
      if (current === first) break;
      loop.push(next);
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}
