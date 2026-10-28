import type { GameState, Point, Unit } from '../../game/index.js';
import { TROOPS } from '../../game/index.js';
import { teamColor, type DrawingSurface } from './drawing.js';
import { Sprite } from './troops/sprite.js';
import { motion, facing } from './troops/motion.js';
import { health, selection } from './troops/overlays.js';
import { horseSprite } from './troops/mounted.js';
import { soldier } from './troops/infantry.js';
import { siegeUnit } from './troops/siege.js';
export { horse } from './troops/mounted.js';
export { villager } from './troops/civilian.js';

export function unitGround(r: DrawingSurface, u: Unit): void {
  const visual = r.visualPositions.get(u.id) || u,
    p = r.project(visual.x, visual.y),
    z = r.camera.zoom;
  const siege = TROOPS[u.type].facility === 'siege',
    mounted = !!TROOPS[u.type].cavalry;
  r.ellipse(
    p.x + 5 * z,
    p.y + (siege ? 4 : 3) * z,
    siege ? 25 : mounted ? 18 : 9,
    siege ? 9 : mounted ? 5 : 3.3,
    '#3b382e58',
  );
  if (!u.garrisonId && z > 0.55)
    r.ellipse(
      p.x + z,
      p.y + z,
      siege ? 14 : mounted ? 10 : 4.5,
      siege ? 4 : mounted ? 2.5 : 1.6,
      '#302a2140',
    );
  selection(r, p, u, siege ? 25 : mounted ? 19 : 10);
}
export function unit(r: DrawingSurface, u: Unit, s: GameState, position?: Point): void {
  const visual = position || r.visualPositions.get(u.id) || u,
    p = r.project(visual.x, visual.y, u.garrisonId ? 87 : 0),
    z = r.camera.zoom;
  if (p.x < -100 * z || p.x > r.width + 100 * z || p.y < -30 * z || p.y > r.height + 100 * z)
    return;
  if (TROOPS[u.type].facility === 'siege') {
    siegeUnit(r, u, s, p);
    return;
  }
  const mounted = !!TROOPS[u.type].cavalry,
    pose = motion(u, s),
    c = r.ctx;

  c.save();
  c.translate(p.x, p.y);
  c.scale(z * facing(u, s), z);
  const g = new Sprite(c, z > 0.68);
  if (mounted) {
    horseSprite(g, teamColor(u.team), pose.walk, u.type === 'knight');
    c.translate(-1, -11 + Math.abs(pose.stride) * 0.6);
  }
  soldier(g, u, s, mounted);
  c.restore();
  health(r, p, u, mounted ? 51 : 39);
}
