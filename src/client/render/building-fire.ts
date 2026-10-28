import type { Building, BuildingType, GameState } from '../../game/index.js';
import { TYPES } from '../../game/index.js';
import type { DrawingSurface } from './drawing.js';
import { visualTime } from './clock.js';

const fireHeight: Partial<Record<BuildingType, number>> = {
  tower: 72,
  keep: 56,
  stockpile: 10,
  farm: 5,
  wheatfarm: 4,
  hopsfarm: 8,
  garden: 4,
  quarry: 8,
  gallows: 8,
};
let smoke: HTMLCanvasElement | undefined;
function smokeSprite(): HTMLCanvasElement {
  if (smoke) return smoke;
  smoke = document.createElement('canvas');
  smoke.width = smoke.height = 64;
  const c = smoke.getContext('2d')!;
  const gradient = c.createRadialGradient(29, 28, 3, 32, 32, 31);
  gradient.addColorStop(0, '#514a40b0');
  gradient.addColorStop(0.5, '#68605279');
  gradient.addColorStop(1, '#71685900');
  c.fillStyle = gradient;
  c.fillRect(0, 0, 64, 64);
  return smoke;
}
function tongue(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  sway: number,
  fill: string,
): void {
  c.beginPath();
  c.moveTo(-w, 0);
  c.bezierCurveTo(-w * 1.4, -h * 0.38, sway - w * 0.3, -h * 0.55, sway, -h);
  c.bezierCurveTo(sway + w * 0.3, -h * 0.55, w * 1.5, -h * 0.3, w, 0);
  c.quadraticCurveTo(0, h * 0.2, -w, 0);
  c.fillStyle = fill;
  c.fill();
}
/** Analytic particles: fixed count, no emitter state, and the shared pause/snapshot clock. */
export function drawBuildingFire(r: DrawingSurface, b: Building, s: GameState): void {
  const z = r.camera.zoom,
    n = TYPES[b.type].size,
    c = r.ctx,
    t = visualTime(s);
  const count = z < 0.55 ? 3 : 6;
  const height = fireHeight[b.type] ?? 28;
  for (let i = 0; i < count; i++) {
    const u = 0.23 + (i % 3) * 0.27,
      v = 0.25 + Math.floor(i / 3) * 0.48;
    const roof = r.roofPlane;
    // Derive the anchor from the same roof dimensions used by DrawingSurface.roof.
    const x = roof.valid ? roof.x + roof.w * u : b.x + n * u;
    const y = roof.valid ? roof.y + roof.d * v : b.y + n * v;
    const surfaceHeight = roof.valid
      ? roof.base + roof.rise * (1 - Math.abs(v - 0.5) * 2)
      : b.type === 'market'
        ? 38 - v * 16
        : height;
    const q = r.project(x, y, surfaceHeight + 1);

    const phase = t * 5.5 + b.id * 0.7 + i * 2.3;
    const flicker = Math.sin(phase),
      sway = Math.sin(phase * 0.73) * 5;
    if (z > 0.55) {
      const half = 0.1;
      const slope = roof.valid
        ? ((v < 0.5 ? 1 : -1) * roof.rise * 2) / roof.d
        : b.type === 'market'
          ? -8
          : 0;
      r.poly(
        [
          r.project(x - half, y - half, surfaceHeight - half * slope + 0.5),
          r.project(x + half, y - half, surfaceHeight - half * slope + 0.5),
          r.project(x + half, y + half, surfaceHeight + half * slope + 0.5),
          r.project(x - half, y + half, surfaceHeight + half * slope + 0.5),
        ],
        '#54301d55',
      );
    }
    c.save();
    c.translate(q.x, q.y);
    c.scale(z, z);
    tongue(c, 9, 27 + flicker * 6, sway, '#a83e2470');
    tongue(c, 6.8, 23 + flicker * 6, sway, '#e77b30dc');
    tongue(c, 4.3, 16 + flicker * 4, sway * 0.5, '#ffd071f0');
    tongue(c, 2, 8 + flicker * 2, -sway * 0.2, '#fff0b5');
    c.restore();
    for (let j = 0; j < (z < 0.55 ? 1 : 3); j++) {
      const age = (((t * 0.32 + i * 0.173 + j / 3) % 1) + 1) % 1;
      const size = (19 + age * 29) * z;
      c.save();
      c.globalAlpha = Math.sin(age * Math.PI) * 0.66;
      c.drawImage(
        smokeSprite(),
        q.x + (age * 18 + Math.sin(i + age * 5) * 5) * z - size / 2,
        q.y - (22 + age * 65) * z - size / 2,
        size,
        size,
      );
      c.restore();
    }
    if (z > 0.55) {
      const age = (t * 0.7 + i * 0.37) % 1;
      c.save();
      c.globalAlpha = 1 - age;
      r.ellipse(
        q.x + (Math.sin(i + age * 6) * 8 + age * 9) * z,
        q.y - (12 + age * 53) * z,
        0.9,
        1.8,
        '#ffe09b',
      );
      c.restore();
    }
  }
}
