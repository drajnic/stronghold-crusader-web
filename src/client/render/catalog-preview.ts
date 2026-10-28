import { createGame, TROOPS, TYPES } from '../../game/index.js';
import type { BuildingType, GameState, TroopType, Unit } from '../../game/index.js';
import { building, buildingShadow } from './buildings.js';
import { DrawingSurface } from './drawing.js';
import { unit, unitGround } from './units.js';

const previews = new Map<string, string>();
let surface: DrawingSurface | undefined;
let scene: GameState | undefined;
let output: HTMLCanvasElement | undefined;
/** Two bounded reusable canvases; alpha bounds are measured only once per catalog entry. */
export function catalogPreview(type: string, troop: boolean): string {
  if (!(troop ? Object.hasOwn(TROOPS, type) : Object.hasOwn(TYPES, type))) return '';
  const key = `${troop ? 'unit' : 'building'}:${type}`;
  const cached = previews.get(key);
  if (cached) return cached;
  if (!surface) {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    surface = new DrawingSurface(canvas);
    surface.width = 320;
    surface.height = 320;
    output = document.createElement('canvas');
    output.width = 144;
    output.height = 128;
    scene = createGame({ mode: 'sandbox' });
    scene.status = 'victory';
    scene.time = 0;
  }
  const r = surface,
    s = scene!;
  r.ctx.setTransform(1, 0, 0, 1, 0, 0);
  r.ctx.clearRect(0, 0, 320, 320);
  if (troop) {
    const kind = type as TroopType,
      d = TROOPS[kind];
    const u: Unit = {
      id: 1,
      type: kind,
      team: 'player',
      hp: d.hp,
      x: 0,
      y: 0,
      attack: 0,
      path: [],
      goal: null,
      repath: 0,
      stance: 'defensive',
      targetId: null,
      garrisonId: null,
    };
    const zoom = d.facility === 'siege' ? 2 : d.cavalry ? 2.1 : 2.8;
    r.camera = { x: -48 / (32 * zoom), y: -48 / (32 * zoom), zoom };
    unitGround(r, u);
    unit(r, u, s);
  } else {
    const kind = type as BuildingType,
      d = TYPES[kind],
      n = d.size;
    const height =
      kind === 'tower' || kind === 'chapel'
        ? 115
        : kind === 'keep'
          ? 110
          : kind === 'mill'
            ? 100
            : 75;
    const zoom = Math.min(1.6, 240 / (n * 64 + 12), 250 / (n * 32 + height));
    r.camera = { x: n / 2 - height / 64, y: n / 2 - height / 64, zoom };
    const b = { id: 1, type: kind, x: 0, y: 0, team: 'player' as const, hp: d.hp, shot: 0 };
    buildingShadow(r, b);
    // Paint the actual detailed model before reducing it to a crisp miniature.
    building(r, b, s);
  }
  const pixels = r.ctx.getImageData(0, 0, 320, 320).data;
  let left = 320,
    top = 320,
    right = 0,
    bottom = 0;
  for (let y = 0; y < 320; y++)
    for (let x = 0; x < 320; x++) {
      if (pixels[(y * 320 + x) * 4 + 3] > 8) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  const width = Math.max(1, right - left + 1),
    height = Math.max(1, bottom - top + 1);
  const scale = Math.min(128 / width, 112 / height);
  const c = output!.getContext('2d')!;
  c.clearRect(0, 0, 144, 128);
  c.drawImage(
    r.canvas,
    left,
    top,
    width,
    height,
    (144 - width * scale) / 2,
    (128 - height * scale) / 2,
    width * scale,
    height * scale,
  );
  const url = output!.toDataURL('image/png');
  previews.set(key, url);
  return url;
}
