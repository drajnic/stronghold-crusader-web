import { terrain } from '../../game/index.js';
import type { Point } from '../../game/index.js';
import { DrawingSurface } from './drawing.js';
import { environmentNoise as noise, regionContours, smoothNoise } from './environment-geometry.js';

type ContourBounds = { minX: number; minY: number; maxX: number; maxY: number };
const contourBounds = new WeakMap<Point[], ContourBounds>();
/** Projected world bounds, without the map's horizontal origin offset. */
export function terrainContourBounds(points: Point[]): ContourBounds {
  const cached = contourBounds.get(points);
  if (cached) return cached;
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const point of points) {
    const x = (point.x - point.y) * 32,
      y = (point.x + point.y) * 16;
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
  }
  contourBounds.set(points, bounds);
  return bounds;
}
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
  r.ground(0, 0, r.map.width, r.map.width, '#dec087');
  // The world is a single continuous surface; texture never repeats on tile boundaries.
  c.save();
  regionPath(r, [
    { x: 0, y: 0 },
    { x: r.map.width, y: 0 },
    { x: r.map.width, y: r.map.width },
    { x: 0, y: r.map.width },
  ]);
  c.clip();
  c.fillStyle = gradient;
  c.fillRect(0, 0, r.width, r.height);
  const tiles = r.tiles;
  const minX = tiles.reduce<number>((min, tile) => Math.min(min, tile.x), r.map.width) - 8;
  const maxX = tiles.reduce((max, tile) => Math.max(max, tile.x), 0) + 8;
  const minY = tiles.reduce<number>((min, tile) => Math.min(min, tile.y), r.map.height) - 10;
  const maxY = tiles.reduce((max, tile) => Math.max(max, tile.y), 0) + 8;
  // Keep the original world-anchored stripe phase while drawing only this chunk's halo.
  for (let y = -6 + Math.max(0, Math.floor((minY + 6) / 2.8)) * 2.8; y < maxY; y += 2.8) {
    const offset = noise(y, 22) * 5;
    c.beginPath();
    const stripeStart = Math.floor(minX / 0.4) * 0.4;
    for (let x = stripeStart; x < maxX; x += 0.4) {
      const p = r.project(x, y + Math.sin(x * 0.14 + y * 0.8) * 1.5 + offset);
      if (x === stripeStart) c.moveTo(p.x, p.y);
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
  for (const { x, y } of r.tiles) {
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
  for (const points of r.terrainContours!.grass) {
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
  for (const points of r.terrainContours!.water) {
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
    const bounds = terrainContourBounds(points),
      top = bounds.minY,
      bottom = bounds.maxY;
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
      if (
        p.x < bounds.minX + r.map.width * 32 - 74 ||
        p.x > bounds.maxX + r.map.width * 32 + 74 ||
        p.y < bounds.minY - 74 ||
        p.y > bounds.maxY + 74
      )
        continue;
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
}
/** Projected-world chunks bound raster memory independently of map area. */
export const TERRAIN_CHUNK_SIZE = 512;
export const TERRAIN_CHUNK_LIMIT = 48;
export function terrainChunkBounds(
  width: number,
  height: number,
  mapSize: number,
  camera: { x: number; y: number; zoom: number },
  chunkSize = TERRAIN_CHUNK_SIZE,
) {
  const left = mapSize * 32 + (camera.x - camera.y) * 32 - width / (2 * camera.zoom),
    top = (camera.x + camera.y) * 16 - height / (2 * camera.zoom);
  return {
    minX: Math.max(0, Math.floor(left / chunkSize)),
    maxX: Math.min(
      Math.ceil((mapSize * 64) / chunkSize) - 1,
      Math.floor((left + width / camera.zoom) / chunkSize),
    ),
    minY: Math.max(0, Math.floor(top / chunkSize)),
    maxY: Math.min(
      Math.ceil((mapSize * 32 + 2) / chunkSize) - 1,
      Math.floor((top + height / camera.zoom) / chunkSize),
    ),
  };
}
export function terrainRasterScale(width: number, height: number, zoom: number): number {
  let scale = 1;
  while (
    (Math.ceil(width / zoom / (TERRAIN_CHUNK_SIZE * scale)) + 1) *
      (Math.ceil(height / zoom / (TERRAIN_CHUNK_SIZE * scale)) + 1) >
    TERRAIN_CHUNK_LIMIT
  )
    scale *= 2;
  return scale;
}
export function drawTerrain(r: DrawingSurface): void {
  if (!r.terrainContours)
    r.terrainContours = {
      grass: regionContours(r.map.width, (x, y) => terrain(x, y, r.map) === 'grass'),
      water: regionContours(r.map.width, (x, y) => terrain(x, y, r.map) === 'water'),
    };
  // Coarser raster levels keep the visible working set resident on large displays.
  const scale = terrainRasterScale(r.width, r.height, r.camera.zoom);
  const chunkSize = TERRAIN_CHUNK_SIZE * scale;
  const bounds = terrainChunkBounds(r.width, r.height, r.map.width, r.camera, chunkSize),
    origin = r.project(0, 0),
    z = r.camera.zoom;
  for (let y = bounds.minY; y <= bounds.maxY; y++)
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const key = `${scale}:${x}:${y}`;
      let canvas = r.terrainChunks.get(key);
      if (!canvas) canvas = cacheTerrainChunk(r, x, y, scale);
      r.terrainChunks.delete(key);
      r.terrainChunks.set(key, canvas);
      while (r.terrainChunks.size > TERRAIN_CHUNK_LIMIT)
        r.terrainChunks.delete(r.terrainChunks.keys().next().value!);
      // Adjacent chunks share device-pixel-aligned edges. Fractional zoom otherwise
      // blends each image edge with transparency, exposing hairline grid seams.
      const pixelX = r.canvas.width / r.width,
        pixelY = r.canvas.height / r.height,
        left = Math.round((origin.x + (x * chunkSize - r.map.width * 32) * z) * pixelX) / pixelX,
        top = Math.round((origin.y + y * chunkSize * z) * pixelY) / pixelY,
        right =
          Math.round((origin.x + ((x + 1) * chunkSize - r.map.width * 32) * z) * pixelX) / pixelX,
        bottom = Math.round((origin.y + (y + 1) * chunkSize * z) * pixelY) / pixelY;
      r.ctx.drawImage(canvas, left, top, right - left, bottom - top);
    }
}
function cacheTerrainChunk(
  r: DrawingSurface,
  x: number,
  y: number,
  scale: number,
): HTMLCanvasElement {
  const chunkSize = TERRAIN_CHUNK_SIZE * scale;
  const cache = document.createElement('canvas');
  cache.width = TERRAIN_CHUNK_SIZE;
  cache.height = TERRAIN_CHUNK_SIZE;
  const old = {
      ctx: r.ctx,
      width: r.width,
      height: r.height,
      camera: r.camera,
      tiles: r.tiles,
      terrainContours: r.terrainContours,
    },
    context = cache.getContext('2d');
  if (!context) throw Error('Canvas2D unavailable');
  r.ctx = context;
  r.width = r.map.width * 64;
  r.height = r.map.height * 32;
  r.camera = { x: r.map.width / 2, y: r.map.height / 2, zoom: 1 };
  context.scale(1 / scale, 1 / scale);
  context.translate(-x * chunkSize, -y * chunkSize);
  // Texture and depth samples include a halo, preserving soft blends across chunk seams.
  r.tiles = [];
  // Invert the projected chunk rectangle, then visit its bounded tile range.
  // Scanning the full map here makes every cold chunk quadratic in map width.
  const left = x * chunkSize - 150 - r.map.width * 32;
  const right = (x + 1) * chunkSize + 150 - r.map.width * 32;
  const top = y * chunkSize - 150;
  const bottom = (y + 1) * chunkSize + 150;
  const minX = Math.max(0, Math.floor(left / 64 + top / 32) - 1);
  const maxX = Math.min(r.map.width - 1, Math.ceil(right / 64 + bottom / 32));
  const minY = Math.max(0, Math.floor(top / 32 - right / 64) - 1);
  const maxY = Math.min(r.map.height - 1, Math.ceil(bottom / 32 - left / 64));
  for (let ty = minY; ty <= maxY; ty++)
    for (let tx = minX; tx <= maxX; tx++) {
      const tile = old.tiles[ty * r.map.width + tx];
      const p = r.project(tx + 0.5, ty + 0.5);
      if (
        p.x >= left + r.map.width * 32 &&
        p.x <= right + r.map.width * 32 &&
        p.y >= top &&
        p.y <= bottom
      )
        r.tiles.push(tile);
    }
  const intersects = (points: Point[]) => {
    const bounds = terrainContourBounds(points);
    // Quadratic corner rounding stays within the control point hull. The halo
    // includes shoreline strokes and blended soil, so neighbouring chunks agree.
    return (
      bounds.minX <= right && bounds.maxX >= left && bounds.minY <= bottom && bounds.maxY >= top
    );
  };
  r.terrainContours = {
    grass: old.terrainContours!.grass.filter(intersects),
    water: old.terrainContours!.water.filter(intersects),
  };
  try {
    paintSand(r);
    paintFertileGround(r);
    paintWater(r);
    paintResourceSoil(r);
  } finally {
    Object.assign(r, old);
  }
  return cache;
}
