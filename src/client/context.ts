import type {
  ActionResult,
  BuildingDefinition,
  BuildingType,
  Entity,
  Faction,
  GameAction,
  GameOptions,
  GameState,
  Point,
  ResourceStock,
  Team,
  TroopDefinition,
  TroopType,
  Unit,
} from '../game/index.js';
import type { MultiplayerSession, MultiplayerView } from './network.js';
import type { Renderer } from './render/renderer.js';
export type Modal =
  | 'maps'
  | 'menu'
  | 'skirmish'
  | 'campaign'
  | 'multiplayer'
  | 'lobby'
  | 'stockpile'
  | 'guide'
  | 'settings'
  | 'result'
  | 'battle-menu'
  | 'leave-confirm'
  | null;
export type OrderMode = 'move' | 'attack' | 'garrison' | null;
export interface Preferences {
  sound: 'on' | 'off';
  cameraSpeed: number;
}
export interface CampaignProgress {
  unlocked: number;
}
export interface NetworkMotion {
  at: number;
  from: Map<number, Point>;
}
export interface PointerGesture {
  button: number;
  start: Point;
  last: Point;
  shift: boolean;
  world: Point;
}
/** Shared client state and explicit controller ports. Domain rules stay in game/. */
export interface ClientContext {
  state: GameState;
  renderer: Renderer;
  settings: Preferences;
  progress: CampaignProgress;
  selected: Set<number>;
  groups: Map<string, number[]>;
  pendingSelected: Map<number, number>;
  networkMotion: NetworkMotion | null;
  lastEventSignature: string;
  started: boolean;
  paused: boolean;
  speed: number;
  buildType: BuildingType | null;
  tab: string;
  selectedBuilding: number | null;
  rallyBuilding: number | null;
  modal: Modal;
  returnModal: Modal;
  lastEvent: number;
  lastUi: number;
  online: boolean;
  team: Team;
  room: MultiplayerView | null;
  orderMode: OrderMode;
  mouse: Point;
  pointer: PointerGesture | null;
  keys: Set<string>;
  previous: number;
  accumulator: number;
  net: MultiplayerSession;
  center: () => void;
  clearSelection: () => void;
  begin: (options?: GameOptions) => void;
  act: (action: GameAction, quiet?: boolean) => Promise<ActionResult>;
  frame: (now: number) => void;
  viewTeam: () => Team;
  resources: () => ResourceStock;
  faction: () => Faction;
  owned: (entity: Entity) => boolean;
  sound: () => void;
  toast: (message: string) => void;
  requirement: (
    d: BuildingDefinition | TroopDefinition,
    troop: boolean,
    type: BuildingType | TroopType,
  ) => string;
  badge: (type: string, troop: boolean) => string;
  renderLedger: () => void;
  refreshAffordability: () => void;
  selectionInfo: () => void;
  refresh: () => void;
  setModal: (name: Modal) => void;
  closeModal: () => void;
  showResult: () => void;
  renderMissions: () => void;
  menu: () => Promise<void>;
  renderStockpile: () => void;
  saveSettings: () => void;
  save: () => void;
  load: (raw?: string) => GameState | undefined;
  resetTerminatedConnection: (message: string) => void;
  networkCall: (fn: () => Promise<unknown>) => Promise<void>;
  leaveOnline: () => Promise<void>;
  pos: (e: MouseEvent | PointerEvent | WheelEvent) => Point;
  zoom: (delta: number, point?: Point) => void;
  updateHover: () => void;
  hitUnit: (point: Point, friendlyOnly?: boolean) => Unit | undefined;
  issue: (point: Point, world: Point) => Promise<void>;
}
