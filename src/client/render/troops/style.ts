import type { TroopType } from '../../../game/index.js';
export const arabian = (type: TroopType): boolean =>
  [
    'slinger',
    'arabianarcher',
    'horse_archer',
    'assassin',
    'arabianswordsman',
    'firethrower',
    'slave',
  ].includes(type);
export const armored = (type: TroopType): boolean =>
  ['swordsman', 'knight', 'pikeman', 'crossbowman', 'brute'].includes(type);
export const skin = (id: number): string => ['#d9af83', '#bd855d', '#a66f4e', '#dfb891'][id % 4];
