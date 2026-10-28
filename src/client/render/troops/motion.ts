import type { GameState, Unit } from '../../../game/index.js';
import { TROOPS } from '../../../game/index.js';
import { visualTime } from '../clock.js';
export function motion(
  u: Unit,
  s: GameState,
): { walk: number; stride: number; strike: number; breath: number } {
  const moving =
    s.status === 'playing' &&
    (u.path.length > 0 ||
      (u.goal !== null && Math.hypot(u.goal.x - u.x, u.goal.y - u.y) > 0.6 && u.attack <= 0));
  const time = visualTime(s);
  const attack = Math.max(0, u.attack - (time - s.time));
  const stride = moving ? Math.sin(time * 10.5 + u.id * 1.7) : 0;
  return {
    walk: moving ? time * 10.5 + u.id * 1.7 : 0,
    stride,
    strike: Math.max(0, Math.min(1, (attack / TROOPS[u.type].cooldown - 0.5) * 2)),
    breath: Math.sin(time * 2 + u.id) * 0.4,
  };
}
export function facing(u: Unit, s: GameState): number {
  const target = u.targetId
    ? s.units.find((e) => e.id === u.targetId) || s.buildings.find((e) => e.id === u.targetId)
    : null;
  const goal = target || u.goal || u.path[0];
  return goal && Math.abs(goal.x - u.x - goal.y + u.y) > 0.05
    ? Math.sign(goal.x - u.x - goal.y + u.y)
    : u.id % 3 === 0
      ? -1
      : 1;
}
