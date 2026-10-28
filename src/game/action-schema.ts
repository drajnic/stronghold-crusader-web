import { TYPES, TROOPS, SIZE } from './catalog.js';
import { RESOURCE_KEYS } from './types.js';
import type { GameAction, BuildingType, TroopType, ResourceKey, Team, Stance } from './types.js';
import { finite, isRecord } from './utils.js';
export const isTeam = (value: unknown): value is Team =>
  value === 'player' || value === 'player2' || value === 'enemy';
export const isBuildingType = (value: unknown): value is BuildingType =>
  typeof value === 'string' && Object.hasOwn(TYPES, value);
export const isTroopType = (value: unknown): value is TroopType =>
  typeof value === 'string' && Object.hasOwn(TROOPS, value);
const isResourceKey = (value: unknown): value is ResourceKey =>
  typeof value === 'string' && (RESOURCE_KEYS as readonly string[]).includes(value);
export const isStance = (value: unknown): value is Stance =>
  value === 'aggressive' || value === 'defensive' || value === 'hold';
const ids = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((v) => Number.isSafeInteger(v));
/** Parse untrusted transport input before it reaches the typed domain command handlers. */
export function parseAction(value: unknown): GameAction | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case 'place':
      return isBuildingType(value.building) && finite(value.x) && finite(value.y)
        ? { type: 'place', building: value.building, x: value.x, y: value.y }
        : null;
    case 'recruit':
      return isTroopType(value.unit) &&
        (value.facilityId === undefined || Number.isSafeInteger(value.facilityId))
        ? { type: 'recruit', unit: value.unit, facilityId: value.facilityId as number | undefined }
        : null;
    case 'rally':
      return Number.isSafeInteger(value.id) &&
        (value.point === null ||
          (isRecord(value.point) &&
            finite(value.point.x) &&
            finite(value.point.y) &&
            value.point.x >= 1 &&
            value.point.y >= 1 &&
            value.point.x < SIZE - 1 &&
            value.point.y < SIZE - 1))
        ? {
            type: 'rally',
            id: value.id as number,
            point:
              value.point === null
                ? null
                : { x: value.point.x as number, y: value.point.y as number },
          }
        : null;
    case 'command':
      return ids(value.ids) &&
        finite(value.x) &&
        finite(value.y) &&
        (value.targetId === undefined || finite(value.targetId)) &&
        (value.attackMove === undefined || typeof value.attackMove === 'boolean')
        ? {
            type: 'command',
            ids: value.ids,
            x: value.x,
            y: value.y,
            targetId: value.targetId,
            attackMove: value.attackMove,
          }
        : null;
    case 'policy':
      return (value.tax === undefined || finite(value.tax)) &&
        (value.rations === undefined || finite(value.rations))
        ? { type: 'policy', tax: value.tax, rations: value.rations }
        : null;
    case 'trade':
      return isResourceKey(value.resource) && finite(value.amount) && typeof value.buy === 'boolean'
        ? { type: 'trade', resource: value.resource, amount: value.amount, buy: value.buy }
        : null;
    case 'repair':
    case 'demolish':
      return finite(value.id) ? { type: value.type, id: value.id } : null;
    case 'workplace':
      return Number.isSafeInteger(value.id) && typeof value.paused === 'boolean'
        ? { type: 'workplace', id: value.id as number, paused: value.paused }
        : null;
    case 'gate':
      return finite(value.id) && typeof value.open === 'boolean'
        ? { type: 'gate', id: value.id, open: value.open }
        : null;
    case 'stance':
      return ids(value.ids) && isStance(value.stance)
        ? { type: 'stance', ids: value.ids, stance: value.stance }
        : null;
    case 'garrison':
      return ids(value.ids) && finite(value.buildingId)
        ? { type: 'garrison', ids: value.ids, buildingId: value.buildingId }
        : null;
    case 'ungarrison':
      return finite(value.buildingId) ? { type: 'ungarrison', buildingId: value.buildingId } : null;
    case 'invade':
      return { type: 'invade' };
    default:
      return null;
  }
}
