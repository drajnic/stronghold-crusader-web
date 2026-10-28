import type { Building, Point, Unit } from '../../game/index.js';
import { TYPES } from '../../game/index.js';

interface Footprint {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface DepthItem extends Footprint {
  key: string;
}
export function buildingFootprint(b: Building): Footprint {
  return { x: b.x, y: b.y, width: TYPES[b.type].size, height: TYPES[b.type].size };
}
export function visualUnitPosition(u: Unit, positions: ReadonlyMap<number, Point>): Point {
  return positions.get(u.id) || u;
}
/** A roof has six distinct standing slots, independent of simulation/packet order. */
export function garrisonPosition(b: Building, index: number): Point {
  return { x: b.x + 0.55 + (index % 3) * 0.45, y: b.y + 0.65 + Math.floor(index / 3) * 0.65 };
}
function fallback(a: DepthItem, b: DepthItem): number {
  return (
    a.x + a.y + (a.width + a.height) / 2 - (b.x + b.y + (b.width + b.height) / 2) ||
    a.x - a.y - (b.x - b.y) ||
    a.key.localeCompare(b.key)
  );
}
/** Whole silhouettes need a partial order: an adjacent front edge beats a distant center.
 * Only intersecting projected horizontal spans can occlude one another. */
export function sortByFootprint<T extends DepthItem>(items: readonly T[]): T[] {
  const sorted = [...items].sort(fallback),
    edges = sorted.map(() => [] as number[]),
    incoming = sorted.map(() => 0);
  const spans = sorted
    .map((item, index) => ({
      index,
      min: item.x - item.y - item.height,
      max: item.x - item.y + item.width + 0.8,
    }))
    .sort((a, b) => a.min - b.min || a.index - b.index);
  for (let left = 0; left < spans.length; left++) {
    const i = spans[left].index,
      a = sorted[i];
    for (let right = left + 1; right < spans.length; right++) {
      if (spans[right].min > spans[left].max) break;
      const j = spans[right].index,
        b = sorted[j];
      const behind = a.x + a.width <= b.x || a.y + a.height <= b.y,
        ahead = b.x + b.width <= a.x || b.y + b.height <= a.y;
      if (behind === ahead) continue;
      const from = behind ? i : j,
        to = behind ? j : i;
      edges[from].push(to);
      incoming[to]++;
    }
  }
  const result: T[] = [],
    done = new Set<number>();
  while (result.length < sorted.length) {
    // Stable center order only resolves unrelated silhouettes and rare cyclic overlaps.
    let next = incoming.findIndex((count, i) => count === 0 && !done.has(i));
    if (next < 0) next = sorted.findIndex((_, i) => !done.has(i));
    done.add(next);
    result.push(sorted[next]);
    for (const target of edges[next]) incoming[target]--;
  }
  return result;
}
