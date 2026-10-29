import { interpolateUnits } from './render/interpolation.js';
import type {
  ActionResult,
  BuildingDefinition,
  BuildingType,
  Entity,
  GameAction,
  GameOptions,
  GameState,
  Point,
  TroopDefinition,
  TroopType,
  Unit,
} from '../game/index.js';
import { applyAction, createGame, factionFor, resourcesFor, update } from '../game/index.js';
import type {
  CampaignProgress,
  ClientContext,
  Modal,
  NetworkMotion,
  OrderMode,
  PointerGesture,
  Preferences,
} from './context.js';
import type { MultiplayerSession } from './network.js';
import { attachQa } from './qa.js';
import { Renderer } from './render/renderer.js';
import {
  badge,
  bindCatalog,
  refreshAffordability,
  renderLedger,
  requirement,
} from './ui/catalog.js';
import {
  bindConnection,
  leaveOnline,
  networkCall,
  resetTerminatedConnection,
} from './ui/connection.js';
import { element as $, errorMessage, optionalElement } from './ui/dom.js';
import { bindMapEditor } from './ui/map-editor.js';
import { bindHud, refresh } from './ui/hud.js';
import { bindInput, hitUnit, issue, pos, updateHover, zoom } from './ui/input.js';
import { bindMenus, closeModal, menu, renderMissions, setModal, showResult } from './ui/menus.js';
import { bindPersistence, load, save, saveSettings } from './ui/persistence.js';
import { bindSelection, selectionInfo } from './ui/selection.js';
import { InterfaceAudio, ToastPresenter, readPreferences, readProgress } from './ui/services.js';
import { bindStockpile, renderStockpile } from './ui/stockpile.js';
export class GameApplication implements ClientContext {
  renderer = new Renderer($('world'));
  selected = new Set<number>();
  groups = new Map<string, number[]>();
  pendingSelected = new Map<number, number>();
  settings: Preferences = readPreferences();
  progress: CampaignProgress = readProgress();
  state = createGame({ mode: 'skirmish' });
  networkMotion: NetworkMotion | null = null;
  lastEventSignature = '';
  started = false;
  paused = false;
  speed = 1;
  buildType: ClientContext['buildType'] = null;
  tab = 'settlement';
  selectedBuilding: number | null = null;
  rallyBuilding: number | null = null;
  modal: Modal = 'menu';
  returnModal: Modal = null;
  lastEvent = 0;
  lastUi = 0;
  online = false;
  team: ClientContext['team'] = 'player';
  room: ClientContext['room'] = null;
  orderMode: OrderMode = null;
  mouse: Point = { x: 0, y: 0 };
  pointer: PointerGesture | null = null;
  keys = new Set<string>();
  previous = performance.now();
  accumulator = 0;
  net!: MultiplayerSession;
  audio = new InterfaceAudio();
  notices = new ToastPresenter($('toast'));
  center = () => {
    const k = this.state.buildings.find((b) => this.owned(b) && b.type === 'keep');
    this.renderer.camera.x = k ? k.x + 1.5 : this.state.map.width / 2;
    this.renderer.camera.y = k ? k.y + 1.5 : this.state.map.width / 2;
  };
  clearSelection = () => {
    this.selected.clear();
    this.pendingSelected.clear();
    this.selectedBuilding = null;
    this.buildType = null;
    this.renderer.buildType = null;
    this.orderMode = null;
    this.rallyBuilding = null;
    this.renderer.selection = null;
  };
  begin = (options: GameOptions = {}) => {
    if (this.online) return;
    optionalElement('menu-connection-notice')?.setAttribute('hidden', '');
    this.state = createGame(options);
    this.team = 'player';
    this.online = false;
    this.room = null;
    this.started = true;
    this.paused = false;
    this.speed = 1;
    this.lastEvent = this.state.events.length;
    this.clearSelection();
    this.groups.clear();
    this.center();
    this.setModal(null);
    this.renderLedger();
    this.refresh();
    this.toast('Your people await your orders. Open the field guide for production chains.');
  };
  act = async (action: GameAction, quiet = false): Promise<ActionResult> => {
    if (this.online && this.room?.status !== 'playing')
      return { ok: false, reason: 'The room is waiting for both players to reconnect.' };
    if (!this.started || this.state.status !== 'playing')
      return { ok: false, reason: 'This kingdom is no longer in play.' };
    try {
      const result = this.online
        ? await this.net.action(action)
        : applyAction(this.state, action, this.team);
      if (
        this.online &&
        action.type === 'recruit' &&
        result.ok &&
        'unitId' in result &&
        typeof result.unitId === 'number'
      ) {
        this.clearSelection();
        this.pendingSelected.set(result.unitId, performance.now() + 5000);
      }
      if (!result.ok && !quiet) this.toast(result.reason || 'That order could not be completed.');
      else if (result.ok) this.sound();
      if (!this.online) this.refresh();
      return result;
    } catch (e) {
      if (!quiet) this.toast(errorMessage(e));
      return { ok: false, reason: errorMessage(e) };
    }
  };
  frame = (now: number) => {
    const elapsed = Math.min((now - this.previous) / 1000, 0.1);
    this.previous = now;
    if (this.started && !this.modal) {
      const dx =
          (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) -
          (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0),
        dy =
          (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) -
          (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0),
        pan = (elapsed * this.settings.cameraSpeed) / this.renderer.camera.zoom;
      this.renderer.camera.x = Math.max(
        0,
        Math.min(this.state.map.width, this.renderer.camera.x + (dx + dy) * pan),
      );
      this.renderer.camera.y = Math.max(
        0,
        Math.min(this.state.map.height, this.renderer.camera.y + (dy - dx) * pan),
      );
      if (!this.online && !this.paused) {
        this.accumulator += elapsed * this.speed;
        while (this.accumulator >= 0.05) {
          update(this.state, 0.05);
          this.accumulator -= 0.05;
        }
      }
    } else this.accumulator = 0;
    if (this.renderer.hover) this.updateHover();
    if (this.online && this.networkMotion) {
      const motion = this.networkMotion;
      this.renderer.visualPositions = interpolateUnits(this.state, motion.from, now - motion.at);
    } else this.renderer.visualPositions.clear();
    this.renderer.selectedBuilding = this.selectedBuilding;
    this.renderer.rallyBuilding = this.rallyBuilding;
    this.renderer.render(this.state);
    if (now - this.lastUi > 220) {
      this.refresh();
      this.renderer.minimap($('minimap'), this.state);
      this.lastUi = now;
    }
    requestAnimationFrame(this.frame);
  };
  viewTeam = (): ClientContext['team'] => (this.state.factions[this.team] ? this.team : 'player');
  resources = () => resourcesFor(this.state, this.viewTeam());
  faction = () => factionFor(this.state, this.viewTeam())!;
  owned = (entity: Entity) => entity.team === this.team;
  sound = () => this.audio.play(this.settings.sound);
  toast = (message: string) => this.notices.show(message);
  requirement = (
    d: BuildingDefinition | TroopDefinition,
    troop: boolean,
    type: BuildingType | TroopType,
  ): string => requirement(this, d, troop, type);
  badge = (type: string, troop: boolean): string => badge(type, troop);
  renderLedger = () => renderLedger(this);
  refreshAffordability = () => refreshAffordability(this);
  selectionInfo = () => selectionInfo(this);
  refresh = () => refresh(this);
  setModal = (name: Modal) => setModal(this, name);
  closeModal = () => closeModal(this);
  showResult = () => showResult(this);
  renderMissions = () => renderMissions(this);
  menu = () => menu(this);
  renderStockpile = () => renderStockpile(this);
  saveSettings = () => saveSettings(this);
  save = () => save(this);
  load = (raw?: string): GameState | undefined => load(this, raw);
  resetTerminatedConnection = (message: string) => resetTerminatedConnection(this, message);
  networkCall = (fn: () => Promise<unknown>) => networkCall(this, fn);
  leaveOnline = () => leaveOnline(this);
  pos = (e: MouseEvent | PointerEvent | WheelEvent): Point => pos(this, e);
  zoom = (delta: number, point?: Point) => zoom(this, delta, point);
  updateHover = () => updateHover(this);
  hitUnit = (point: Point, friendlyOnly = false): Unit | undefined =>
    hitUnit(this, point, friendlyOnly);
  issue = (point: Point, world: Point) => issue(this, point, world);
  constructor() {
    this.renderer.selected = this.selected;
    bindCatalog(this);
    bindSelection(this);
    bindHud(this);
    bindMenus(this);
    bindMapEditor(this);
    bindStockpile(this);
    bindPersistence(this);
    bindConnection(this);
    bindInput(this);
    this.center();
    this.renderLedger();
    this.refresh();
    this.setModal('menu');
    requestAnimationFrame(this.frame);
    this.net.reconnect().catch(() => {});
    attachQa(this);
  }
}
