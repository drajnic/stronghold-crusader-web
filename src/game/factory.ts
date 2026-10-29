import { SMALL_MAP, BUILTIN_MAPS, parseMap, validateMap } from './map-definition.js';
import { SCENARIOS, OPPONENTS } from './catalog.js';
import { clamp, finite } from './utils.js';
import { aliases, makeFaction } from './economy.js';
import { addBuilding, addUnit } from './entities.js';
import type { GameState, GameOptions, Team, BuildingType, TroopType } from './types.js';
function isPresetMap(map: GameState['map']): boolean {
  return BUILTIN_MAPS.some(
    (preset) =>
      map.width === preset.width &&
      map.terrain.every((row, i) => row === preset.terrain[i]) &&
      (['player', 'player2', 'enemy'] as const).every(
        (team) =>
          map.spawns[team].x === preset.spawns[team].x &&
          map.spawns[team].y === preset.spawns[team].y,
      ),
  );
}
function starter(s: GameState, team: Team, x: number, y: number) {
  addBuilding(s, 'keep', x, y, team);
  for (const [type, dx, dy] of [
    ['house', -3, 1],
    ['house', 4, 1],
    ['barracks', -3, -3],
    ['market', 4, -3],
    ['stockpile', 1, 4],
    ['granary', -3, 4],
  ] as [BuildingType, number, number][])
    addBuilding(s, type, x + dx, y + dy, team);
  if (isPresetMap(s.map)) {
    addBuilding(s, 'lumber', x - 11, y - 9, team);
    addBuilding(s, 'quarry', x + 8, y + 8, team);
    addBuilding(s, 'farm', x - 8, y - 10, team);
  }
  for (const [type, dx, dy] of [
    ['archer', 0, 3],
    ['archer', 2, 3],
    ['spearman', -1, 0],
    ['swordsman', 3, 0],
  ] as [TroopType, number, number][])
    addUnit(s, type, team, x + dx + 0.5, y + dy + 0.5);
}
export function createGame(options: GameOptions = {}): GameState {
  const mode =
      options.mode &&
      ['skirmish', 'survival', 'sandbox', 'campaign', 'multiplayer'].includes(options.mode)
        ? options.mode
        : 'skirmish',
    difficulty =
      options.difficulty && ['easy', 'normal', 'hard'].includes(options.difficulty)
        ? options.difficulty
        : 'normal',
    scenario =
      finite(options.scenario) && Number.isInteger(options.scenario)
        ? clamp(options.scenario, 0, 2)
        : 0;
  const map = options.map ? parseMap(options.map) : SMALL_MAP;
  if (options.map) {
    const issues = validateMap(map);
    if (issues.errors.length) throw Error(issues.errors.join(' '));
  }
  const s = aliases({
    version: 3,
    map,
    time: 0,
    mode,
    difficulty,
    scenario,
    multiplayerMode: options.multiplayerMode === 'versus' ? 'versus' : 'coop',
    status: 'playing',
    winner: null,
    factions: { player: makeFaction('player', difficulty) },
    buildings: [],
    units: [],
    effects: [],
    events: [],
    nextId: 1,
    mapRevision: 0,
    wave: 0,
    nextWave: 100,
    kills: 0,
    tutorial: { built: 0, recruited: 0, firstRepelled: false },
    invasionActive: false,
  });
  starter(s, 'player', map.spawns.player.x, map.spawns.player.y);
  const kind = mode === 'campaign' ? SCENARIOS[scenario].kind : mode;
  if (mode === 'multiplayer') {
    s.factions.player2 = makeFaction('player2', difficulty);
    starter(s, 'player2', map.spawns.player2.x, map.spawns.player2.y);
  }
  if (kind === 'skirmish' || (mode === 'multiplayer' && s.multiplayerMode === 'coop')) {
    s.factions.enemy = makeFaction('enemy', difficulty);
    starter(s, 'enemy', map.spawns.enemy.x, map.spawns.enemy.y);
    if (isPresetMap(map))
      for (const [type, x, y] of [
        ['tower', -3, 7],
        ['wall', 0, 7],
        ['wall', 1, 7],
      ] as [BuildingType, number, number][])
        addBuilding(s, type, x + map.spawns.enemy.x, y + map.spawns.enemy.y, 'enemy');
  } else if (kind === 'survival' || mode === 'sandbox')
    s.factions.enemy = makeFaction('enemy', difficulty);
  if (mode === 'skirmish') {
    const f = s.factions.enemy!;
    f.name = OPPONENTS[scenario].name;
    if (scenario === 1) {
      f.attackTimer = 60;
      if (isPresetMap(map))
        addBuilding(s, 'mercenary', map.spawns.enemy.x + 4, map.spawns.enemy.y + 4, 'enemy');
    }
    if (scenario === 2) {
      if (isPresetMap(map))
        for (const [x, y] of [
          [4, 4],
          [-5, 1],
        ] as [number, number][])
          addBuilding(s, 'tower', x + map.spawns.enemy.x, y + map.spawns.enemy.y, 'enemy');
      f.attackTimer = 140;
    }
  }
  if (mode === 'campaign' && scenario === 2) {
    s.resources.wood = 180;
    s.resources.stone = 140;
    s.resources.gold = 220;
    s.nextWave = 75;
  }
  s.events.push({
    time: 0,
    text:
      mode === 'sandbox'
        ? 'Peaceful sandbox: build freely; use Call invasion when ready.'
        : mode === 'campaign'
          ? SCENARIOS[scenario].description
          : 'Build an economy, equip your troops and defend your lord.',
  });
  return s;
}
