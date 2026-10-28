import {
  DEFAULT_MAP,
  MAX_MAP_BYTES,
  STARTER_BUILDINGS,
  TYPES,
  decodeMap,
  encodeMap,
  validateMap,
} from '../../game/index.js';
import type { MapDefinition, GameOptions, Point } from '../../game/index.js';
import type { ClientContext } from '../context.js';
import { deleteMap, readMaps, refreshMapSelectors, saveMapCopy } from './map-library.js';
const colors: Record<string, string> = {
  s: '#d3b47b',
  w: '#438f94',
  g: '#95aa61',
  t: '#446a3c',
  r: '#b5a586',
  i: '#827b63',
  p: '#514d38',
};
import {
  cloneMap as clone,
  decodeDraft,
  EditorHistory,
  paintStroke,
  updateMetadata,
} from './map-editor-model.js';
const DRAFT_KEY = 'crusader.editor-draft.v1';
export function bindMapEditor(app: ClientContext): void {
  const backdrop = document.getElementById('modal-backdrop')!;
  const panel = document.createElement('section');
  panel.id = 'maps';
  panel.className = 'modal map-editor';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Map builder');
  panel.innerHTML = `<header><div><div class="eyebrow">THE CARTOGRAPHER</div><h1>Maps & editor</h1></div><button id="map-close">Back to menu</button></header>
  <div class="map-workspace"><div class="map-tools"><label>Name<input id="map-name" maxlength="80"></label><label>Author<input id="map-author" maxlength="80"></label><label>Description<textarea id="map-description" maxlength="500" rows="2"></textarea></label>
  <label>Paint / place<select id="map-brush"><option value="s">Sand</option><option value="w">Water</option><option value="g">Grass</option><option value="t">Trees</option><option value="r">Stone</option><option value="i">Iron</option><option value="p">Pitch</option><option value="player">Player keep</option><option value="player2">Second player keep</option><option value="enemy">Enemy keep</option><option value="raid">Raid entry</option></select></label><label>Brush size<select id="map-size"><option>1</option><option>3</option><option>5</option></select></label>
  <div class="map-actions"><button id="map-undo">Undo</button><button id="map-redo">Redo</button><button id="map-template">Default template</button><button id="map-blank">Blank sand</button></div>
  <label>Local library<select id="map-library"><option value="">Choose saved map</option></select></label><div class="map-actions"><button id="map-open">Open copy</button><button id="map-delete">Delete selected</button><button id="map-save">Save new copy / draft</button></div><small>Up to 20 maps in this browser. Each save creates a new copy. Export for a durable backup. Drafts with errors cannot be played.</small></div>
  <div class="map-canvas-wrap"><canvas id="map-canvas" width="768" height="768" tabindex="0" aria-label="64 by 64 map painting canvas"></canvas><small>Paint by dragging. P1 / P2 / E mark keep origins; R is the raid entry. Ctrl/⌘ Z: undo · Shift Z: redo.</small></div>
  <div class="map-tools"><div id="map-draft-state" role="status"></div><div id="map-status" role="status"></div><div id="map-issues"></div><label>Play mode<select id="map-mode"><option value="sandbox">Sandbox playtest</option><option value="skirmish">Skirmish</option><option value="survival">Survival</option></select></label><label>Difficulty<select id="map-difficulty"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option></select></label><button id="map-play" class="primary">Play this map</button><small>Use Return to editor during playtest to keep editing the same draft.</small><button id="map-export">Export .crusader-map.json</button><label>Import map file<input id="map-file" type="file" accept=".json,.crusader-map.json,application/json"></label><label>Paste map JSON / export text<textarea id="map-json" rows="7" spellcheck="false"></textarea></label><button id="map-import">Import pasted JSON</button><button id="map-json-export">Show export JSON</button></div></div>`;
  backdrop.append(panel);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const input = (id: string) => el<HTMLInputElement>(id);
  const status = (message: string) => {
    el('map-status').textContent = message;
  };
  let draft = clone(DEFAULT_MAP),
    painting = false,
    lastCell: Point | null = null;
  const history = new EditorHistory();
  let savedContent = JSON.stringify(draft);
  const checkpoint = () => history.checkpoint(draft);
  function recover() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        draft = decodeDraft(raw);
        status('Recovered editor draft from this browser.');
      }
    } catch (error) {
      status(`Draft recovery unavailable: ${String(error)}`);
    }
  }
  function persistDraft() {
    el('map-draft-state').textContent =
      JSON.stringify(draft) === savedContent
        ? 'Saved copy / template'
        : 'Unsaved library changes · recovery saved';
    try {
      const raw = JSON.stringify(draft);
      if (new TextEncoder().encode(raw).length > MAX_MAP_BYTES) throw Error('Draft too large');
      localStorage.setItem(DRAFT_KEY, raw);
    } catch (error) {
      el('map-draft-state').textContent = 'Unsaved changes · recovery unavailable';
      status(`Keep an export backup. ${String(error)}`);
    }
  }
  recover();
  const canvas = el<HTMLCanvasElement>('map-canvas'),
    ctx = canvas.getContext('2d')!;
  function library() {
    const select = el<HTMLSelectElement>('map-library');
    select.replaceChildren(new Option('Choose saved map', ''));
    for (const item of readMaps())
      select.add(
        new Option(
          `${item.map.name}${validateMap(item.map).errors.length ? ' (draft)' : ''}`,
          item.id,
        ),
      );
    refreshMapSelectors();
  }
  function draw() {
    draft.terrain.forEach((row, y) =>
      [...row].forEach((code, x) => {
        ctx.fillStyle = colors[code];
        ctx.fillRect(x * 12, y * 12, 12, 12);
      }),
    );
    ctx.strokeStyle = '#00000012';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 64; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 12, 0);
      ctx.lineTo(i * 12, 768);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * 12);
      ctx.lineTo(768, i * 12);
      ctx.stroke();
    }
    for (const [team, point] of Object.entries(draft.spawns)) {
      ctx.strokeStyle = team === 'enemy' ? '#a23625' : team === 'player2' ? '#345795' : '#126569';
      ctx.lineWidth = 2;
      for (const [type, dx, dy] of STARTER_BUILDINGS) {
        const size = TYPES[type].size;
        ctx.fillStyle = '#ffffff30';
        ctx.fillRect((point.x + dx) * 12, (point.y + dy) * 12, size * 12, size * 12);
        ctx.strokeRect((point.x + dx) * 12, (point.y + dy) * 12, size * 12, size * 12);
      }
    }
    for (const [name, point] of Object.entries({ ...draft.spawns, raid: draft.raid })) {
      ctx.fillStyle =
        name === 'raid'
          ? '#a73529'
          : name === 'enemy'
            ? '#bc523c'
            : name === 'player2'
              ? '#456fbd'
              : '#127f80';
      ctx.fillRect(
        point.x * 12,
        point.y * 12,
        name === 'raid' ? 12 : 36,
        name === 'raid' ? 12 : 36,
      );
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(
        { player: 'P1', player2: 'P2', enemy: 'E', raid: 'R' }[name]!,
        point.x * 12 + 1,
        point.y * 12 + 12,
      );
    }
    const { errors, warnings } = validateMap(draft);
    el('map-issues').replaceChildren();
    for (const message of [
      ...errors.map((e) => `Error: ${e}`),
      ...warnings.map((e) => `Warning: ${e}`),
    ]) {
      const p = document.createElement('p');
      p.textContent = message;
      el('map-issues').append(p);
    }
    if (!errors.length && !warnings.length) el('map-issues').textContent = 'Ready to play.';
    el<HTMLButtonElement>('map-play').disabled = errors.length > 0;
    el<HTMLButtonElement>('map-undo').disabled = !history.canUndo;
    el<HTMLButtonElement>('map-redo').disabled = !history.canRedo;
  }
  function load(map: MapDefinition) {
    checkpoint();
    draft = clone(map);
    persistDraft();
    input('map-name').value = draft.name;
    input('map-author').value = draft.author;
    input('map-description').value = draft.description;
    draw();
  }
  let metadataSession = false;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  function flushMetadata() {
    const updated = updateMetadata(draft, {
      name: input('map-name').value,
      author: input('map-author').value,
      description: input('map-description').value,
    });
    if (updated !== draft) {
      if (!metadataSession) checkpoint();
      metadataSession = true;
      draft = updated;
      draw();
    }
    clearTimeout(recoveryTimer);
    persistDraft();
  }
  for (const field of ['name', 'author', 'description'] as const) {
    const control = input(`map-${field}`);
    control.addEventListener('focus', () => {
      metadataSession = false;
    });
    control.addEventListener('input', () => {
      const updated = updateMetadata(draft, {
        name: input('map-name').value,
        author: input('map-author').value,
        description: input('map-description').value,
      });
      if (updated !== draft) {
        if (!metadataSession) checkpoint();
        metadataSession = true;
        draft = updated;
        draw();
      }
      clearTimeout(recoveryTimer);
      recoveryTimer = setTimeout(persistDraft, 250);
    });
    control.addEventListener('blur', () => {
      flushMetadata();
      metadataSession = false;
    });
  }
  panel.addEventListener(
    'click',
    (event) => {
      if (event.target instanceof Element && event.target.closest('button')) flushMetadata();
    },
    true,
  );
  function paint(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect(),
      x = Math.max(0, Math.min(63, Math.floor(((e.clientX - rect.left) / rect.width) * 64))),
      y = Math.max(0, Math.min(63, Math.floor(((e.clientY - rect.top) / rect.height) * 64)));
    const cell = { x, y };
    draft = paintStroke(
      draft,
      lastCell || cell,
      cell,
      input('map-brush').value,
      Number(input('map-size').value),
    );
    lastCell = cell;
    draw();
  }
  canvas.onpointerdown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    flushMetadata();
    metadataSession = false;
    checkpoint();
    painting = true;
    lastCell = null;
    canvas.setPointerCapture(e.pointerId);
    paint(e);
  };
  canvas.onpointermove = (e) => {
    if (painting) paint(e);
  };
  canvas.onpointerup = canvas.onpointercancel = () => {
    painting = false;
    lastCell = null;
    persistDraft();
  };
  el('map-undo').onclick = () => {
    draft = history.undo(draft);
    persistDraft();
    sync();
  };
  el('map-redo').onclick = () => {
    draft = history.redo(draft);
    persistDraft();
    sync();
  };
  function sync() {
    input('map-name').value = draft.name;
    input('map-author').value = draft.author;
    input('map-description').value = draft.description;
    draw();
  }
  panel.addEventListener('keydown', (e) => {
    if (
      (e.ctrlKey || e.metaKey) &&
      e.key.toLowerCase() === 'z' &&
      !(e.target instanceof HTMLInputElement) &&
      !(e.target instanceof HTMLTextAreaElement)
    ) {
      e.preventDefault();
      e.stopPropagation();
      el(e.shiftKey ? 'map-redo' : 'map-undo').click();
    }
  });
  el('map-template').onclick = () => load(DEFAULT_MAP);
  el('map-blank').onclick = () =>
    load({
      ...DEFAULT_MAP,
      name: 'Untitled map',
      author: '',
      description: '',
      terrain: Array(64).fill('s'.repeat(64)),
    });
  el('map-close').onclick = () => app.setModal('menu');
  el('map-save').onclick = () => {
    try {
      saveMapCopy(draft);
      savedContent = JSON.stringify(draft);
      persistDraft();
      library();
      status(
        validateMap(draft).errors.length
          ? 'Draft saved. Resolve errors before playing.'
          : 'Playable map saved as a new copy.',
      );
    } catch (e) {
      status(String(e));
    }
  };
  el('map-open').onclick = () => {
    const item = readMaps().find((item) => item.id === input('map-library').value);
    if (item) {
      load(item.map);
      status('Opened a copy. Current work remains available with Undo.');
    }
  };
  el('map-delete').onclick = () => {
    try {
      deleteMap(input('map-library').value);
      library();
      status('Selected library copy deleted. Editor draft retained.');
    } catch (e) {
      status(String(e));
    }
  };
  function importRaw(raw: string) {
    try {
      load(decodeMap(raw));
      status('Imported into editor. Save a copy to add it to your library.');
    } catch (e) {
      status(`Import failed: ${String(e)}`);
    }
  }
  el('map-import').onclick = () => importRaw(input('map-json').value);
  input('map-file').onchange = async () => {
    const file = input('map-file').files?.[0];
    if (!file) return;
    if (file.size > MAX_MAP_BYTES) {
      status('Map file is too large (16 KB maximum).');
      return;
    }
    try {
      importRaw(await file.text());
    } catch (e) {
      status(String(e));
    }
    input('map-file').value = '';
  };
  el('map-json-export').onclick = () => {
    try {
      input('map-json').value = encodeMap(draft);
      status('Export JSON is ready to copy.');
    } catch (error) {
      status(`Export failed: ${String(error)}`);
    }
  };
  el('map-export').onclick = () => {
    let json: string;
    try {
      json = encodeMap(draft);
    } catch (error) {
      status(`Export failed: ${String(error)}`);
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draft.name.replace(/[^a-z0-9_-]/gi, '-') || 'map'}.crusader-map.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const returnButton = document.createElement('button');
  returnButton.id = 'return-map-editor';
  returnButton.textContent = 'Return to editor';
  returnButton.hidden = true;
  el('menu-button').after(returnButton);
  returnButton.onclick = () => {
    if (app.online) return;
    app.setModal('maps');
    returnButton.hidden = true;
  };
  el('map-play').onclick = () => {
    if (validateMap(draft).errors.length) return;
    app.begin({
      mode: input('map-mode').value as GameOptions['mode'],
      difficulty: input('map-difficulty').value as GameOptions['difficulty'],
      map: decodeMap(encodeMap(draft)),
    });
    returnButton.hidden = false;
  };
  for (const id of ['skirmish', 'multiplayer']) {
    const label = document.createElement('label');
    label.className = 'form-label';
    label.textContent = 'Map';
    const select = document.createElement('select');
    select.id = `${id}-map`;
    label.append(select);
    el(id).querySelector('h1')!.after(label);
  }
  el('open-maps').onclick = () => {
    library();
    app.setModal('maps');
  };
  library();
  sync();
  el('map-draft-state').textContent =
    JSON.stringify(draft) === savedContent
      ? 'Default template'
      : 'Recovered draft · save a library copy or export';

  draw();
}
