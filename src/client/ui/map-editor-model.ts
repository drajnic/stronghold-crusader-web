import { MAX_MAP_BYTES, parseMap } from '../../game/index.js';
import type { MapDefinition, Point } from '../../game/index.js';
export const cloneMap = (map: MapDefinition): MapDefinition => JSON.parse(JSON.stringify(map));
/** Inclusive Bresenham line: even widely spaced pointer events leave a continuous stroke. */
export function strokeCells(from: Point, to: Point): Point[] {
  let x = from.x,
    y = from.y;
  const dx = Math.abs(to.x - x),
    dy = -Math.abs(to.y - y),
    sx = x < to.x ? 1 : -1,
    sy = y < to.y ? 1 : -1;
  let error = dx + dy;
  const points: Point[] = [];
  for (;;) {
    points.push({ x, y });
    if (x === to.x && y === to.y) return points;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
}
export function paintStroke(
  map: MapDefinition,
  from: Point,
  to: Point,
  brush: string,
  size: number,
): MapDefinition {
  const anchor = {
    x: Math.max(1, Math.min(map.width - 2, to.x)),
    y: Math.max(1, Math.min(map.height - 2, to.y)),
  };
  if (brush === 'raid') return { ...map, raid: anchor };
  if (['player', 'player2', 'enemy'].includes(brush))
    return { ...map, spawns: { ...map.spawns, [brush]: anchor } };
  if (!'swgtrip'.includes(brush) || brush.length !== 1) return map;
  const rows = [...map.terrain],
    changed = new Map<number, string[]>(),
    radius = (size - 1) / 2;
  for (const { x, y } of strokeCells(from, to))
    for (let yy = Math.max(0, y - radius); yy <= Math.min(map.height - 1, y + radius); yy++)
      for (let xx = Math.max(0, x - radius); xx <= Math.min(map.width - 1, x + radius); xx++) {
        let row = changed.get(yy);
        if (!row) {
          row = [...rows[yy]];
          changed.set(yy, row);
        }
        row[xx] = brush;
      }
  for (const [y, row] of changed) rows[y] = row.join('');
  return { ...map, terrain: rows };
}
export class EditorHistory {
  private past: MapDefinition[] = [];
  private future: MapDefinition[] = [];
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
  checkpoint(map: MapDefinition) {
    this.past.push(cloneMap(map));
    if (this.past.length > 60) this.past.shift();
    this.future = [];
  }
  undo(map: MapDefinition): MapDefinition {
    const previous = this.past.pop();
    if (!previous) return map;
    this.future.push(cloneMap(map));
    return previous;
  }
  redo(map: MapDefinition): MapDefinition {
    const next = this.future.pop();
    if (!next) return map;
    this.past.push(cloneMap(map));
    return next;
  }
}
/** Recovery also preserves an unfinished empty name, which is not yet an exportable map. */
export function decodeDraft(raw: string): MapDefinition {
  if (new TextEncoder().encode(raw).length > MAX_MAP_BYTES)
    throw Error('Recovery draft is too large.');
  const candidate: unknown = JSON.parse(raw);
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    !('name' in candidate) ||
    typeof candidate.name !== 'string'
  )
    throw Error('Invalid recovery draft.');
  const map = parseMap({
    ...candidate,
    name: candidate.name.trim() ? candidate.name : 'Untitled map',
  });
  return { ...map, name: candidate.name };
}

export function updateMetadata(
  map: MapDefinition,
  fields: Pick<MapDefinition, 'name' | 'author' | 'description'>,
): MapDefinition {
  return map.name === fields.name &&
    map.author === fields.author &&
    map.description === fields.description
    ? map
    : { ...map, ...fields };
}

/** Failed recovery must stay untouched until the user explicitly replaces it. */
export class EditorDraftStorage {
  protectedDraft = false;
  constructor(
    private readonly read: () => string | null,
    private readonly write: (raw: string) => void,
  ) {}
  recover(): MapDefinition | undefined {
    try {
      const raw = this.read();
      return raw ? decodeDraft(raw) : undefined;
    } catch (error) {
      this.protectedDraft = true;
      throw error;
    }
  }
  persist(raw: string): boolean {
    if (this.protectedDraft) return false;
    this.write(raw);
    return true;
  }
  replace(raw: string): void {
    this.write(raw);
    this.protectedDraft = false;
  }
}
