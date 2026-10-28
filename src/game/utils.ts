import type { ResourceKey, ResourceStock, ResourceCost } from './types.js';
import { RESOURCE_KEYS } from './types.js';
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const resourceEntries = (cost: ResourceCost): [ResourceKey, number][] =>
  Object.entries(cost) as [ResourceKey, number][];
export const emptyResources = (): ResourceStock =>
  Object.fromEntries(RESOURCE_KEYS.map((k) => [k, 0])) as ResourceStock;
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
