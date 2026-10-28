import { SIZE, terrain } from '../../game/index.js';
import type { Point } from '../../game/index.js';
import { DrawingSurface } from './drawing.js';
import { environmentNoise as noise, regionContours, smoothNoise } from './environment-geometry.js';

function regionPath(r: DrawingSurface, points: Point[]): void {
  const c = r.ctx,
    p = points.map((point) => r.project(point.x, point.y));
  c.beginPath();
  const last = p[p.length - 1],
    first = p[0];
  c.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length];
    c.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  c.closePath();
}
function paintSand(r: DrawingSurface): void {
  const c = r.ctx,
    gradient = c.createLinearGradient(200, 0, r.width * 0.82, r.height);
  gradient.addColorStop(0, '#efd396');
  gradient.addColorStop(0.45, '#dec087');
  gradient.addColorStop(1, '#cbaa70');
  r.ground(0, 0, SIZE, SIZE, '#dec087');
  // The world is a single continuous surface; texture never repeats on tile boundaries.
  c.save();
  regionPath(r, [
    { x: 0, y: 0 },
    { x: SIZE, y: 0 },
    { x: SIZE, y: SIZE },
    { x: 0, y: SIZE },
  ]);
  c.clip();
  c.fillStyle = gradient;
  c.fillRect(0, 0, r.width, r.height);
  for (let y = -6; y < SIZE + 8; y += 2.8) {
    const offset = noise(y, 22) * 5;
    c.beginPath();
    for (let x = -8; x < SIZE + 8; x += 0.4) {
      const p = r.project(x, y + Math.sin(x * 0.14 + y * 0.8) * 1.5 + offset);
      if (x === -8) c.moveTo(p.x, p.y);
      else c.lineTo(p.x, p.y);
    }
    c.strokeStyle = '#94672d10';
    c.lineWidth = 11;
    c.stroke();
    c.translate(0, -3);
    c.strokeStyle = '#fff0bc25';
    c.lineWidth = 2;
    c.stroke();
    c.translate(0, 3);
  }
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const h = smoothNoise(x * 0.19, y * 0.19);
      if (h > 0.5) {
        const p = r.project(x + 0.5, y + 0.5);
        const light = c.createRadialGradient(p.x, p.y, 1, p.x, p.y, 62);
        light.addColorStop(0, `rgba(255,233,177,${(h - 0.5) * 0.23})`);
        light.addColorStop(1, '#ffe6aa00');
        c.fillStyle = light;
        c.fillRect(p.x - 62, p.y - 62, 124, 124);
      }
      for (let i = 0; i < 14; i++) {
        const p = r.project(x + noise(x * 19 + i, y * 3), y + noise(y * 7 + i, x * 5));
        c.fillStyle = i % 4 === 0 ? '#fff1c23b' : i % 3 === 0 ? '#98714428' : '#a27e4820';
        c.fillRect(p.x, p.y, 0.6 + noise(i + x, y) * 1.15, 0.45 + noise(i + y, x) * 0.6);
      }
      if (noise(x + 7, y) > 0.88) {
        const p = r.project(x + 0.4, y + 0.5);
        c.strokeStyle = '#9f793e2b';
        c.lineWidth = 0.6;
        c.beginPath();
        c.moveTo(p.x - 8, p.y);
        c.quadraticCurveTo(p.x - 1, p.y - 2, p.x + 8, p.y + 1);
        c.stroke();
      }
    }
  c.restore();
}
function paintFertileGround(r: DrawingSurface): void {
  const c = r.ctx;
  for (const points of regionContours(SIZE, (x, y) => terrain(x, y, r.map) === 'grass')) {
    regionPath(r, points);
    c.lineJoin = 'round';
    c.strokeStyle = '#b8b77680';
    c.lineWidth = 29;
    c.stroke();
    c.strokeStyle = '#a0aa6290';
    c.lineWidth = 15;
    c.stroke();
    const gradient = c.createLinearGradient(0, 0, 0, r.height);
    gradient.addColorStop(0, '#819e53');
    gradient.addColorStop(0.5, '#8ba95b');
    gradient.addColorStop(1, '#a4b166');
    c.fillStyle = gradient;
    c.fill();
  }
  for (const { x, y, t } of r.tiles) {
    if (t !== 'grass' && t !== 'trees') continue;
    const p = r.project(x + 0.5, y + 0.5);
    if (t === 'trees') {
      const soft = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 31);
      soft.addColorStop(0, '#929f534c');
      soft.addColorStop(1, '#929f5300');
      c.fillStyle = soft;
      c.fillRect(p.x - 31, p.y - 31, 62, 62);
    }
    for (let i = 0; i < (t === 'grass' ? 21 : 8); i++) {
      const q = r.project(x + noise(x * 13 + i, y), y + noise(y * 17 + i, x));
      const v = noise(i + x * 2, y);
      c.fillStyle = v > 0.6 ? '#526f393f' : v > 0.3 ? '#bfc77f5f' : '#758e494d';
      c.beginPath();
      c.ellipse(q.x, q.y, 1.3 + v * 1.5, 0.55 + v * 0.4, -0.3, 0, Math.PI * 2);
      c.fill();
    }
  }
}
function paintWater(r: DrawingSurface): void {
  const c = r.ctx;
  for (const points of regionContours(SIZE, (x, y) => terrain(x, y, r.map) === 'water')) {
    regionPath(r, points);
    c.lineJoin = 'round';
    c.strokeStyle = '#b4b47e9c';
    c.lineWidth = 30;
    c.stroke();
    c.strokeStyle = '#e3d6a6';
    c.lineWidth = 19;
    c.stroke();
    c.strokeStyle = '#b4c9a4';
    c.lineWidth = 12;
    c.stroke();
    const projected = points.map((p) => r.project(p.x, p.y)),
      top = Math.min(...projected.map((p) => p.y)),
      bottom = Math.max(...projected.map((p) => p.y));
    const gradient = c.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, '#73b9ad');
    gradient.addColorStop(0.45, '#3d9698');
    gradient.addColorStop(1, '#60a99b');
    c.fillStyle = gradient;
    c.fill();
    c.save();
    c.clip();
    for (const { x, y, t } of r.tiles) {
      if (t !== 'water') continue;
      const p = r.project(x + 0.5, y + 0.5);
      let depth = 5;
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++)
          if (terrain(x + dx, y + dy, r.map) !== 'water')
            depth = Math.min(depth, Math.hypot(dx, dy));
      if (depth > 1.2) {
        const pool = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 42 + depth * 6);
        pool.addColorStop(0, '#1e5c7590');
        pool.addColorStop(1, '#235c7600');
        c.fillStyle = pool;
        c.fillRect(p.x - 74, p.y - 74, 148, 148);
      }
      for (let i = 0; i < 3; i++) {
        const a = r.project(x + 0.12 + i * 0.23, y + 0.15 + noise(x + i, y) * 0.65);
        c.strokeStyle = i % 2 ? '#b9e4cb2b' : '#cdf0d532';
        c.lineWidth = 0.65;
        c.beginPath();
        c.moveTo(a.x - 5, a.y);
        c.quadraticCurveTo(a.x, a.y - 1.8, a.x + 7, a.y + 0.4);
        c.stroke();
      }
    }
    c.restore();
    regionPath(r, points);
    c.strokeStyle = '#d0e0b89c';
    c.lineWidth = 1.5;
    c.stroke();
  }
}
function paintResourceSoil(r: DrawingSurface): void {
  const c = r.ctx;
  for (const { x, y, t, h } of r.tiles) {
    if (t !== 'stone' && t !== 'iron' && t !== 'pitch') continue;
    const p = r.project(x + 0.5, y + 0.5),
      gradient = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 29);
    gradient.addColorStop(
      0,
      t === 'iron' ? '#8f60425a' : t === 'pitch' ? '#6e614866' : '#c5baa15b',
    );
    gradient.addColorStop(1, '#ac997300');
    c.fillStyle = gradient;
    c.fillRect(p.x - 29, p.y - 29, 58, 58);
    for (let i = 0; i < 4; i++) {
      const q = r.project(x + noise(x + i, y), y + noise(y + i, x));
      r.ellipse(q.x, q.y, 0.8 + h, 0.45, t === 'iron' ? '#8d735c88' : '#eee0b57a');
    }
  }
  // Worn caravan tracks curve through the valley rather than cutting a tile-shaped road.
  for (let i = 4; i < 42; i += 0.35) {
    const x = 18 + Math.sin(i * 0.32) * 1.8;
    if (terrain(Math.floor(x), Math.floor(i), r.map) !== 'sand') continue;
    const p = r.project(x, i);
    r.ellipse(p.x, p.y, 7, 2.4, '#ac895118');
  }
}
/** All expensive grain, blended borders, shoreline and water depth are rasterized once. */
export function cacheTerrain(r: DrawingSurface): void {
  const cache = document.createElement('canvas');
  cache.width = SIZE * 64;
  cache.height = SIZE * 32 + 2;
  const old = { ctx: r.ctx, width: r.width, height: r.height, camera: r.camera },
    context = cache.getContext('2d');
  if (!context) throw Error('Canvas2D unavailable');
  r.ctx = context;
  r.width = cache.width;
  r.height = SIZE * 32;
  r.camera = { x: SIZE / 2, y: SIZE / 2, zoom: 1 };
  try {
    paintSand(r);
    paintFertileGround(r);
    paintWater(r);
    paintResourceSoil(r);
  } finally {
    Object.assign(r, old);
  }
  r.terrainCache = cache;
}
