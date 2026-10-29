import type { BuildingType, GameState, Point } from '../../game/index.js';
import { TYPES, terrain } from '../../game/index.js';
import { WELL_RANGE } from '../../game/fire.js';
import { staticPositionClear } from '../../game/spatial.js';
import { building, buildingShadow } from './buildings.js';
import { DrawingSurface, teamColor } from './drawing.js';
import { EnvironmentScene } from './environment.js';
import { visualTime as presentationTime } from './clock.js';
import { drawCombatEffects } from './combat-effects.js';
import { drawTerrain } from './terrain.js';
import { unit, unitGround, villager } from './units.js';
import {
  buildingFootprint,
  garrisonPosition,
  sortByFootprint,
  visualUnitPosition,
  type DepthItem,
} from './depth.js';
export class Renderer extends DrawingSurface {
  selectedBuilding: number | null = null;
  rallyBuilding: number | null = null;
  private environment = new EnvironmentScene();
  private minimapGround: HTMLCanvasElement | null = null;
  private syncMap(s: GameState) {
    if (this.setMap(s.map)) {
      this.minimapGround = null;
      this.environment = new EnvironmentScene(s.map);
    }
  }
  render(s: GameState) {
    this.syncMap(s);
    this.resize();
    const c = this.ctx,
      z = this.camera.zoom;
    c.clearRect(0, 0, this.width, this.height);
    c.fillStyle = '#b79b66';
    c.fillRect(0, 0, this.width, this.height);
    const gradient = c.createRadialGradient(
      this.width * 0.5,
      this.height * 0.4,
      10,
      this.width * 0.5,
      this.height * 0.4,
      this.width * 0.8,
    );
    gradient.addColorStop(0, '#dec18a');
    gradient.addColorStop(1, '#bda06c');
    c.fillStyle = gradient;
    c.fillRect(0, 0, this.width, this.height);
    drawTerrain(this);
    const decor: (DepthItem & { draw: () => void })[] = [];
    const garrisons = new Map<number, typeof s.units>();
    for (const u of s.units) {
      if (!u.garrisonId) continue;
      const occupants = garrisons.get(u.garrisonId) || [];
      occupants.push(u);
      garrisons.set(u.garrisonId, occupants);
    }
    for (const occupants of garrisons.values()) occupants.sort((a, b) => a.id - b.id);
    const environment = this.environment.visible(this, s),
      visualTime = presentationTime(s);
    this.environment.water(this, environment, visualTime);
    for (const detail of environment)
      if (detail.kind !== 'water')
        decor.push({
          x: detail.x,
          y: detail.y,
          width: 0,
          height: 0,
          key: `terrain:${detail.x}:${detail.y}:${detail.kind}`,
          draw: () => this.environment.draw(this, detail, visualTime),
        });
    for (const b of s.buildings) {
      const p = this.project(b.x, b.y);
      if (p.x < -250 || p.x > this.width + 250 || p.y < -120 || p.y > this.height + 230) continue;
      buildingShadow(this, b);
      decor.push({
        ...buildingFootprint(b),
        key: `building:${b.id}`,
        draw: () => {
          building(this, b, s);
          const occupants = garrisons.get(b.id) || [];
          const slots = occupants.map((u, index) => ({ u, position: garrisonPosition(b, index) }));
          slots.sort(
            (a, b) => a.position.x + a.position.y - b.position.x - b.position.y || a.u.id - b.u.id,
          );
          for (const { u, position } of slots) unit(this, u, s, position);
        },
      });
    }
    for (const u of s.units) {
      if (u.garrisonId) continue;
      const visual = visualUnitPosition(u, this.visualPositions);
      const p = this.project(visual.x, visual.y);
      if (p.x < -100 || p.x > this.width + 100 || p.y < -100 || p.y > this.height + 140) continue;
      unitGround(this, u);
      decor.push({
        x: visual.x,
        y: visual.y,
        width: 0,
        height: 0,
        key: `unit:${u.id}`,
        draw: () => unit(this, u, s),
      });
    }
    const troopBuckets = new Map<string, Point[]>();
    for (const u of s.units) {
      if (u.garrisonId) continue;
      const visual = visualUnitPosition(u, this.visualPositions),
        key = `${Math.floor(visual.x)}:${Math.floor(visual.y)}`;
      const bucket = troopBuckets.get(key) || [];
      bucket.push(visual);
      troopBuckets.set(key, bucket);
    }
    const troopNear = (x: number, y: number): boolean => {
      for (let bx = Math.floor(x - 0.65); bx <= Math.floor(x + 0.65); bx++)
        for (let by = Math.floor(y - 0.65); by <= Math.floor(y + 0.65); by++)
          if (troopBuckets.get(`${bx}:${by}`)?.some((p) => Math.hypot(p.x - x, p.y - y) < 0.65))
            return true;
      return false;
    };
    for (const b of s.buildings) {
      if (b.fire || !TYPES[b.type].workers || b.paused || b.active === 0) continue;
      const bp = this.project(b.x, b.y);
      if (bp.x < -160 || bp.x > this.width + 160 || bp.y < -100 || bp.y > this.height + 160)
        continue;
      const count = Math.min(2, TYPES[b.type].workers ?? 0);
      for (let i = 0; i < count; i++) {
        const a = s.time * 0.35 + b.id + i * 2,
          x = b.x + TYPES[b.type].size + 0.2 + Math.sin(a) * 0.7,
          y = b.y + 0.6 + i * 0.65 + Math.cos(a) * 0.4;
        // Cosmetic workers avoid solid terrain, structure edges, and troop bodies.
        if (
          !staticPositionClear(s, { x, y }, 0.2) ||
          s.buildings.some(
            (other) =>
              x > other.x - 0.25 &&
              y > other.y - 0.25 &&
              x < other.x + TYPES[other.type].size + 0.25 &&
              y < other.y + TYPES[other.type].size + 0.25,
          ) ||
          troopNear(x, y)
        )
          continue;
        decor.push({
          x,
          y,
          width: 0,
          height: 0,
          key: `worker:${b.id}:${i}`,
          draw: () => villager(this, x, y, b, s, i),
        });
      }
    }
    for (const d of sortByFootprint(decor)) d.draw();
    if (this.buildType && this.hover) {
      const t = TYPES[this.buildType],
        x = Math.floor(this.hover.x),
        y = Math.floor(this.hover.y),
        color = this.valid ? '#73b4a080' : '#cc6d5780';
      this.ground(x, y, t.size, t.size, color, this.valid ? '#c7e8b6' : '#ffd6be');
      this.prism(
        x + 0.05,
        y + 0.05,
        t.size - 0.1,
        t.size - 0.1,
        22,
        this.valid ? '#a6c7a84d' : '#cc79654d',
        this.valid ? '#77aa8555' : '#b9675355',
        '#547a7255',
      );
    }
    const inspected = s.buildings.find((b) => b.id === this.selectedBuilding);
    const well =
      inspected?.type === 'well'
        ? { x: inspected.x + 0.5, y: inspected.y + 0.5 }
        : this.buildType === 'well' && this.hover
          ? { x: Math.floor(this.hover.x) + 0.5, y: Math.floor(this.hover.y) + 0.5 }
          : null;
    if (well) {
      this.poly(
        Array.from({ length: 64 }, (_, i) =>
          this.project(
            well.x + Math.cos((i * Math.PI) / 32) * WELL_RANGE,
            well.y + Math.sin((i * Math.PI) / 32) * WELL_RANGE,
          ),
        ),
        '#62b6bd12',
        '#8fd4d6aa',
      );
    }
    if (inspected && ['barracks', 'mercenary', 'siege'].includes(inspected.type)) {
      const point =
        this.rallyBuilding === inspected.id
          ? (this.hover ?? inspected.rallyPoint)
          : inspected.rallyPoint;
      if (point) {
        const q = this.project(point.x, point.y),
          start = this.project(
            inspected.x + TYPES[inspected.type].size / 2,
            inspected.y + TYPES[inspected.type].size / 2,
          );
        c.save();
        c.setLineDash([5 * z, 4 * z]);
        this.line(start, q, '#e8d18eb0', 1.5);
        c.restore();
        this.line(q, { x: q.x, y: q.y - 28 * z }, '#f5dfa5', 2);
        this.poly(
          [
            { x: q.x, y: q.y - 28 * z },
            { x: q.x + 16 * z, y: q.y - 22 * z },
            { x: q.x, y: q.y - 17 * z },
          ],
          teamColor(inspected.team),
        );
        this.ellipse(q.x, q.y, 7, 3, '#efdc9c70');
      }
    }
    drawCombatEffects(this, s);
    if (this.selection) {
      const { a, b } = this.selection;
      c.fillStyle = '#e4d9a418';
      c.strokeStyle = '#f0db9b';
      c.lineWidth = 1;
      c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    const vignette = c.createRadialGradient(
      this.width / 2,
      this.height / 2,
      this.height * 0.3,
      this.width / 2,
      this.height / 2,
      this.width * 0.7,
    );
    vignette.addColorStop(0, '#251d1300');
    vignette.addColorStop(1, '#251d133b');
    c.fillStyle = vignette;
    c.fillRect(0, 0, this.width, this.height);
  }
  hitTestBuilding(state: GameState, px: number, py: number) {
    // Projected volume selection makes tower bodies and roofs clickable as well as foundations.
    const heights: Partial<Record<BuildingType, number>> = {
      keep: 105,
      tower: 112,
      house: 48,
      wall: 39,
      gate: 72,
      farm: 45,
      barracks: 66,
      market: 39,
      lumber: 39,
      quarry: 52,
    };
    const ordered = sortByFootprint(
      state.buildings.map((b) => ({
        ...buildingFootprint(b),
        key: `building:${b.id}`,
        building: b,
      })),
    );
    for (const { building: b } of ordered.reverse()) {
      const size = TYPES[b.type].size;
      const points = [0, heights[b.type] || 62]
        .flatMap((z) => [
          this.project(b.x, b.y, z),
          this.project(b.x + size, b.y, z),
          this.project(b.x + size, b.y + size, z),
          this.project(b.x, b.y + size, z),
        ])
        .sort((a, b) => a.x - b.x || a.y - b.y);
      const cross = (o: Point, a: Point, b: Point) =>
        (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
      const lower: Point[] = [],
        upper: Point[] = [];
      for (const p of points) {
        while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
          lower.pop();
        lower.push(p);
      }
      for (const p of [...points].reverse()) {
        while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
          upper.pop();
        upper.push(p);
      }
      const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
      let inside = false;
      for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
        const a = hull[i],
          c = hull[j];
        if (a.y > py !== c.y > py && px < ((c.x - a.x) * (py - a.y)) / (c.y - a.y) + a.x)
          inside = !inside;
      }
      if (inside) return b;
    }
    return null;
  }
  minimap(canvas: HTMLCanvasElement, s: GameState) {
    this.syncMap(s);
    const c = canvas.getContext('2d');
    if (!c) return;
    const w = canvas.width,
      h = canvas.height,
      k = w / s.map.width;
    if (!this.minimapGround || this.minimapGround.width !== w || this.minimapGround.height !== h) {
      const cache = document.createElement('canvas');
      cache.width = w;
      cache.height = h;
      const context = cache.getContext('2d');
      if (!context) return;
      const pixels = context.createImageData(w, h);
      const colors = {
        void: [211, 180, 123],
        sand: [211, 180, 123],
        water: [67, 143, 148],
        trees: [102, 128, 71],
        stone: [181, 165, 134],
        grass: [149, 170, 97],
        iron: [130, 123, 99],
        pitch: [81, 77, 56],
      };
      // Sample at minimap resolution: map area must not dictate Canvas API calls.
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const color = colors[terrain(Math.floor(x / k), Math.floor(y / k), s.map)];
          const offset = (y * w + x) * 4;
          pixels.data[offset] = color[0];
          pixels.data[offset + 1] = color[1];
          pixels.data[offset + 2] = color[2];
          pixels.data[offset + 3] = 255;
        }
      context.putImageData(pixels, 0, 0);
      this.minimapGround = cache;
    }
    c.drawImage(this.minimapGround, 0, 0);
    for (const b of s.buildings) {
      c.fillStyle = teamColor(b.team);
      c.fillRect(b.x * k, b.y * k, TYPES[b.type].size * k, TYPES[b.type].size * k);
    }
    for (const u of s.units) {
      c.fillStyle = teamColor(u.team);
      c.fillRect(u.x * k - 1, u.y * k - 1, 2.5, 2.5);
    }
    const corners = [
      [0, 0],
      [this.width, 0],
      [this.width, this.height],
      [0, this.height],
    ].map(([x, y]) => this.inverse(x, y));
    c.beginPath();
    corners.forEach((p, i) => (i ? c.lineTo(p.x * k, p.y * k) : c.moveTo(p.x * k, p.y * k)));
    c.closePath();
    c.strokeStyle = '#f4e5b8';
    c.lineWidth = 1;
    c.stroke();
  }
}
