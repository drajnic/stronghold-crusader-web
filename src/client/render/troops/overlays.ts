import type { Point, Unit } from '../../../game/index.js';
import { TROOPS } from '../../../game/index.js';
import type { DrawingSurface } from '../drawing.js';
export function selection(r: DrawingSurface, p: Point, u: Unit, radius: number): void {
  if (!r.selected.has(u.id)) return;
  const c = r.ctx,
    z = r.camera.zoom;
  c.beginPath();
  c.ellipse(p.x, p.y + 2 * z, radius * z, radius * 0.43 * z, 0, 0, Math.PI * 2);
  c.strokeStyle = '#342c24';
  c.lineWidth = 3 * z;
  c.stroke();
  c.strokeStyle = '#ffe6a0';
  c.lineWidth = 1.5 * z;
  c.stroke();
}
export function health(r: DrawingSurface, p: Point, u: Unit, height: number): void {
  const d = TROOPS[u.type];
  if (u.hp >= d.hp && !r.selected.has(u.id)) return;
  const c = r.ctx,
    z = r.camera.zoom;
  c.fillStyle = '#272b29';
  c.fillRect(p.x - 10 * z, p.y - height * z, 20 * z, 4 * z);
  c.fillStyle = u.team === 'enemy' ? '#f09270' : '#a6d185';
  c.fillRect(
    p.x - 9 * z,
    p.y - (height - 1) * z,
    18 * z * Math.max(0, Math.min(1, u.hp / d.hp)),
    2 * z,
  );
}
