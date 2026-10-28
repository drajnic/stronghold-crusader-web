import { SIZE, buildingAt, terrain } from '../../game/index.js';
import type { GameState, MapDefinition, Point } from '../../game/index.js';
import { DrawingSurface } from './drawing.js';
import { environmentNoise as noise, viewportBounds } from './environment-geometry.js';

type DecorKind =
  'palm' | 'rock' | 'ore' | 'pitch' | 'reeds' | 'shrub' | 'tuft' | 'dryshrub' | 'water';
interface EnvironmentDetail extends Point {
  kind: DecorKind;
  variant: number;
}
interface Sprite {
  canvas: HTMLCanvasElement;
  anchorX: number;
  anchorY: number;
}
const sprites = new Map<string, Sprite>();
function polygon(c: CanvasRenderingContext2D, points: Point[], fill: string): void {
  c.beginPath();
  points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}
function ellipse(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = color;
  c.fill();
}
function palm(c: CanvasRenderingContext2D, variant: number): void {
  const base = { x: 65, y: 108 },
    height = 55 + noise(variant, 4) * 22,
    tip = { x: base.x - 5 + noise(variant, 5) * 7, y: base.y - height },
    lean = noise(variant, 12) * 7;
  ellipse(c, 83, 114, 34, 9, '#504a2724');
  ellipse(c, 69, 110, 16, 5, '#4d482c36');
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(base.x, base.y);
  c.quadraticCurveTo(base.x + lean, base.y - height * 0.4, tip.x, tip.y);
  c.strokeStyle = '#73573a';
  c.lineWidth = 6;
  c.stroke();
  c.strokeStyle = '#bc9862';
  c.lineWidth = 2;
  c.stroke();
  for (let i = 5; i < height; i += 4) {
    const t = i / height,
      x = base.x + (tip.x - base.x) * t + Math.sin(t * Math.PI) * lean * 0.45,
      y = base.y - i;
    c.strokeStyle = i % 8 < 4 ? '#503e2c88' : '#e4ba745c';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(x - 2, y);
    c.lineTo(x + 2, y - 1.6);
    c.stroke();
  }
  // Layer curved fronds and individual leaflets, keeping a readable radial palm silhouette.
  for (let i = 0; i < 11; i++) {
    const angle = (i / 11) * Math.PI * 2 + variant * 0.33,
      length = 25 + noise(variant + i, 9) * 14,
      dx = Math.cos(angle) * length,
      dy = Math.sin(angle) * length * 0.35,
      end = { x: tip.x + dx, y: tip.y + dy + 12 },
      mid = { x: tip.x + dx * 0.6, y: tip.y + dy * 0.6 - 9 };
    c.beginPath();
    c.moveTo(tip.x, tip.y);
    c.quadraticCurveTo(mid.x, mid.y, end.x, end.y);
    c.strokeStyle = i % 3 === 0 ? '#3f6940' : i % 2 ? '#577d42' : '#6a8a45';
    c.lineWidth = 2.5;
    c.stroke();
    for (let k = 1; k <= 8; k++) {
      const t = k / 9,
        px = (1 - t) * (1 - t) * tip.x + 2 * (1 - t) * t * mid.x + t * t * end.x,
        py = (1 - t) * (1 - t) * tip.y + 2 * (1 - t) * t * mid.y + t * t * end.y,
        leaf = (1 - t) * 8 + 2,
        sign = dx < 0 ? -1 : 1;
      c.beginPath();
      c.moveTo(px, py);
      c.quadraticCurveTo(
        px + sign * leaf * 0.4,
        py + leaf * 0.4,
        px + sign * leaf * 0.45,
        py + leaf + 2,
      );
      c.strokeStyle = i % 2 ? '#4d743c' : '#77944b';
      c.lineWidth = 1.3;
      c.stroke();
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(px - sign * leaf * 0.8, py + leaf * 0.5 + 1);
      c.strokeStyle = '#335c3a';
      c.lineWidth = 1;
      c.stroke();
    }
    c.beginPath();
    c.moveTo(tip.x, tip.y);
    c.quadraticCurveTo(mid.x, mid.y, end.x, end.y);
    c.strokeStyle = '#b3b3627a';
    c.lineWidth = 0.7;
    c.stroke();
  }
  ellipse(c, tip.x, tip.y + 5, 4, 3, '#70512b');
  for (let i = 0; i < 4; i++)
    ellipse(c, tip.x - 3 + i * 2, tip.y + 7 + (i % 2) * 2, 1.7, 2.2, '#aa703b');
}
function boulder(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  ore: boolean,
): void {
  const base = [
      { x: x - w * 0.5, y: y - h * 0.08 },
      { x: x - w * 0.36, y: y + h * 0.23 },
      { x: x + w * 0.14, y: y + h * 0.28 },
      { x: x + w * 0.5, y: y + h * 0.03 },
      { x: x + w * 0.41, y: y - h * 0.27 },
      { x: x - w * 0.07, y: y - h * 0.43 },
    ],
    cap = [
      { x: x - w * 0.32, y: y - h * 0.57 },
      { x: x - w * 0.1, y: y - h * (0.86 + noise(seed, 3) * 0.12) },
      { x: x + w * 0.23, y: y - h * 0.72 },
      { x: x + w * 0.33, y: y - h * 0.31 },
    ];
  ellipse(c, x + 4, y + 4, w * 0.58, h * 0.24, '#65533c20');
  const colors = ore
    ? ['#77796b', '#818373', '#5f695f', '#96977e', '#a29d80', '#7c8170']
    : ['#b9aa8c', '#c2b495', '#a4977d', '#cfc1a1', '#d6c9a8', '#bdaf90'];
  // Broad, weathered caps and asymmetric ledges replace the old pointed rock cones.
  polygon(c, [base[0], base[1], cap[0]], colors[0]);
  polygon(c, [base[1], base[2], cap[3], cap[0]], colors[1]);
  polygon(c, [base[2], base[3], base[4], cap[3]], colors[2]);
  polygon(c, [base[0], cap[0], cap[1], base[5]], colors[3]);
  polygon(c, cap, colors[4]);
  polygon(c, [cap[2], base[4], cap[3]], colors[5]);
  c.strokeStyle = ore ? '#b570427a' : '#f2e5c377';
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(x - w * 0.3, y - h * 0.1);
  c.lineTo(x - w * 0.03, y - h * 0.4);
  c.lineTo(x + w * 0.27, y - h * 0.24);
  c.stroke();
  if (ore)
    for (let i = 0; i < 5; i++) {
      const a = x - w * 0.25 + noise(seed + i, 2) * w * 0.6,
        b = y - h * 0.15 - noise(seed + i, 3) * h * 0.5;
      polygon(
        c,
        [
          { x: a, y: b },
          { x: a + 4, y: b - 3 },
          { x: a + 7, y: b + 1 },
          { x: a + 2, y: b + 3 },
        ],
        i % 2 ? '#b77542' : '#d09857',
      );
    }
  else {
    c.strokeStyle = '#8c80685c';
    c.lineWidth = 0.7;
    c.beginPath();
    c.moveTo(x - w * 0.1, y - h * 0.6);
    c.lineTo(x + w * 0.04, y - h * 0.25);
    c.lineTo(x + w * 0.2, y + h * 0.05);
    c.stroke();
  }
}
function rocks(c: CanvasRenderingContext2D, variant: number, ore: boolean): void {
  ellipse(c, 64, 102, 34, 10, '#6d593025');
  boulder(c, 48, 97, 33, 10 + noise(variant, 3) * 5, variant + 0.1, ore);
  boulder(c, 72, 96, 43, 14 + noise(variant, 5) * 8, variant + 0.3, ore);
  boulder(c, 60, 106, 22, 7, variant + 0.6, ore);
  for (let i = 0; i < 7; i++) {
    const x = 34 + noise(variant + i, 7) * 59,
      y = 100 + noise(variant + i, 9) * 12;
    polygon(
      c,
      [
        { x, y },
        { x: x + 3, y: y - 2 },
        { x: x + 5, y: y + 1 },
        { x: x + 1, y: y + 2 },
      ],
      ore ? '#917455' : '#d5c8a6',
    );
  }
}
function foliage(c: CanvasRenderingContext2D, kind: DecorKind, variant: number): void {
  const dry = kind === 'dryshrub',
    reeds = kind === 'reeds';
  ellipse(c, 65, 110, reeds ? 15 : 12, 4, '#64563125');
  const count = reeds ? 12 : kind === 'tuft' ? 6 : 10;
  for (let i = 0; i < count; i++) {
    const x = 57 + noise(variant * 5 + i, 7) * 16,
      y = 109 + noise(i, variant) * 3,
      height = (reeds ? 17 : kind === 'tuft' ? 7 : 11) + noise(variant + i, 3) * (reeds ? 17 : 9),
      bend = (noise(i, variant + 3) - 0.5) * 15;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + bend * 0.2, y - height * 0.7, x + bend, y - height);
    c.strokeStyle = dry ? '#917b47' : i % 3 === 0 ? '#9aa85d' : i % 2 ? '#6a8547' : '#456d40';
    c.lineWidth = reeds ? 1 : 1.5;
    c.stroke();
    if (reeds && i % 3 === 0) {
      c.strokeStyle = '#6a5835';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x + bend, y - height);
      c.lineTo(x + bend * 0.9, y - height + 5);
      c.stroke();
    }
    if (kind === 'shrub' || dry) {
      ellipse(c, x + bend, y - height * 0.7, 3, 1.8, dry ? '#aa955e' : '#739151');
      ellipse(c, x + bend - 2, y - height * 0.5, 3.5, 1.5, dry ? '#bdac79' : '#8ca65c');
    }
  }
}
function pitch(c: CanvasRenderingContext2D, variant: number): void {
  const points: Point[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2,
      r = 19 + noise(variant + i, 12) * 8;
    points.push({ x: 65 + Math.cos(a) * r, y: 105 + Math.sin(a) * r * 0.36 });
  }
  polygon(c, points, '#7a7250');
  polygon(
    c,
    points.map((p) => ({ x: 65 + (p.x - 65) * 0.84, y: 105 + (p.y - 105) * 0.78 })),
    '#303e36',
  );
  ellipse(c, 63, 102, 15, 3, '#54726050');
  for (let i = 0; i < 3; i++) ellipse(c, 56 + i * 7, 105 + (i % 2), 2, 1, '#8d967844');
}
function spriteFor(kind: DecorKind, variant: number): Sprite {
  const key = `${kind}:${variant}`;
  const cached = sprites.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 132;
  canvas.height = 132;
  const c = canvas.getContext('2d');
  if (!c) throw Error('Canvas2D unavailable');
  if (kind === 'palm') palm(c, variant);
  else if (kind === 'rock' || kind === 'ore') rocks(c, variant, kind === 'ore');
  else if (kind === 'pitch') pitch(c, variant);
  else foliage(c, kind, variant);
  const sprite = { canvas, anchorX: 65, anchorY: 108 };
  sprites.set(key, sprite);
  return sprite;
}
/** Static detail is bucketed once. Frames visit only buckets intersecting the viewport. */
export class EnvironmentScene {
  private readonly buckets = new Map<number, EnvironmentDetail[]>();
  constructor(map?: MapDefinition) {
    const add = (kind: DecorKind, x: number, y: number, variant: number) => {
      const item = { kind, x: x + 0.5, y: y + 0.5, variant },
        key = Math.floor(y / 8) * 8 + Math.floor(x / 8);
      const bucket = this.buckets.get(key);
      if (bucket) bucket.push(item);
      else this.buckets.set(key, [item]);
    };
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        const t = terrain(x, y, map),
          h = noise(x, y),
          variant = Math.floor(noise(y + 11, x + 9) * 9);
        if (t === 'trees') add('palm', x, y, variant);
        else if (t === 'stone' && h > 0.54) add('rock', x, y, variant);
        else if (t === 'iron' && h > 0.5) add('ore', x, y, variant);
        else if (t === 'pitch' && h > 0.25) add('pitch', x, y, variant);
        else if (t === 'grass' && h > 0.57) add(h > 0.82 ? 'shrub' : 'tuft', x, y, variant);
        else if (t === 'sand' && h > 0.985) add('dryshrub', x, y, variant);
        if (t === 'water') add('water', x, y, variant);
        else if (
          t !== 'trees' &&
          t !== 'stone' &&
          t !== 'iron' &&
          h > 0.48 &&
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dy]) => terrain(x + dx, y + dy, map) === 'water')
        )
          add('reeds', x, y, variant);
      }
  }
  visible(
    r: Pick<DrawingSurface, 'inverse' | 'project' | 'width' | 'height'>,
    s: GameState,
  ): EnvironmentDetail[] {
    const bounds = viewportBounds((x, y) => r.inverse(x, y), r.width, r.height, SIZE),
      visible: EnvironmentDetail[] = [];
    for (let by = Math.floor(bounds.minY / 8); by <= Math.floor(bounds.maxY / 8); by++)
      for (let bx = Math.floor(bounds.minX / 8); bx <= Math.floor(bounds.maxX / 8); bx++)
        for (const item of this.buckets.get(by * 8 + bx) || []) {
          if (
            item.x < bounds.minX ||
            item.x > bounds.maxX + 1 ||
            item.y < bounds.minY ||
            item.y > bounds.maxY + 1 ||
            buildingAt(s, Math.floor(item.x), Math.floor(item.y))
          )
            continue;
          const p = r.project(item.x, item.y);
          if (p.x < -90 || p.x > r.width + 90 || p.y < -30 || p.y > r.height + 120) continue;
          visible.push(item);
        }
    return visible;
  }
  draw(r: DrawingSurface, item: EnvironmentDetail, time: number): void {
    if (item.kind === 'water') return;
    const sprite = spriteFor(item.kind, item.variant),
      p = r.project(item.x, item.y),
      z = r.camera.zoom,
      sway = item.kind === 'palm' ? Math.sin(time * 0.65 + item.x) * 0.4 : 0;
    r.ctx.drawImage(
      sprite.canvas,
      p.x - sprite.anchorX * z + sway * z,
      p.y - sprite.anchorY * z,
      sprite.canvas.width * z,
      sprite.canvas.height * z,
    );
  }
  water(r: DrawingSurface, items: EnvironmentDetail[], time: number): void {
    const c = r.ctx,
      z = r.camera.zoom;
    c.save();
    c.lineCap = 'round';
    for (const item of items) {
      if (item.kind !== 'water' || item.variant % 3) continue;
      const p = r.project(item.x, item.y),
        phase = (time * 0.22 + noise(item.x, item.y)) % 1,
        alpha = Math.sin(phase * Math.PI) * 0.23,
        spread = 5 + phase * 10;
      c.strokeStyle = `rgba(205,241,218,${alpha})`;
      c.lineWidth = 0.8 * z;
      c.beginPath();
      c.ellipse(p.x, p.y, spread * z, spread * 0.23 * z, -0.1, Math.PI * 0.1, Math.PI * 1.15);
      c.stroke();
      c.strokeStyle = `rgba(225,245,218,${alpha * 0.7})`;
      c.beginPath();
      c.moveTo(p.x - 5 * z, p.y - 2 * z);
      c.quadraticCurveTo(p.x, p.y - 3 * z, p.x + 7 * z, p.y - 2 * z);
      c.stroke();
    }
    c.restore();
  }
}
