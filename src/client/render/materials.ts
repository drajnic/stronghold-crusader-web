import type { Point } from '../../game/index.js';
import type { DrawingSurface } from './drawing.js';
type SurfaceKind = 'limestone' | 'roof';
const panels = new Map<string, HTMLCanvasElement>();
const noise = (x: number, y: number): number => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
export function tint(color: string, toward: string, amount: number): string {
  if (!/^#[\da-f]{6}$/i.test(color) || !/^#[\da-f]{6}$/i.test(toward)) return color;
  const channels = [1, 3, 5].map((index) =>
    Math.round(
      parseInt(color.slice(index, index + 2), 16) * (1 - amount) +
        parseInt(toward.slice(index, index + 2), 16) * amount,
    ),
  );
  return '#' + channels.map((value) => value.toString(16).padStart(2, '0')).join('');
}
function panel(
  kind: SurfaceKind,
  width: number,
  height: number,
  color: string,
  seed: number,
): HTMLCanvasElement {
  const w = Math.max(2, Math.ceil(width)),
    h = Math.max(2, Math.ceil(height));
  const variant = ((seed % 3) + 3) % 3;
  const key = `${kind}:${w}:${h}:${color}:${variant}`;
  const existing = panels.get(key);
  if (existing) {
    panels.delete(key);
    panels.set(key, existing);
    return existing;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  if (!c) return canvas;
  c.fillStyle = color;
  c.fillRect(0, 0, w, h);
  const course = kind === 'roof' ? 5 : 7,
    block = kind === 'roof' ? 8 : 13;
  for (let row = 0; row < h / course; row++)
    for (let column = -1; column < w / block + 1; column++) {
      const x = column * block + (row % 2) * block * 0.5,
        y = row * course,
        v = noise(column + variant, row + variant);
      c.fillStyle = tint(
        color,
        v > 0.5 ? '#fff2cc' : '#5c4936',
        kind === 'roof' ? 0.06 + v * 0.13 : 0.04 + v * 0.1,
      );
      c.fillRect(x + 0.5, y + 0.5, block - 1, course - 1);
      c.fillStyle = kind === 'roof' ? '#493d303f' : '#f3e7c14d';
      c.fillRect(x + 1, y + 0.5, block - 2, 0.6);
      c.fillStyle = kind === 'roof' ? '#442f235e' : '#6b5c4540';
      c.fillRect(x, y + course - 0.8, block, 0.8);
      c.fillRect(x, y + 0.5, 0.6, course - 1);
      if (kind === 'limestone' && v > 0.66) {
        c.fillStyle = '#63543b22';
        c.fillRect(x + block * 0.5, y + course * 0.7, 2.4, 0.6);
      }
      if (v > 0.83) {
        c.fillStyle = kind === 'roof' ? '#f6cb8c3d' : '#fcf1d369';
        c.fillRect(x + 2, y + 2, 1.2, 0.7);
      }
    }
  // Weathering belongs to each plane: sheltered eaves and dusty foot courses.
  if (kind === 'limestone') {
    const shade = c.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, '#59462d35');
    shade.addColorStop(Math.min(0.28, 5 / h), '#59462d00');
    shade.addColorStop(0.72, '#59462d00');
    shade.addColorStop(1, '#78603c35');
    c.fillStyle = shade;
    c.fillRect(0, 0, w, h);
  }
  if (panels.size >= 384) panels.delete(panels.keys().next().value ?? '');
  panels.set(key, canvas);
  return canvas;
}
/** One cached image per planar face replaces hundreds of per-frame mortar strokes. */
export function materialFace(
  r: DrawingSurface,
  topLeft: Point,
  topRight: Point,
  bottomLeft: Point,
  width: number,
  height: number,
  color: string,
  kind: SurfaceKind,
  seed = 0,
): void {
  if (width < 2 || height < 2) return;
  const image = panel(kind, width, height, color, seed),
    c = r.ctx;
  c.save();
  c.transform(
    (topRight.x - topLeft.x) / image.width,
    (topRight.y - topLeft.y) / image.width,
    (bottomLeft.x - topLeft.x) / image.height,
    (bottomLeft.y - topLeft.y) / image.height,
    topLeft.x,
    topLeft.y,
  );
  c.drawImage(image, 0, 0);
  c.restore();
}
export function isMasonry(color: string, w: number, d: number, h: number): boolean {
  if (w < 0.3 || d < 0.3 || h < 14 || !/^#[\da-f]{6}$/i.test(color)) return false;
  const red = parseInt(color.slice(1, 3), 16),
    green = parseInt(color.slice(3, 5), 16),
    blue = parseInt(color.slice(5, 7), 16);
  return red > 150 && green > 135 && blue > 90 && red - blue < 75;
}
