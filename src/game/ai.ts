import { TYPES, TROOPS, PRICES } from './catalog.js';
import { workforce, hostile } from './economy.js';
import { place, recruit, canPlace } from './construction.js';
import { command } from './commands.js';
import { applyAction } from './actions.js';
import { event, modeKind } from './raids.js';
import { center, distance } from './combat.js';
import type { GameState, Team, BuildingType, TroopType, ResourceKey } from './types.js';
function aiBuild(s: GameState, type: BuildingType, team: Team) {
  const keep = s.buildings.find((b) => b.team === team && b.type === 'keep');
  if (!keep) return false;
  let budget = 1500;
  for (let r = 3; r < 20; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (--budget < 0) return false;
        const x = keep.x + dx,
          y = keep.y + dy;
        if (canPlace(s, type, x, y, team).ok) return place(s, type, x, y, team).ok;
      }
  return false;
}
export function updateAI(s: GameState, dt: number) {
  const f = s.factions.enemy;
  if (
    !f ||
    f.defeated ||
    !(modeKind(s) === 'skirmish' || (s.mode === 'multiplayer' && s.multiplayerMode === 'coop'))
  )
    return;
  f.aiTimer -= dt;
  f.attackTimer -= dt;
  if (f.aiTimer <= 0) {
    f.aiTimer = 6;
    const profile = s.mode === 'skirmish' ? s.scenario : 0;
    const buildOrder: BuildingType[] =
      profile === 1
        ? [
            'mercenary',
            'house',
            'gallows',
            'farm',
            'fletcher',
            'ironmine',
            'stable',
            'house',
            'siege',
          ]
        : profile === 2
          ? [
              'tower',
              'garden',
              'fletcher',
              'house',
              'ironmine',
              'armorer',
              'blacksmith',
              'farm',
              'siege',
              'tower',
              'wheatfarm',
              'mill',
              'bakery',
            ]
          : [
              'house',
              'fletcher',
              'ironmine',
              'armorer',
              'blacksmith',
              'mercenary',
              'farm',
              'house',
              'tower',
              'siege',
              'wheatfarm',
              'mill',
              'bakery',
            ];
    const owned = s.buildings.filter((b) => b.team === 'enemy' && b.hp > 0);
    const has = (type: BuildingType) => owned.some((b) => b.type === type);
    applyAction(
      s,
      { type: 'policy', rations: f.resources.food < 30 ? 1 : 2, tax: f.popularity < 45 ? -1 : 1 },
      'enemy',
    );
    const essentials: BuildingType[] = ['lumber', 'quarry', 'farm', 'market', 'barracks', 'well'];
    // Try each missing essential; unavailable terrain must not freeze the build queue.
    let built = false;
    for (const essential of essentials) {
      if (!has(essential) && aiBuild(s, essential, 'enemy')) {
        built = true;
        break;
      }
    }
    const type = buildOrder[f.aiStep % buildOrder.length];
    const existing = s.buildings.filter(
      (b) => b.team === 'enemy' && b.type === type && b.hp > 0,
    ).length;
    if (existing < (type === 'house' ? 5 : type === 'farm' ? 3 : type === 'tower' ? 4 : 1)) {
      if (!built) {
        aiBuild(s, type, 'enemy');
        f.aiStep++;
      }
    } else if (!built) f.aiStep++;
    if (f.resources.gold < 120)
      for (const resource of ['wood', 'stone', 'food'] as const)
        if (f.resources[resource] > 300)
          applyAction(s, { type: 'trade', resource, amount: 50, buy: false }, 'enemy');
    const keep = owned.find((b) => b.type === 'keep');
    const threatened =
      keep &&
      s.units.some(
        (u) => u.hp > 0 && hostile(s, 'enemy', u.team) && distance(u, center(keep)) < 12,
      );
    if (!threatened) {
      const damaged = owned.find(
        (b) =>
          !b.fire &&
          b.hp < TYPES[b.type].hp * 0.75 &&
          (!Number.isFinite(b.lastHit) || s.time - (b.lastHit ?? -Infinity) >= 6),
      );
      if (damaged) applyAction(s, { type: 'repair', id: damaged.id }, 'enemy');
    }
    if (has('market') && f.resources.gold > 140) {
      for (const resource of [
        'food',
        'wood',
        'stone',
        'iron',
        'bows',
        'crossbows',
        'spears',
        'swords',
        'armor',
      ] as ResourceKey[]) {
        const amount = ['food', 'wood', 'stone'].includes(resource)
          ? 15
          : resource === 'iron'
            ? 3
            : 1;
        if (
          f.resources[resource] < amount &&
          f.resources.gold - amount * PRICES[resource].buy >= 100
        )
          applyAction(s, { type: 'trade', resource, amount, buy: true }, 'enemy');
      }
    }
    const army = s.units.filter((u) => u.team === 'enemy' && u.hp > 0);
    if (threatened && keep) {
      const threat = s.units.find(
        (u) => u.hp > 0 && hostile(s, 'enemy', u.team) && distance(u, center(keep)) < 12,
      );
      if (threat)
        command(
          s,
          army
            .filter((u) => !u.garrisonId)
            .slice(0, Math.max(4, Math.ceil(army.length / 2)))
            .map((u) => u.id),
          threat.x,
          threat.y,
          'enemy',
          { targetId: threat.id, attackMove: true },
        );
    }
    if (
      f.civilians > workforce(s, 'enemy') + 3 &&
      f.resources.food > 20 &&
      army.length < Math.min(48, s.difficulty === 'easy' ? 24 : 40)
    ) {
      const troopOrder: TroopType[] =
        profile === 1
          ? ['arabianarcher', 'slave', 'archer', 'spearman']
          : profile === 2
            ? ['crossbowman', 'archer', 'swordsman', 'catapult']
            : ['archer', 'spearman', 'swordsman', 'arabianarcher', 'catapult'];
      const offset = Math.floor(s.time / 6) % troopOrder.length;
      for (let i = 0; i < troopOrder.length; i++) {
        const type = troopOrder[(offset + i) % troopOrder.length];
        if (recruit(s, type, 'enemy').ok) break;
      }
    }
    if (profile === 2) {
      const tower = owned.find((b) => b.type === 'tower');
      const archers = tower
        ? army
            .filter(
              (u) =>
                TROOPS[u.type].canGarrison && !u.garrisonId && distance(u, center(tower)) <= 12,
            )
            .slice(0, Math.max(0, 3 - army.filter((u) => u.garrisonId === tower.id).length))
        : [];
      if (tower && archers.length)
        applyAction(
          s,
          { type: 'garrison', buildingId: tower.id, ids: archers.map((u) => u.id) },
          'enemy',
        );
    }
  }
  if (f.attackTimer <= 0) {
    f.attackTimer =
      (s.difficulty === 'easy' ? 100 : s.difficulty === 'hard' ? 45 : 70) *
      (s.mode === 'skirmish' && s.scenario === 1
        ? 0.65
        : s.mode === 'skirmish' && s.scenario === 2
          ? 1.5
          : 1);
    const profile = s.mode === 'skirmish' ? s.scenario : 0;
    const home = s.buildings.find((b) => b.type === 'keep' && b.team === 'enemy' && b.hp > 0);
    const targets = s.buildings.filter(
      (b) =>
        b.hp > 0 &&
        hostile(s, 'enemy', b.team) &&
        (b.type === 'keep' ||
          (profile === 1 &&
            ['lumber', 'quarry', 'farm', 'ironmine'].includes(b.type) &&
            !s.buildings.some(
              (fort) =>
                fort.hp > 0 &&
                fort.team === b.team &&
                (fort.type === 'tower' || fort.type === 'keep') &&
                distance(center(fort), center(b)) < 8,
            ))),
    );
    targets.sort(
      (a, b) =>
        (profile === 1 && a.type !== b.type
          ? a.type === 'keep'
            ? 1
            : b.type === 'keep'
              ? -1
              : 0
          : 0) ||
        (home
          ? distance(center(home), center(a)) - distance(center(home), center(b))
          : a.id - b.id),
    );
    const keep = targets[0];
    if (keep) {
      const army = s.units.filter((u) => u.team === 'enemy' && u.hp > 0);
      const threatened =
        home &&
        s.units.some(
          (u) => u.hp > 0 && hostile(s, 'enemy', u.team) && distance(u, center(home)) < 12,
        );
      const reserve = threatened ? Math.max(4, Math.ceil(army.length / 2)) : profile === 2 ? 4 : 2;
      const expedition = army
        .filter((u) => !u.garrisonId)
        .sort((a, b) =>
          home ? distance(a, center(home)) - distance(b, center(home)) || a.id - b.id : a.id - b.id,
        )
        .slice(reserve, profile === 1 ? reserve + 8 : undefined);
      if (
        profile === 2 &&
        (expedition.length < 6 ||
          (expedition.some((u) => TROOPS[u.type].facility === 'siege') &&
            expedition.filter((u) => TROOPS[u.type].facility !== 'siege').length < 2))
      ) {
        f.attackTimer = 10;
        return;
      }
      const ids = expedition.map((u) => u.id);
      if (ids.length) {
        command(s, ids, keep.x, keep.y, 'enemy', { targetId: keep.id, attackMove: true });
        for (const u of expedition) u.stance = 'aggressive';
        event(s, `${f.name} has dispatched an army from the citadel.`);
      }
    }
  }
}
