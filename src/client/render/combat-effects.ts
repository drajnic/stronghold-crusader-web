import type { Effect, GameState, Point } from '../../game/index.js';
import { TROOPS, TYPES } from '../../game/index.js';
import type { DrawingSurface } from './drawing.js';
import { visualTime } from './clock.js';

const clamp = (n: number): number => Math.max(0, Math.min(1, n));
function flight(start: Point, end: Point, t: number, arc: number): Point {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t - Math.sin(t * Math.PI) * arc,
  };
}
function projectile(r: DrawingSurface, s: GameState, e: Effect): void {
  if (e.tx === undefined || e.ty === undefined) return;
  const z = r.camera.zoom,
    c = r.ctx,
    t = clamp(1 - (e.life - (visualTime(s) - s.time)) / e.max);
  const shooter = s.units.find((u) => Math.abs(u.x - e.x) < 0.7 && Math.abs(u.y - e.y) < 0.7);
  const tower = shooter?.garrisonId
    ? s.buildings.find((b) => b.id === shooter.garrisonId)
    : s.buildings.find(
        (b) =>
          b.type === 'tower' &&
          Math.hypot(b.x + TYPES[b.type].size / 2 - e.x, b.y + TYPES[b.type].size / 2 - e.y) < 0.5,
      );
  const stone =
    shooter !== undefined &&
    TROOPS[shooter.type].facility === 'siege' &&
    shooter.type !== 'ballista';
  const fire = shooter?.type === 'firethrower';
  const start = r.project(e.x, e.y, tower ? 91 : 18),
    end = r.project(e.tx, e.ty, 9),
    arc = (stone ? 58 : fire ? 24 : 30) * z;
  const p = flight(start, end, t, arc);
  if (p.x < -60 || p.x > r.width + 60 || p.y < -60 || p.y > r.height + 60) return;
  const previous = flight(start, end, Math.max(0, t - 0.025), arc),
    dx = p.x - previous.x,
    dy = p.y - previous.y,
    length = Math.hypot(dx, dy) || 1,
    ux = dx / length,
    uy = dy / length;
  c.save();
  const tail = z < 0.6 ? 2 : 4;
  for (let n = tail; n > 0; n--) {
    const a = flight(start, end, Math.max(0, t - n * 0.025), arc),
      b = flight(start, end, Math.max(0, t - (n - 1) * 0.025), arc);
    c.globalAlpha = (1 - n / (tail + 1)) * (fire ? 0.7 : 0.4);
    r.line(a, b, fire ? '#eea14a' : stone ? '#c0ac7c' : '#f5e5ad', stone ? 2.5 : 1.3);
  }
  c.globalAlpha = 1;
  if (stone) {
    const radius = (shooter?.type === 'trebuchet' ? 3.7 : 2.8) * z;
    r.poly(
      [
        { x: p.x - radius, y: p.y - 1.3 * radius },
        { x: p.x + radius, y: p.y - radius * 0.4 },
        { x: p.x + radius * 0.6, y: p.y + radius },
        { x: p.x - radius, y: p.y + radius * 0.5 },
      ],
      '#727769',
      '#343c36',
    );
    r.line(
      { x: p.x - radius * 0.6, y: p.y - radius },
      { x: p.x + radius * 0.6, y: p.y - radius * 0.3 },
      '#c1bd9c',
      0.8,
    );
  } else if (fire) {
    c.globalAlpha = 0.27;
    r.ellipse(p.x, p.y, 8, 5, '#e99039');
    c.globalAlpha = 0.9;
    r.ellipse(p.x, p.y, 3.2, 2.5, '#edac49');
    r.ellipse(p.x + ux * z, p.y + uy * z, 1.5, 1.5, '#fff0ab');
  } else {
    const back = { x: p.x - ux * 10 * z, y: p.y - uy * 10 * z };
    r.line(back, p, '#343d36', 2.6);
    r.line(back, p, '#e2cc8e', 1.1);
    if (z > 0.62) {
      r.poly(
        [
          { x: p.x + ux * 2.4 * z, y: p.y + uy * 2.4 * z },
          { x: p.x - ux * 1.7 * z - uy * 1.8 * z, y: p.y - uy * 1.7 * z + ux * 1.8 * z },
          { x: p.x - ux * 1.7 * z + uy * 1.8 * z, y: p.y - uy * 1.7 * z - ux * 1.8 * z },
        ],
        '#d7dfcc',
      );
      r.line(
        back,
        { x: back.x + (-ux * 2 - uy * 2) * z, y: back.y + (-uy * 2 + ux * 2) * z },
        '#f2e3b6',
        1,
      );
    }
  }
  c.restore();
}
function impact(r: DrawingSurface, s: GameState, e: Effect): void {
  const p = r.project(e.x, e.y),
    z = r.camera.zoom,
    c = r.ctx,
    t = clamp(1 - (e.life - (visualTime(s) - s.time)) / e.max),
    fade = 1 - t;
  if (p.x < -30 || p.x > r.width + 30 || p.y < -30 || p.y > r.height + 30) return;
  c.save();
  c.globalAlpha = fade * 0.4;
  r.ellipse(p.x + 3 * z, p.y + z, 4 + t * 10, 2 + t * 3, '#8b7046');
  const particles = z < 0.6 ? 2 : 5;
  for (let n = 0; n < particles; n++) {
    const angle = n * 2.4 + e.x * 0.7 + e.y * 0.3,
      spread = (3 + t * 12) * z;
    c.globalAlpha = fade * (n % 2 ? 0.35 : 0.5);
    r.ellipse(
      p.x + Math.cos(angle) * spread,
      p.y + Math.sin(angle) * spread * 0.35 - t * 5 * z,
      2.2 + t * 2.5,
      1.6 + t,
      '#d2bb84',
    );
  }
  if (z > 0.6 && t < 0.68) {
    c.globalAlpha = (1 - t / 0.68) * 0.9;
    for (let n = 0; n < 3; n++) {
      const angle = -2.8 + n * 0.9 + Math.sin(e.x + e.y) * 0.3,
        reach = (4 + t * 18) * z;
      const end = { x: p.x + Math.cos(angle) * reach, y: p.y - 7 * z + Math.sin(angle) * reach };
      r.line(
        { x: end.x - Math.cos(angle) * 3 * z, y: end.y - Math.sin(angle) * 3 * z },
        end,
        n % 2 ? '#d5dfc2' : '#f5d38c',
        1,
      );
    }
  }
  c.restore();
}
/** Bounded, stateless presentation: no particles, projectiles, or game values are mutated. */
export function drawCombatEffects(r: DrawingSurface, s: GameState): void {
  for (let n = Math.max(0, s.effects.length - 100); n < s.effects.length; n++) {
    const effect = s.effects[n];
    if (!Number.isFinite(effect.max) || effect.max <= 0 || effect.life < 0) continue;
    if (effect.type === 'arrow') projectile(r, s, effect);
    else impact(r, s, effect);
  }
}
