import { MAX_UNITS, SCENARIOS } from './catalog.js';
import { makeFaction } from './economy.js';
import { addUnit, findOpen } from './entities.js';
import { center } from './combat.js';
import type { GameState, ActionResult } from './types.js';
export function event(s: GameState, text: string) {
  s.events.push({ time: s.time, text });
  if (s.events.length > 30) s.events.shift();
}
export function modeKind(s: GameState) {
  return s.mode === 'campaign' ? SCENARIOS[s.scenario].kind : s.mode;
}
export function launchWave(s: GameState): ActionResult {
  if (s.status !== 'playing') return { ok: false, reason: 'Battle has ended.' };
  if (!s.factions.enemy) s.factions.enemy = makeFaction('enemy', s.difficulty);
  const max = s.mode === 'campaign' ? SCENARIOS[s.scenario].waves || 4 : 4;
  if (modeKind(s) !== 'sandbox' && s.wave >= max)
    return { ok: false, reason: 'The last raid has already arrived.' };
  s.wave++;
  s.invasionActive = true;
  s.nextWave = s.time + (s.difficulty === 'hard' ? 70 : 95);
  const count = Math.min(8 + s.wave * 4, s.difficulty === 'easy' ? 22 : 32);
  for (let i = 0; i < count && s.units.length < MAX_UNITS; i++) {
    const p = findOpen(s, s.map.raid.x + (i % 6), s.map.raid.y + Math.floor(i / 6), 'enemy');
    if (p) {
      const u = addUnit(
        s,
        s.wave >= 3 && i % 4 === 0 ? 'brute' : 'raider',
        'enemy',
        p.x + 0.5,
        p.y + 0.5,
      );
      const keep = s.buildings.find((b) => b.team === 'player' && b.type === 'keep');
      if (keep) {
        u.goal = center(keep);
        u.attackMove = true;
        u.stance = 'aggressive';
      }
    }
  }
  event(
    s,
    `Raid ${s.wave}${modeKind(s) === 'sandbox' ? '' : ` of ${max}`} approaches from the raid entry.`,
  );
  return { ok: true };
}
