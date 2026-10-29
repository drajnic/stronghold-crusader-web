import { RESOURCE_KEYS } from './types.js';
import type { ResourceKey, Scenario, Opponent } from './types.js';
export { RESOURCE_KEYS } from './types.js';
export const MAX_UNITS = 160,
  MAX_BUILDINGS = 1600;
export const PRICES = Object.fromEntries(
  RESOURCE_KEYS.map((k) => [
    k,
    {
      buy: {
        gold: 1,
        wood: 3,
        stone: 5,
        iron: 8,
        pitch: 7,
        food: 2,
        wheat: 2,
        flour: 3,
        hops: 3,
        ale: 5,
        bows: 15,
        crossbows: 25,
        spears: 10,
        pikes: 15,
        maces: 18,
        swords: 25,
        armor: 30,
        leather: 15,
        horses: 35,
      }[k],
      sell: Math.max(
        1,
        Math.floor(
          {
            gold: 1,
            wood: 3,
            stone: 5,
            iron: 8,
            pitch: 7,
            food: 2,
            wheat: 2,
            flour: 3,
            hops: 3,
            ale: 5,
            bows: 15,
            crossbows: 25,
            spears: 10,
            pikes: 15,
            maces: 18,
            swords: 25,
            armor: 30,
            leather: 15,
            horses: 35,
          }[k] * 0.55,
        ),
      ),
    },
  ]),
) as Record<ResourceKey, { buy: number; sell: number }>;

export { TYPES } from './buildings.js';
export { TROOPS } from './troops.js';
export const OPPONENTS: Opponent[] = [
  { name: 'The Emir', description: 'Balanced economy and mixed troops.' },
  { name: 'The Wolf', description: 'Early mercenary assaults and frequent attacks.' },
  { name: 'The Warden', description: 'Extra towers and a defensive siege economy.' },
];
export const SCENARIOS: Scenario[] = [
  {
    name: 'The Oasis Road',
    description: 'Defend your caravan settlement against four raids.',
    objective: 'Survive four raids',
    kind: 'survival',
    waves: 4,
  },
  {
    name: 'The Emir’s Citadel',
    description: 'Build an army and destroy the emir’s keep.',
    objective: 'Destroy the enemy keep',
    kind: 'skirmish',
  },
  {
    name: 'The Last Caravan',
    description: 'A lean frontier settlement faces five escalating raids.',
    objective: 'Survive five raids with scarce supplies',
    kind: 'survival',
    waves: 5,
  },
];
