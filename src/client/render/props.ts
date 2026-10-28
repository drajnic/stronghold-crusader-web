import type { DrawingSurface } from './drawing.js';
export function barrel(r: DrawingSurface, x: number, y: number, height = 10): void {
  const p = r.project(x, y),
    z = r.camera.zoom,
    w = 4.5;
  const c = r.ctx;
  r.ellipse(p.x + 2 * z, p.y + 1 * z, 6, 2.4, '#55452a28');
  r.poly(
    [
      { x: p.x - w * z, y: p.y - height * z },
      { x: p.x + w * z, y: p.y - height * z },
      { x: p.x + (w + 1) * z, y: p.y - height * 0.45 * z },
      { x: p.x + w * z, y: p.y },
      { x: p.x - w * z, y: p.y },
      { x: p.x - (w + 1) * z, y: p.y - height * 0.45 * z },
    ],
    '#9c7343',
  );
  r.ellipse(p.x, p.y - height * z, w, 2, '#c29b61');
  if (z > 0.55) {
    for (const dx of [-2.5, 0, 2.5])
      r.line(
        { x: p.x + dx * z, y: p.y - height * z },
        { x: p.x + dx * z, y: p.y },
        '#674b2f',
        0.65,
      );
    for (const h of [height * 0.22, height * 0.75]) {
      c.beginPath();
      c.ellipse(p.x, p.y - h * z, (w + 0.3) * z, 1.8 * z, 0, 0, Math.PI);
      c.strokeStyle = '#484537';
      c.lineWidth = 1.2 * z;
      c.stroke();
    }
  }
}
export function crate(r: DrawingSurface, x: number, y: number, w = 0.36, h = 9): void {
  r.prism(x, y, w, w, h, '#c59f63', '#a57b44', '#775934');
  const p = (a: number, b: number, z: number) => r.project(a, b, z);
  r.line(p(x, y + w, 0), p(x + w, y + w, h), '#685031', 1);
  r.line(p(x + w, y + w, 0), p(x, y + w, h), '#d4b27a', 1.1);
  r.line(p(x + w, y, 0), p(x + w, y + w, h), '#a18752', 0.8);
}
export function sack(r: DrawingSurface, x: number, y: number): void {
  const p = r.project(x, y),
    z = r.camera.zoom;
  r.ellipse(p.x, p.y - 3 * z, 4.4, 5, '#c7b383');
  r.ellipse(p.x - 1 * z, p.y - 4 * z, 2, 3, '#dec99c');
  r.line({ x: p.x - 1.5 * z, y: p.y - 7 * z }, { x: p.x + 2 * z, y: p.y - 8 * z }, '#74633e', 1);
}
export function pot(r: DrawingSurface, x: number, y: number): void {
  const p = r.project(x, y),
    z = r.camera.zoom;
  r.ellipse(p.x, p.y - 4 * z, 4.5, 6, '#a56d44');
  r.ellipse(p.x - 1 * z, p.y - 5 * z, 2.5, 4, '#bd8653');
  r.ellipse(p.x, p.y - 9 * z, 2.7, 1.8, '#6c4b33');
  r.ellipse(p.x, p.y - 10 * z, 2.6, 1, '#cd9a65');
}
export function logPile(r: DrawingSurface, x: number, y: number): void {
  const z = r.camera.zoom;
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 3 - row; i++) {
      const a = r.project(x + row * 0.1 + i * 0.2, y, 3 + row * 6),
        b = r.project(x + row * 0.1 + i * 0.2, y + 0.65, 3 + row * 6);
      r.line(a, b, '#755431', 5);
      r.line(
        { x: a.x - 1 * z, y: a.y - 1 * z },
        { x: b.x - 1 * z, y: b.y - 1 * z },
        '#b18b4e',
        1.2,
      );
      r.ellipse(b.x, b.y, 2.7, 2.4, '#d3b276');
      r.ellipse(b.x, b.y, 1, 1, '#8c653c');
    }
}
export function cart(r: DrawingSurface, x: number, y: number): void {
  r.prism(x, y, 0.65, 0.5, 7, '#bc965e', '#8b683f', '#624c33', 4);
  for (const u of [0, 0.64]) {
    const p = r.project(x + u, y + 0.28, 3);
    r.ellipse(p.x, p.y, 5, 6, '#4e4432');
    r.ellipse(p.x, p.y, 3.5, 4.5, '#b3945d');
    r.line(
      { x: p.x - 3 * r.camera.zoom, y: p.y },
      { x: p.x + 3 * r.camera.zoom, y: p.y },
      '#6e5635',
      1,
    );
  }
  r.line(r.project(x + 0.12, y + 0.5, 6), r.project(x + 0.12, y + 0.94, 5), '#9c7946', 2);
  r.line(r.project(x + 0.53, y + 0.5, 6), r.project(x + 0.53, y + 0.94, 5), '#9c7946', 2);
}
