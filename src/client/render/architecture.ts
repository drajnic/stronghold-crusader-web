import type { Point } from '../../game/index.js';
import type { DrawingSurface } from './drawing.js';
type FacadeSide = 'front' | 'right';
const archSpring = (height: number, width: number): number => Math.max(0, height - width * 11);
function facade(
  r: DrawingSurface,
  x: number,
  y: number,
  u: number,
  z: number,
  side: FacadeSide,
): Point {
  return side === 'front' ? r.project(x + u, y, z) : r.project(x, y + u, z);
}
function archPath(
  r: DrawingSurface,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  side: FacadeSide,
): Point[] {
  const spring = archSpring(height, width),
    points = [
      facade(r, x, y, -width / 2, z, side),
      facade(r, x, y, width / 2, z, side),
      facade(r, x, y, width / 2, z + spring, side),
    ];
  for (let i = 0; i <= 8; i++) {
    const a = (i * Math.PI) / 8;
    points.push(
      facade(
        r,
        x,
        y,
        (Math.cos(a) * width) / 2,
        z + spring + Math.sin(a) * (height - spring),
        side,
      ),
    );
  }
  points.push(facade(r, x, y, -width / 2, z, side));
  return points;
}
export function archedDoor(
  r: DrawingSurface,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  closed = true,
  side: FacadeSide = 'front',
): void {
  r.poly(archPath(r, x, y, z - 0.5, width + 0.17, height + 3.5, side), '#d8c6a0', '#796c52');
  const opening = archPath(r, x, y, z, width, height, side);
  r.poly(opening, '#342d24');
  if (closed) {
    r.poly(archPath(r, x, y, z + 0.5, width * 0.91, height - 1, side), '#71502e');
    if (r.camera.zoom > 0.48) {
      const c = r.ctx;
      c.save();
      c.beginPath();
      opening.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.clip();
      for (let u = -width / 2 + 0.09; u < width / 2; u += 0.115)
        r.line(facade(r, x, y, u, z, side), facade(r, x, y, u, z + height, side), '#ad8450', 0.55);
      for (const level of [height * 0.22, height * 0.59]) {
        r.line(
          facade(r, x, y, -width * 0.46, z + level, side),
          facade(r, x, y, width * 0.46, z + level, side),
          '#302c25',
          2,
        );
        for (const u of [-width * 0.29, width * 0.29]) {
          const p = facade(r, x, y, u, z + level, side);
          r.ellipse(p.x, p.y, 0.65, 0.65, '#b6ad87');
        }
      }
      r.line(facade(r, x, y, 0, z, side), facade(r, x, y, 0, z + height, side), '#332a1e', 0.8);
      c.restore();
    }
  }
  if (r.camera.zoom > 0.55) {
    const spring = archSpring(height, width);
    for (let i = 0; i <= 6; i++) {
      const a = (i * Math.PI) / 6;
      r.line(
        facade(
          r,
          x,
          y,
          Math.cos(a) * width * 0.51,
          z + spring + Math.sin(a) * (height - spring),
          side,
        ),
        facade(
          r,
          x,
          y,
          Math.cos(a) * (width * 0.51 + 0.08),
          z + spring + Math.sin(a) * (height - spring + 3),
          side,
        ),
        '#8c7a57',
        0.65,
      );
    }
  }
}
export function windowOpening(
  r: DrawingSurface,
  x: number,
  y: number,
  z: number,
  side: FacadeSide = 'front',
  shutters = false,
): void {
  archedDoor(r, x, y, z, 0.22, 9, false, side);
  if (shutters) {
    r.line(facade(r, x, y, -0.16, z + 1, side), facade(r, x, y, -0.16, z + 8, side), '#72543b', 2);
    r.line(facade(r, x, y, 0.16, z + 1, side), facade(r, x, y, 0.16, z + 8, side), '#897143', 2);
  }
  r.line(facade(r, x, y, -0.17, z, side), facade(r, x, y, 0.17, z, side), '#ddcba2', 1.7);
}
export function arrowLoop(
  r: DrawingSurface,
  x: number,
  y: number,
  z: number,
  side: FacadeSide = 'front',
): void {
  r.line(facade(r, x, y, 0, z - 5, side), facade(r, x, y, 0, z + 5, side), '#655c48', 2.5);
  r.line(facade(r, x, y, 0, z - 4, side), facade(r, x, y, 0, z + 4, side), '#302d26', 1);
  r.line(facade(r, x, y, -0.05, z - 1, side), facade(r, x, y, 0.05, z - 1, side), '#40392b', 1);
}
export function castBuildingShadow(
  r: DrawingSurface,
  x: number,
  y: number,
  size: number,
  height: number,
): void {
  const corners = [
      r.project(x, y),
      r.project(x + size, y),
      r.project(x + size, y + size),
      r.project(x, y + size),
    ],
    dx = height * 0.52 * r.camera.zoom,
    dy = height * 0.23 * r.camera.zoom;
  r.poly(
    [
      corners[0],
      corners[1],
      { x: corners[1].x + dx, y: corners[1].y + dy },
      { x: corners[2].x + dx, y: corners[2].y + dy },
      { x: corners[3].x + dx, y: corners[3].y + dy },
      corners[3],
    ],
    '#69543229',
  );
  const p = r.project(x + size * 0.6, y + size * 0.55);
  r.ellipse(p.x, p.y, size * 22, size * 9, '#5b493a1c');
}
