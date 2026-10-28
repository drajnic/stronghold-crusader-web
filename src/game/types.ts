import type { MapDefinition } from './map-definition.js';
/** Shared domain contracts used by the simulation, authoritative host, and client. */
export const RESOURCE_KEYS = [
  'wood',
  'stone',
  'iron',
  'pitch',
  'food',
  'wheat',
  'flour',
  'hops',
  'ale',
  'bows',
  'crossbows',
  'spears',
  'pikes',
  'maces',
  'swords',
  'armor',
  'leather',
  'horses',
  'gold',
] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];
export type ResourceStock = Record<ResourceKey, number>;
export type ResourceCost = Partial<ResourceStock>;
export type Team = 'player' | 'player2' | 'enemy';
export type GameMode = 'skirmish' | 'survival' | 'sandbox' | 'campaign' | 'multiplayer';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type MultiplayerMode = 'coop' | 'versus';
export type GameStatus = 'playing' | 'victory' | 'defeat';
export type Stance = 'aggressive' | 'defensive' | 'hold';
export type BuildingType =
  | 'keep'
  | 'well'
  | 'house'
  | 'garden'
  | 'gallows'
  | 'lumber'
  | 'quarry'
  | 'ironmine'
  | 'pitchrig'
  | 'farm'
  | 'wheatfarm'
  | 'mill'
  | 'bakery'
  | 'hopsfarm'
  | 'brewery'
  | 'inn'
  | 'chapel'
  | 'market'
  | 'stockpile'
  | 'granary'
  | 'armory'
  | 'fletcher'
  | 'poleturner'
  | 'blacksmith'
  | 'armorer'
  | 'tanner'
  | 'stable'
  | 'barracks'
  | 'mercenary'
  | 'siege'
  | 'wall'
  | 'gate'
  | 'tower'
  | 'stairs'
  | 'moat'
  | 'pitchtrap';
export type TroopType =
  | 'archer'
  | 'crossbowman'
  | 'spearman'
  | 'pikeman'
  | 'maceman'
  | 'swordsman'
  | 'knight'
  | 'slave'
  | 'slinger'
  | 'arabianarcher'
  | 'horse_archer'
  | 'assassin'
  | 'arabianswordsman'
  | 'firethrower'
  | 'catapult'
  | 'trebuchet'
  | 'ram'
  | 'ballista'
  | 'raider'
  | 'brute';
export type Terrain = 'void' | 'water' | 'grass' | 'trees' | 'stone' | 'iron' | 'pitch' | 'sand';
export interface Point {
  x: number;
  y: number;
}
export interface BuildingDefinition {
  name: string;
  category: string;
  size: number;
  hp: number;
  cost: ResourceCost;
  description: string;
  housing?: number;
  workers?: number;
  rate?: ResourceCost;
  input?: ResourceCost;
  requires?: Terrain;
  fertile?: boolean;
  bonus?: 'ale' | 'faith';
  storage?: 'raw' | 'food' | 'arms';
  storageCapacity?: number;
  open?: boolean;
  range?: number;
  damage?: number;
  garrison?: number;
  trap?: boolean;
}
export interface TroopDefinition {
  name: string;
  category: string;
  facility: 'barracks' | 'mercenary' | 'siege';
  cost: ResourceCost;
  hp: number;
  damage: number;
  range: number;
  speed: number;
  cooldown: number;
  armor: number;
  description: string;
  buildingDamage: number;
  canGarrison: boolean;
  pierce?: number;
  antiCavalry?: number;
  cavalry?: boolean;
  splash?: number;
  civilians?: number;
  minRange?: number;
  untrainable?: boolean;
}
export interface Building extends Point {
  id: number;
  type: BuildingType;
  team: Team;
  hp: number;
  shot: number;
  open?: boolean;
  active?: number;
  paused?: boolean;
  lastHit?: number;
  fire?: { remaining: number; spread: number };
  rallyPoint?: Point;
}
export interface Unit extends Point {
  id: number;
  type: TroopType;
  team: Team;
  hp: number;
  attack: number;
  path: Point[];
  goal: Point | null;
  repath: number;
  stance: Stance;
  targetId: number | null;
  attackMove?: boolean;
  garrisonId: number | null;
}
export type Entity = Building | Unit;
export interface Faction {
  name: string;
  resources: ResourceStock;
  civilians: number;
  popularity: number;
  tax: number;
  rations: number;
  defeated: boolean;
  growth: number;
  aiTimer: number;
  attackTimer: number;
  aiStep: number;
  faith: number;
  aleBonus: number;
}
export type Factions = Partial<Record<Team, Faction>> & { player: Faction };
export interface Effect extends Point {
  tx?: number;
  ty?: number;
  life: number;
  max: number;
  type: 'arrow' | 'hit';
}
export interface GameEvent {
  time: number;
  text: string;
}
export interface Tutorial {
  built: number;
  recruited: number;
  firstRepelled: boolean;
}
export interface GameState {
  version: 3;
  map: MapDefinition;
  time: number;
  mode: GameMode;
  difficulty: Difficulty;
  scenario: number;
  multiplayerMode: MultiplayerMode;
  status: GameStatus;
  winner: Team | null;
  factions: Factions;
  buildings: Building[];
  units: Unit[];
  effects: Effect[];
  events: GameEvent[];
  nextId: number;
  mapRevision: number;
  wave: number;
  nextWave: number;
  kills: number;
  tutorial: Tutorial;
  invasionActive: boolean;
  resources: ResourceStock;
  civilians: number;
  popularity: number;
  tax: number;
  rations: number;
}
export type StateData = Omit<
  GameState,
  'resources' | 'civilians' | 'popularity' | 'tax' | 'rations'
>;
export interface GameOptions {
  map?: MapDefinition;
  mode?: GameMode;
  difficulty?: Difficulty;
  scenario?: number;
  multiplayerMode?: MultiplayerMode;
}
export interface ActionResult {
  ok: boolean;
  reason?: string;
  building?: Building;
  unit?: Unit;
  spawn?: Point;
}
export interface CommandOptions {
  targetId?: number;
  attackMove?: boolean;
}
export type GameAction =
  | { type: 'place'; building: BuildingType; x: number; y: number }
  | { type: 'recruit'; unit: TroopType; facilityId?: number }
  | ({ type: 'command'; ids: number[]; x: number; y: number } & CommandOptions)
  | { type: 'policy'; tax?: number; rations?: number }
  | { type: 'trade'; resource: ResourceKey; amount: number; buy: boolean }
  | { type: 'repair' | 'demolish'; id: number }
  | { type: 'gate'; id: number; open: boolean }
  | { type: 'workplace'; id: number; paused: boolean }
  | { type: 'stance'; ids: number[]; stance: Stance }
  | { type: 'garrison'; ids: number[]; buildingId: number }
  | { type: 'ungarrison'; buildingId: number }
  | { type: 'rally'; id: number; point: Point | null }
  | { type: 'invade' };
export interface PopularityBreakdown {
  base: number;
  rations: number;
  tax: number;
  faith: number;
  ale: number;
  hunger: number;
  fear: number;
  target: number;
}
export interface Scenario {
  name: string;
  description: string;
  objective: string;
  kind: 'survival' | 'skirmish';
  waves?: number;
}
export interface Opponent {
  name: string;
  description: string;
}
