import { BUILTIN_MAPS, mapSizeLabel, decodeMap, encodeMap, validateMap } from '../../game/index.js';
import type { MapDefinition } from '../../game/index.js';
interface LibraryMap {
  id: string;
  map: MapDefinition;
}
const KEY = 'crusader.maps.v1';
const MAP_LIMIT = 20;
export function readMaps(): LibraryMap[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, MAP_LIMIT).flatMap((entry) => {
      try {
        return typeof entry.id === 'string'
          ? [{ id: entry.id, map: decodeMap(JSON.stringify(entry.map)) }]
          : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
export function mapLibraryNotice(): string {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(raw) && raw.length === readMaps().length) return '';
  } catch {
    // Storage stays untouched when it cannot be decoded.
  }
  return 'Library contains unsupported or corrupt maps. Only 128 × 128, 256 × 256, and 512 × 512 version 2 maps are supported. Original browser storage was preserved. Remove unsupported legacy maps explicitly in the editor to save new maps; corrupt entries require recovery.';
}
export function deleteUnsupportedMaps(): number {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    throw Error('Library data is corrupt or unavailable. Original storage was preserved.');
  }
  if (!Array.isArray(raw)) throw Error('Library data is corrupt. Original storage was preserved.');
  const retained = raw.filter((entry) => {
    const map = entry?.map;
    return !(map && (map.version === 1 || map.width === 64 || map.height === 64));
  });
  const removed = raw.length - retained.length;
  if (removed) localStorage.setItem(KEY, JSON.stringify(retained));
  return removed;
}
function mutableMaps(): LibraryMap[] {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    throw Error(
      'Library data is corrupt or unavailable. Original storage was preserved. Export your editor draft; recover the library before saving or deleting.',
    );
  }
  const maps = readMaps();
  if (
    !Array.isArray(raw) ||
    raw.length > MAP_LIMIT ||
    maps.length !== raw.length ||
    new Set(maps.map((item) => item.id)).size !== maps.length
  )
    throw Error(
      'Library contains unsupported or corrupt entries. Original storage was preserved. Export your editor draft; recover the library before saving or deleting.',
    );
  return maps;
}
export function saveMapCopy(map: MapDefinition): void {
  const maps = mutableMaps();
  if (maps.length >= MAP_LIMIT)
    throw Error(`Library is full (${MAP_LIMIT} maps). Delete a map first.`);
  maps.push({ id: crypto.randomUUID(), map: decodeMap(encodeMap(map)) });
  try {
    localStorage.setItem(KEY, JSON.stringify(maps));
  } catch {
    throw Error(
      'Map could not be saved. Browser storage is unavailable or full; export JSON to keep your work.',
    );
  }
}
export function deleteMap(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(mutableMaps().filter((item) => item.id !== id)));
}
export function getSelectedMap(selector: string): MapDefinition {
  const value = document.getElementById(selector) as HTMLSelectElement | null;
  const builtin = BUILTIN_MAPS.find((map) => `builtin-${map.width}` === value?.value);
  if (builtin) return builtin;
  if (!value?.value) throw Error('No map is selected. Choose a supported map before starting.');
  const map = readMaps().find((entry) => entry.id === value.value)?.map;
  if (!map || validateMap(map).errors.length)
    throw Error(
      'The selected map is unavailable or no longer playable. Legacy 64 × 64 maps are unsupported. Choose a supported map again.',
    );
  return map;
}
export function refreshMapSelectors(): void {
  for (const id of ['skirmish-map', 'multiplayer-map']) {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (!select) continue;
    const previous = select.value;
    select.replaceChildren(
      ...BUILTIN_MAPS.map(
        (map) => new Option(`${mapSizeLabel(map.width)} · ${map.name}`, `builtin-${map.width}`),
      ),
    );
    for (const { id, map } of readMaps())
      if (!validateMap(map).errors.length)
        select.add(new Option(`${map.name} · ${mapSizeLabel(map.width)}`, id));
    const notice = mapLibraryNotice();
    if (notice) {
      const option = new Option(notice, '__unsupported-library');
      option.disabled = true;
      select.add(option);
    }
    if (previous && ![...select.options].some((option) => option.value === previous)) {
      const unavailable = new Option(
        'Selected map unavailable or unsupported · choose another map',
        previous,
      );
      unavailable.disabled = true;
      select.add(unavailable);
    }
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  }
}
