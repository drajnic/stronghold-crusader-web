import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ActionResult, Difficulty, GameState, MultiplayerMode } from '../game/index.js';
import type { MapDefinition } from '../game/index.js';
import { serialize } from '../game/index.js';
import type { GameSnapshot, PlayerTeam, RoomStatus } from '../shared/protocol.js';
import { isRecord } from '../shared/protocol.js';
import { HttpError } from './http.js';

export interface Player {
  team: PlayerTeam;
  name: string;
  token: string;
  stream: ServerResponse | null;
  mapSent?: boolean;
  disconnectedAt: number | null;
  requests: Map<string, { status: number; result: ActionResult }>;
  left?: boolean;
  clientId?: string;
}
export interface Room {
  code: string;
  map: MapDefinition;
  mapFingerprint: string;
  players: Player[];
  multiplayerMode: MultiplayerMode;
  difficulty: Difficulty;
  state: GameState | null;
  status: RoomStatus;
  updated: number;
  lastSnapshot: number;
  revision: number;
  tick: number;
  pauseReason?: string | null;
}
export const secret = (): string => randomBytes(32).toString('base64url');
export const cleanName = (value: unknown): string =>
  String(value || 'Crusader')
    .normalize('NFKC')
    .replace(/[<>\p{Cc}]/gu, '')
    .trim()
    .slice(0, 24) || 'Crusader';
export function snapshot(state: GameState | null): GameSnapshot | null {
  if (!state) return null;
  const saved: unknown = JSON.parse(serialize(state));
  if (!isRecord(saved)) throw Error('The simulation returned an invalid snapshot.');
  return { ...saved, effects: structuredClone(state.effects) } as unknown as GameSnapshot;
}
function equalToken(a: unknown, b: string): boolean {
  if (typeof a !== 'string') return false;
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function auth(req: IncomingMessage, url: URL, room: Room | undefined): Player {
  const token =
    req.headers.authorization?.replace(/^Bearer /, '') ||
    (url.pathname.endsWith('/events') || url.pathname === '/api/session'
      ? url.searchParams.get('token')
      : null);
  const player = room?.players.find((p) => equalToken(token, p.token));
  if (!player) throw new HttpError(401, 'Invalid player session.');
  if (player.left) throw new HttpError(410, 'This player has left the room.');
  return player;
}
const ACTIONS = new Set([
  'place',
  'recruit',
  'rally',
  'command',
  'policy',
  'trade',
  'repair',
  'demolish',
  'gate',
  'workplace',
  'stance',
  'garrison',
  'ungarrison',
]);
export function actionOwnership(
  state: GameState,
  action: unknown,
  team: PlayerTeam,
): string | null {
  if (!isRecord(action) || typeof action.type !== 'string' || !ACTIONS.has(action.type))
    return 'Unknown action.';
  if (
    Object.hasOwn(action, 'team') ||
    Object.hasOwn(action, 'state') ||
    Object.hasOwn(action, 'resources')
  )
    return 'Faction and state are assigned by the server.';
  const owned = (id: unknown): boolean =>
    [...state.buildings, ...state.units].some((e) => e.id === id && e.team === team);
  if (['command', 'stance', 'garrison'].includes(action.type)) {
    const ids: unknown = action.ids;
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 128 ||
      ids.some((id: unknown) => typeof id !== 'number' || !Number.isSafeInteger(id) || !owned(id))
    )
      return 'You may only command your own units.';
  }
  if (
    ['repair', 'demolish', 'gate', 'workplace', 'rally'].includes(action.type) &&
    !owned(action.id)
  )
    return 'You may only change your own buildings.';
  if (action.type === 'recruit' && action.facilityId !== undefined && !owned(action.facilityId))
    return 'You may only recruit from your own buildings.';
  if (['garrison', 'ungarrison'].includes(action.type) && !owned(action.buildingId))
    return 'You may only use your own buildings.';
  return null;
}
