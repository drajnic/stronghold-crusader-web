import { DEFAULT_MAP, decodeMap, encodeMap, validateMap } from '../../game/index.js';
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
      'Library contains corrupt entries. Original storage was preserved. Export your editor draft; recover the library before saving or deleting.',
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
export function getSelectedMap(selector: string): MapDefinition | undefined {
  const value = document.getElementById(selector) as HTMLSelectElement | null;
  return readMaps().find(
    (entry) => entry.id === value?.value && !validateMap(entry.map).errors.length,
  )?.map;
}
export function refreshMapSelectors(): void {
  for (const id of ['skirmish-map', 'multiplayer-map']) {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (!select) continue;
    const previous = select.value;
    select.replaceChildren(new Option(DEFAULT_MAP.name, 'default'));
    for (const { id, map } of readMaps())
      if (!validateMap(map).errors.length) select.add(new Option(map.name, id));
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  }
}
