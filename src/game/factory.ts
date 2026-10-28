import { DEFAULT_MAP, parseMap, validateMap, isClassicMap } from './map-definition.js';
import { SCENARIOS, OPPONENTS } from './catalog.js';
import { clamp, finite } from './utils.js';
import { aliases, makeFaction } from './economy.js';
import { addBuilding, addUnit } from './entities.js';
import type { GameState, GameOptions, Team, BuildingType, TroopType } from './types.js';
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
  const sites: [BuildingType, number, number][] =
    team === 'enemy'
      ? [
          ['lumber', 50, 23],
          ['quarry', 38, 20],
          ['farm', 44, 24],
        ]
      : team === 'player2'
        ? [
            ['lumber', 51, 45],
            ['quarry', 37, 49],
            ['farm', 47, 50],
          ]
        : [
            ['lumber', 8, 35],
            ['quarry', 22, 39],
            ['farm', 12, 32],
          ];
  for (const [type, a, b] of isClassicMap(s.map) ? sites : []) addBuilding(s, type, a, b, team);
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
  const map = options.map ? parseMap(options.map) : DEFAULT_MAP;
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
    if (isClassicMap(map))
      for (const [type, x, y] of [
        ['tower', 42, 21],
        ['wall', 45, 21],
        ['wall', 46, 21],
      ] as [BuildingType, number, number][])
        addBuilding(s, type, x, y, 'enemy');
  } else if (kind === 'survival' || mode === 'sandbox')
    s.factions.enemy = makeFaction('enemy', difficulty);
  if (mode === 'skirmish' && isClassicMap(map)) {
    const f = s.factions.enemy!;
    f.name = OPPONENTS[scenario].name;
    if (scenario === 1) {
      f.attackTimer = 60;
      addBuilding(s, 'mercenary', 49, 18, 'enemy');
    }
    if (scenario === 2) {
      for (const [x, y] of [
        [49, 18],
        [40, 15],
      ] as [number, number][])
        addBuilding(s, 'tower', x, y, 'enemy');
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
