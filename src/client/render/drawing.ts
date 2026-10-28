import { arrowLoop } from './architecture.js';
import { isMasonry, materialFace, tint } from './materials.js';
import type { BuildingType, MapDefinition, Point, Team, Terrain } from '../../game/index.js';
import { DEFAULT_MAP, SIZE, encodeMap, terrain } from '../../game/index.js';
export const teamColor = (team: Team): string =>
  ({ player: '#23898a', player2: '#456fbd', enemy: '#b8523f' })[team];
const hash = (x: number, y: number): number => {
  const a = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return a - Math.floor(a);
};
export class DrawingSurface {
  map: MapDefinition = DEFAULT_MAP;
  private mapIdentity = encodeMap(DEFAULT_MAP);
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera: { x: number; y: number; zoom: number };
  tiles: { x: number; y: number; t: Terrain; h: number }[];
  terrainCache: HTMLCanvasElement | null;
  visualPositions: Map<number, Point>;
  width: number;
  height: number;
  hover: Point | null;
  buildType: BuildingType | null;
  valid: boolean;
  selected: Set<number>;
  selection: { a: Point; b: Point } | null;
  activeTeamColor: string = '';
  /** Last roof in the current building; reused by fire so anchors follow the painted geometry. */
  roofPlane = { valid: false, x: 0, y: 0, w: 0, d: 0, rise: 0, base: 0 };
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D rendering is unavailable.');
    this.ctx = context;
    this.camera = { x: 16.5, y: 44.5, zoom: 0.83 };
    this.tiles = Array.from({ length: SIZE * SIZE }, (_, i) => {
      const x = i % SIZE,
        y = Math.floor(i / SIZE);
      return { x, y, t: terrain(x, y), h: hash(x, y) };
    });
    this.terrainCache = null;
    this.visualPositions = new Map();
    this.width = 0;
    this.height = 0;
    this.hover = null;
    this.buildType = null;
    this.valid = false;
    this.selected = new Set();
    this.selection = null;
  }
  setMap(map: MapDefinition): boolean {
    const identity = encodeMap(map);
    this.map = map;
    if (identity === this.mapIdentity) return false;
    this.mapIdentity = identity;
    this.tiles = this.tiles.map((tile) => ({ ...tile, t: terrain(tile.x, tile.y, map) }));
    this.terrainCache = null;
    return true;
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2),
      r = this.canvas.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const pixelWidth = Math.max(1, Math.round(r.width * dpr)),
      pixelHeight = Math.max(1, Math.round(r.height * dpr));
    if (
      this.width !== r.width ||
      this.height !== r.height ||
      this.canvas.width !== pixelWidth ||
      this.canvas.height !== pixelHeight
    ) {
      this.width = r.width;
      this.height = r.height;
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.ctx.setTransform(pixelWidth / r.width, 0, 0, pixelHeight / r.height, 0, 0);
    }
  }
  project(x: number, y: number, z = 0) {
    const c = this.camera;
    return {
      x: this.width / 2 + (x - y - c.x + c.y) * 32 * c.zoom,
      y: this.height / 2 + (x + y - c.x - c.y) * 16 * c.zoom - z * c.zoom,
    };
  }
  inverse(px: number, py: number) {
    const c = this.camera,
      a = (px - this.width / 2) / (32 * c.zoom),
      b = (py - this.height / 2) / (16 * c.zoom);
    return { x: (a + b) / 2 + c.x, y: (b - a) / 2 + c.y };
  }
  poly(points: Point[], fill: string, stroke?: string) {
    const c = this.ctx;
    c.beginPath();
    points.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = 0.7 * this.camera.zoom;
      c.stroke();
    }
  }
  ground(x: number, y: number, w: number, d: number, fill: string, stroke?: string) {
    this.poly(
      [
        this.project(x, y),
        this.project(x + w, y),
        this.project(x + w, y + d),
        this.project(x, y + d),
      ],
      fill,
      stroke,
    );
  }
  prism(
    x: number,
    y: number,
    w: number,
    d: number,
    h: number,
    top = '#cbb687',
    left = '#b39563',
    right = '#8f754e',
    z = 0,
  ) {
    const stone = isMasonry(top, w, d, h);
    if (stone) {
      top = tint(top, '#f7e9c6', 0.35);
      left = tint(left, '#e3cf9f', 0.2);
      right = tint(right, '#796d56', 0.16);
    }
    const p = (a: number, b: number, c: number) => this.project(a, b, c);
    this.poly(
      [p(x, y + d, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x, y + d, z + h)],
      left,
    );
    this.poly(
      [p(x + w, y, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x + w, y, z + h)],
      right,
    );
    if (stone && this.camera.zoom > 0.48) {
      const seed = Math.floor(x * 3 + y * 5);
      materialFace(
        this,
        p(x, y + d, z + h),
        p(x + w, y + d, z + h),
        p(x, y + d, z),
        w * 32,
        h,
        left,
        'limestone',
        seed,
      );
      materialFace(
        this,
        p(x + w, y, z + h),
        p(x + w, y + d, z + h),
        p(x + w, y, z),
        d * 32,
        h,
        right,
        'limestone',
        seed + 2,
      );
    }
    if (stone && this.camera.zoom > 0.55) {
      this.line(p(x + w, y + d, z + 1), p(x + w, y + d, z + h), '#ead8ae80', 0.8);
      this.line(p(x, y + d, z + 0.5), p(x + w, y + d, z + 0.5), '#5b493a50', 1.2);
      this.line(p(x + w, y, z + 0.5), p(x + w, y + d, z + 0.5), '#4c413448', 1.2);
    }
    this.poly(
      [p(x, y, z + h), p(x + w, y, z + h), p(x + w, y + d, z + h), p(x, y + d, z + h)],
      top,
    );
  }
  line(a: Point, b: Point, color: string, width = 1) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.strokeStyle = color;
    c.lineWidth = width * this.camera.zoom;
    c.stroke();
  }
  ellipse(x: number, y: number, rx: number, ry: number, color: string) {
    const c = this.ctx;
    c.beginPath();
    c.ellipse(x, y, rx * this.camera.zoom, ry * this.camera.zoom, 0, 0, Math.PI * 2);
    c.fillStyle = color;
    c.fill();
  }
  roof(x: number, y: number, w: number, d: number, h: number, z: number, color = '#a55435') {
    const roof = this.roofPlane;
    roof.valid = true;
    roof.x = x;
    roof.y = y;
    roof.w = w;
    roof.d = d;
    roof.rise = h;
    roof.base = z;
    const p = (a: number, b: number, c: number) => this.project(a, b, c),
      light = tint(color, '#e8ab70', 0.38),
      shade = tint(color, '#3e3027', 0.18);
    this.poly(
      [p(x, y, z), p(x + w, y, z), p(x + w, y + d / 2, z + h), p(x, y + d / 2, z + h)],
      light,
    );
    this.poly(
      [p(x, y + d, z), p(x + w, y + d, z), p(x + w, y + d / 2, z + h), p(x, y + d / 2, z + h)],
      color,
    );
    if (this.camera.zoom > 0.45) {
      materialFace(
        this,
        p(x, y + d / 2, z + h),
        p(x + w, y + d / 2, z + h),
        p(x, y, z),
        w * 32,
        h + d * 8,
        light,
        'roof',
        1,
      );
      materialFace(
        this,
        p(x, y + d / 2, z + h),
        p(x + w, y + d / 2, z + h),
        p(x, y + d, z),
        w * 32,
        h + d * 8,
        color,
        'roof',
        2,
      );
    }
    this.poly([p(x + w, y, z), p(x + w, y + d, z), p(x + w, y + d / 2, z + h)], shade);
    this.line(p(x, y + d, z), p(x + w, y + d, z), '#59422e', 2.5);
    this.line(p(x + w, y, z), p(x + w, y + d / 2, z + h), '#66452e', 2);
    this.line(p(x + w, y + d, z), p(x + w, y + d / 2, z + h), '#63442e', 2);
    this.line(p(x, y + d / 2, z + h + 1), p(x + w, y + d / 2, z + h + 1), '#d19a5a', 3);
    this.line(p(x, y + d / 2, z + h + 2), p(x + w, y + d / 2, z + h + 2), '#edbd7a', 0.7);
    if (this.camera.zoom > 0.7) {
      for (let i = 0.2; i < w; i += 0.22)
        this.line(p(x + i, y + d / 2, z + h), p(x + i, y + d / 2, z + h + 3), '#7f5639', 0.8);
      this.line(p(x + w, y + d * 0.5, z + 2), p(x + w, y + d * 0.5, z + h - 3), '#4d3c2c', 1.5);
    }
  }
  banner(x: number, y: number, z: number, time: number, color = this.activeTeamColor || '#1d8183') {
    const p = this.project(x, y, z),
      q = this.project(x, y, z + 27);
    this.line(p, q, '#50412c', 1.5);
    const wave = Math.sin(time * 3 + x) * 2 * this.camera.zoom;
    this.poly(
      [
        q,
        { x: q.x + 17 * this.camera.zoom, y: q.y + 3 * this.camera.zoom + wave },
        { x: q.x + 17 * this.camera.zoom, y: q.y + 14 * this.camera.zoom + wave },
        { x: q.x, y: q.y + 11 * this.camera.zoom },
      ],
      color,
    );
    this.line(
      q,
      { x: q.x + 17 * this.camera.zoom, y: q.y + 3 * this.camera.zoom + wave },
      tint(color, '#f1ddb0', 0.4),
      0.8,
    );
    this.line(
      { x: q.x + 7 * this.camera.zoom, y: q.y + 3 * this.camera.zoom },
      { x: q.x + 7 * this.camera.zoom, y: q.y + 12 * this.camera.zoom },
      '#eec574',
      1.5,
    );
  }
  tower(x: number, y: number, size: number = 1, h: number = 55, time: number | null = 0) {
    this.prism(x - 0.04, y - 0.04, size + 0.08, size + 0.08, 5, '#d6c39b', '#a99672', '#7e7159');
    this.prism(x, y, size, size, h, '#e6d5ae', '#cbb88f', '#9e8d6f');
    // A projecting belt has visible front/right facets, never an opaque diamond through the shaft.
    const belt = h * 0.34,
      p = (u: number, v: number, z: number) => this.project(u, v, z);
    this.poly(
      [
        p(x - 0.035, y + size + 0.035, belt),
        p(x + size + 0.035, y + size + 0.035, belt),
        p(x + size + 0.035, y + size + 0.035, belt + 3),
        p(x - 0.035, y + size + 0.035, belt + 3),
      ],
      '#d0bc93',
    );
    this.poly(
      [
        p(x + size + 0.035, y - 0.035, belt),
        p(x + size + 0.035, y + size + 0.035, belt),
        p(x + size + 0.035, y + size + 0.035, belt + 3),
        p(x + size + 0.035, y - 0.035, belt + 3),
      ],
      '#a38c64',
    );
    this.line(
      p(x - 0.035, y + size + 0.035, belt + 3),
      p(x + size + 0.035, y + size + 0.035, belt + 3),
      '#ece0ba',
      0.7,
    );
    this.prism(
      x - 0.08,
      y - 0.08,
      size + 0.16,
      size + 0.16,
      6,
      '#dbcda7',
      '#c5b18a',
      '#a28a61',
      h - 5,
    );
    this.prism(x + 0.1, y + 0.1, size - 0.2, size - 0.2, 1, '#9b8a6a', '#9b8a6a', '#9b8a6a', h + 1);
    for (let i = 0; i < 3; i++) {
      const a = (i * size) / 3;
      this.prism(x + a, y - 0.05, size / 5, 0.16, 9, '#e2d1a7', '#cdb891', '#aa9169', h);
      this.prism(x + a, y + size - 0.12, size / 5, 0.18, 9, '#e2d1a7', '#cdb891', '#aa9169', h);
      this.prism(x + size - 0.12, y + a, 0.18, size / 5, 9, '#e2d1a7', '#cdb891', '#aa9169', h);
    }
    if (this.camera.zoom > 0.5) {
      arrowLoop(this, x + size * 0.47, y + size + 0.005, h * 0.53);
      arrowLoop(this, x + size + 0.005, y + size * 0.47, h * 0.57, 'right');
      if (h > 65) {
        arrowLoop(this, x + size * 0.47, y + size + 0.005, h * 0.26);
        arrowLoop(this, x + size + 0.005, y + size * 0.47, h * 0.29, 'right');
      }
    }
    this.line(
      this.project(x, y + size, h - 6),
      this.project(x + size, y + size, h - 6),
      '#776849',
      1.8,
    );
    this.line(
      this.project(x + size, y, h - 6),
      this.project(x + size, y + size, h - 6),
      '#5f5743',
      1.8,
    );
    if (time !== null) this.banner(x + size * 0.5, y + size * 0.5, h + 8, time);
  }
  tree(x: number, y: number, time = 0) {
    const p = this.project(x + 0.5, y + 0.5),
      z = this.camera.zoom,
      h = 36 + hash(x, y) * 11,
      c = this.ctx,
      tip = { x: p.x - 3 * z, y: p.y - h * z };
    this.ellipse(p.x + 10 * z, p.y + 4 * z, 18, 5, '#514b3028');
    c.save();
    c.beginPath();
    c.moveTo(p.x, p.y);
    c.quadraticCurveTo(p.x + 3 * z, p.y - h * 0.55 * z, tip.x, tip.y);
    c.strokeStyle = '#735233';
    c.lineWidth = 4 * z;
    c.stroke();
    c.beginPath();
    c.moveTo(p.x - 1 * z, p.y - 1 * z);
    c.quadraticCurveTo(p.x + 1 * z, p.y - h * 0.55 * z, tip.x - 1 * z, tip.y);
    c.strokeStyle = '#bd9962';
    c.lineWidth = 1.3 * z;
    c.stroke();
    if (z > 0.6)
      for (let i = 6; i < h; i += 5)
        this.line(
          { x: p.x - 1 * z, y: p.y - i * z },
          { x: p.x + 2 * z, y: p.y - (i + 1) * z },
          '#695136',
          0.7,
        );
    for (let i = 0; i < 9; i++) {
      const angle = (i * Math.PI * 2) / 9 + hash(x, y) * 0.5,
        length = i % 2 ? 21 : 26,
        sway = Math.sin(time * 0.8 + i + x) * 0.8;
      const end = {
          x: tip.x + (Math.cos(angle) * length + sway) * z,
          y: tip.y + (Math.sin(angle) * length * 0.4 + 9) * z,
        },
        mid = {
          x: tip.x + Math.cos(angle) * length * 0.5 * z,
          y: tip.y + (Math.sin(angle) * length * 0.2 - 7) * z,
        };
      c.beginPath();
      c.moveTo(tip.x, tip.y);
      c.quadraticCurveTo(mid.x - 3 * z, mid.y - 2 * z, end.x, end.y);
      c.quadraticCurveTo(mid.x + 4 * z, mid.y + 5 * z, tip.x, tip.y);
      c.fillStyle = i % 3 === 0 ? '#799052' : i % 2 ? '#4c7147' : '#365e40';
      c.fill();
      c.beginPath();
      c.moveTo(tip.x, tip.y);
      c.quadraticCurveTo(mid.x, mid.y, end.x, end.y);
      c.strokeStyle = '#a4ad6c88';
      c.lineWidth = 0.6 * z;
      c.stroke();
      if (z > 0.65)
        for (const t of [0.35, 0.56, 0.74]) {
          const q = {
            x: (1 - t) ** 2 * tip.x + 2 * (1 - t) * t * mid.x + t * t * end.x,
            y: (1 - t) ** 2 * tip.y + 2 * (1 - t) * t * mid.y + t * t * end.y,
          };
          this.line(q, { x: q.x + Math.sin(angle) * 3 * z, y: q.y + 4 * z }, '#375d3a', 0.7);
        }
    }
    for (const dx of [-3, 2, 5]) this.ellipse(tip.x + dx * z, tip.y + 5 * z, 1.8, 3, '#a97535');
    c.restore();
  }
}
