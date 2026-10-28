import { parseMap, mapFingerprint, deserialize } from '../game/index.js';
import type {
  ActionResult,
  Difficulty,
  GameState,
  MultiplayerMode,
  Team,
  MapDefinition,
} from '../game/index.js';

export type PlayerTeam = Extract<Team, 'player' | 'player2'>;
export type RoomStatus = 'lobby' | 'playing' | 'paused' | 'finished' | 'aborted';
export type ConnectionStatus =
  'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'conflict';
export type GameSnapshot = Omit<
  GameState,
  'resources' | 'civilians' | 'popularity' | 'tax' | 'rations' | 'mapRevision'
>;
export interface MultiplayerView {
  code: string;
  map: MapDefinition;
  mapFingerprint: string;
  team: PlayerTeam;
  isHost: boolean;
  status: RoomStatus;
  revision: number;
  tick: number;
  multiplayerMode: MultiplayerMode;
  difficulty: Difficulty;
  players: { name: string; team: PlayerTeam; connected: boolean }[];
  state: GameSnapshot | null;
  pauseReason: string | null;
  winner: Team | null;
}
export interface Credentials {
  code: string;
  token: string;
}
export interface HttpReply extends Pick<ActionResult, 'ok' | 'reason'> {
  httpStatus: number;
  token?: string;
  view?: MultiplayerView;
  unitId?: number;
}
export interface SessionCallbacks {
  onUpdate?: (view: MultiplayerView) => void;
  onConnection?: (status: ConnectionStatus, message?: string) => void;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const playerTeam = (value: unknown): value is PlayerTeam =>
  value === 'player' || value === 'player2';
const roomStatus = (value: unknown): value is RoomStatus =>
  value === 'lobby' ||
  value === 'playing' ||
  value === 'paused' ||
  value === 'finished' ||
  value === 'aborted';
const safeCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
export function parseView(value: unknown, knownMap?: MapDefinition): MultiplayerView {
  const invalid = (): never => {
    throw Error('The host returned an invalid room snapshot.');
  };
  if (!isRecord(value)) return invalid();
  const {
    code,
    team,
    isHost,
    status,
    revision,
    tick,
    multiplayerMode,
    difficulty,
    players,
    pauseReason,
    winner,
  } = value;
  if (
    typeof code !== 'string' ||
    !/^[A-Z0-9]{6}$/.test(code) ||
    !playerTeam(team) ||
    typeof isHost !== 'boolean' ||
    isHost !== (team === 'player') ||
    !roomStatus(status) ||
    !safeCount(revision) ||
    !safeCount(tick) ||
    (multiplayerMode !== 'coop' && multiplayerMode !== 'versus') ||
    (difficulty !== 'easy' && difficulty !== 'normal' && difficulty !== 'hard') ||
    !Array.isArray(players) ||
    players.length < 1 ||
    players.length > 2 ||
    (pauseReason !== null && typeof pauseReason !== 'string') ||
    (winner !== null && winner !== 'enemy' && !playerTeam(winner))
  )
    return invalid();
  const parsedPlayers: MultiplayerView['players'] = [];
  for (const raw of players) {
    const player: unknown = raw;
    if (
      !isRecord(player) ||
      typeof player.name !== 'string' ||
      player.name.length < 1 ||
      player.name.length > 24 ||
      !playerTeam(player.team) ||
      typeof player.connected !== 'boolean' ||
      parsedPlayers.some((p) => p.team === player.team)
    )
      return invalid();
    parsedPlayers.push({ name: player.name, team: player.team, connected: player.connected });
  }
  if (!parsedPlayers.some((p) => p.team === team)) return invalid();
  const map = value.map === undefined && knownMap ? knownMap : parseMap(value.map);
  const fingerprint = mapFingerprint(map);
  if (value.mapFingerprint !== fingerprint) return invalid();
  let state: GameSnapshot | null = null;
  if (value.state !== null) {
    if (!isRecord(value.state)) return invalid();
    if (value.state.map !== undefined && mapFingerprint(parseMap(value.state.map)) !== fingerprint)
      return invalid();
    state = deserialize(JSON.stringify({ ...value.state, map }), { rebuildPaths: false });
    if (
      mapFingerprint(state.map) !== fingerprint ||
      state.mode !== 'multiplayer' ||
      state.multiplayerMode !== multiplayerMode ||
      state.difficulty !== difficulty
    )
      return invalid();
    const events: unknown = value.state.events;
    if (!Array.isArray(events)) return invalid();
    state.events = events
      .map((event: unknown) => {
        if (
          !isRecord(event) ||
          typeof event.text !== 'string' ||
          event.text.length > 500 ||
          typeof event.time !== 'number' ||
          !Number.isFinite(event.time) ||
          event.time < 0
        )
          return invalid();
        return { text: event.text, time: event.time };
      })
      .slice(-10);
  }
  if (status !== 'lobby' && status !== 'aborted' && state === null) return invalid();
  return {
    code,
    map,
    mapFingerprint: fingerprint,
    team,
    isHost,
    status,
    revision,
    tick,
    multiplayerMode,
    difficulty,
    players: parsedPlayers,
    state,
    pauseReason,
    winner,
  };
}
export function parseReply(
  value: unknown,
  httpStatus: number,
  knownMap?: MapDefinition,
): HttpReply {
  if (!isRecord(value) || typeof value.ok !== 'boolean')
    throw Error('The game host returned an invalid response.');
  const result: HttpReply = { ok: value.ok, httpStatus };
  if (value.reason !== undefined) {
    if (typeof value.reason !== 'string') throw Error('Invalid response reason.');
    result.reason = value.reason;
  }
  if (value.token !== undefined) {
    if (typeof value.token !== 'string' || !/^[\w-]{43}$/.test(value.token))
      throw Error('Invalid player token.');
    result.token = value.token;
  }
  if (value.view !== undefined) result.view = parseView(value.view, knownMap);
  if (value.unit !== undefined) {
    if (!isRecord(value.unit) || !safeCount(value.unit.id) || value.unit.id === 0)
      throw Error('Invalid action receipt.');
    result.unitId = value.unit.id;
  }
  return result;
}
