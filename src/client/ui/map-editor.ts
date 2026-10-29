import {
  SMALL_MAP,
  BUILTIN_MAPS,
  mapSizeLabel,
  MAX_MAP_BYTES,
  STARTER_BUILDINGS,
  TYPES,
  decodeMap,
  encodeMap,
  validateMap,
} from '../../game/index.js';
import type { MapDefinition, GameOptions, Point } from '../../game/index.js';
import type { ClientContext } from '../context.js';
import {
  deleteMap,
  deleteUnsupportedMaps,
  mapLibraryNotice,
  readMaps,
  refreshMapSelectors,
  saveMapCopy,
} from './map-library.js';
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
  EditorDraftStorage,
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
  <div class="map-actions"><button id="map-undo">Undo</button><button id="map-redo">Redo</button><button id="map-template">Default template</button><label>New map size<select id="map-dimensions"><option value="128">Small · 128 × 128</option><option value="256">Medium · 256 × 256</option><option value="512">Large · 512 × 512</option></select></label><button id="map-blank">Blank sand</button></div>
  <small id="map-library-notice" role="status"></small><label>Local library<select id="map-library"><option value="">Choose saved map</option></select></label><div class="map-actions"><button id="map-open">Open copy</button><button id="map-delete">Delete selected</button><button id="map-delete-unsupported">Delete unsupported legacy maps</button><button id="map-save">Save new copy / draft</button></div><small>Up to 20 maps in this browser. Each save creates a new copy. Export for a durable backup. Drafts with errors cannot be played.</small></div>
  <div class="map-canvas-wrap"><small id="map-current-size"></small><label>Editor zoom<select id="map-zoom"><option value="1">Fit</option><option value="2">2×</option><option value="4">4×</option><option value="8">8×</option></select></label><div class="map-viewport"><canvas id="map-canvas" width="768" height="768" tabindex="0" aria-label="128 by 128 map painting canvas"></canvas></div><small>Scroll the zoomed map to reach any tile. Paint by dragging. P1 / P2 / E mark keep origins; R is the raid entry. Ctrl/⌘ Z: undo · Shift Z: redo.</small></div>
  <div class="map-tools"><div id="map-draft-state" role="status"></div><button id="map-replace-draft" hidden>Replace unsupported browser draft</button><div id="map-status" role="status"></div><div id="map-issues"></div><label>Play mode<select id="map-mode"><option value="sandbox">Sandbox playtest</option><option value="skirmish">Skirmish</option><option value="survival">Survival</option></select></label><label>Difficulty<select id="map-difficulty"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option></select></label><button id="map-play" class="primary">Play this map</button><small>Use Return to editor during playtest to keep editing the same draft.</small><button id="map-export">Export .crusader-map.json</button><label>Import map file<input id="map-file" type="file" accept=".json,.crusader-map.json,application/json"></label><label>Paste map JSON / export text<textarea id="map-json" rows="7" spellcheck="false"></textarea></label><button id="map-import">Import pasted JSON</button><button id="map-json-export">Show export JSON</button></div></div>`;
  backdrop.append(panel);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const input = (id: string) => el<HTMLInputElement>(id);
  const status = (message: string) => {
    el('map-status').textContent = message;
  };
  let draft = clone(SMALL_MAP),
    painting = false,
    metadataPending = false,
    lastCell: Point | null = null;
  const history = new EditorHistory();
  let savedContent = JSON.stringify(draft);
  const checkpoint = () => history.checkpoint(draft);
  const draftStorage = new EditorDraftStorage(
    () => localStorage.getItem(DRAFT_KEY),
    (raw) => localStorage.setItem(DRAFT_KEY, raw),
  );
  function recover() {
    try {
      const recovered = draftStorage.recover();
      if (recovered) {
        draft = recovered;
        status('Recovered editor draft from this browser.');
      }
    } catch (error) {
      el('map-replace-draft').hidden = false;
      status(
        `Draft recovery unavailable: ${String(error)}. Only version 2 maps of 128 × 128, 256 × 256, or 512 × 512 are supported. Original browser draft was preserved; showing a new Small template. Recovery stays protected until you explicitly replace the browser draft.`,
      );
    }
  }
  function persistDraft() {
    if (draftStorage.protectedDraft) {
      el('map-draft-state').textContent =
        'Original browser draft preserved · current edits are not saved for recovery. Export your work or explicitly replace the browser draft.';
      return;
    }
    el('map-draft-state').textContent =
      JSON.stringify(draft) === savedContent
        ? 'Saved copy / template'
        : 'Unsaved library changes · recovery saved';
    try {
      const raw = JSON.stringify(draft);
      if (new TextEncoder().encode(raw).length > MAX_MAP_BYTES) throw Error('Draft too large');
      draftStorage.persist(raw);
    } catch (error) {
      el('map-draft-state').textContent = 'Unsaved changes · recovery unavailable';
      status(`Keep an export backup. ${String(error)}`);
    }
  }
  el('map-replace-draft').onclick = () => {
    if (
      !window.confirm(
        'Replace the unsupported browser draft with the current map? The original draft will be permanently overwritten.',
      )
    )
      return;
    try {
      const raw = JSON.stringify(draft);
      if (new TextEncoder().encode(raw).length > MAX_MAP_BYTES) throw Error('Draft too large');
      draftStorage.replace(raw);
      el('map-replace-draft').hidden = true;
      persistDraft();
      status('Browser recovery draft replaced with the current map.');
    } catch (error) {
      status(`Original browser draft remains protected. ${String(error)}`);
    }
  };
  recover();
  const canvas = el<HTMLCanvasElement>('map-canvas'),
    ctx = canvas.getContext('2d')!;
  function library() {
    const select = el<HTMLSelectElement>('map-library');
    select.replaceChildren(new Option('Choose saved map', ''));
    el('map-library-notice').textContent = mapLibraryNotice();
    for (const item of readMaps())
      select.add(
        new Option(
          `${item.map.name} · ${mapSizeLabel(item.map.width)}${validateMap(item.map).errors.length ? ' (draft)' : ''}`,
          item.id,
        ),
      );
    refreshMapSelectors();
  }
  const terrainCanvas = document.createElement('canvas'),
    terrainContext = terrainCanvas.getContext('2d')!;
  let drawnRows: readonly string[] = [];
  function fitCanvas() {
    const viewport = canvas.parentElement!,
      width = viewport.getBoundingClientRect().width;
    if (width <= 0) return;
    const fit = Math.min(width, window.innerHeight * 0.65);
    viewport.style.height = `${fit}px`;
    canvas.style.width = `${fit * Number(input('map-zoom').value)}px`;
  }
  input('map-zoom').onchange = fitCanvas;
  window.addEventListener('resize', fitCanvas);
  function draw() {
    const resolution = Math.max(768, draft.width * 2);
    if (canvas.width !== resolution) {
      canvas.width = resolution;
      canvas.height = resolution;
    }
    const cell = canvas.width / draft.width;
    fitCanvas();
    el('map-current-size').textContent = `Editing ${mapSizeLabel(draft.width)}`;
    canvas.setAttribute('aria-label', `${mapSizeLabel(draft.width)} map painting canvas`);
    if (terrainCanvas.width !== draft.width) {
      terrainCanvas.width = draft.width;
      terrainCanvas.height = draft.height;
      drawnRows = [];
    }
    for (let y = 0; y < draft.height; y++) {
      if (drawnRows[y] === draft.terrain[y]) continue;
      const row = terrainContext.createImageData(draft.width, 1);
      for (let x = 0; x < draft.width; x++) {
        const color = colors[draft.terrain[y][x]];
        row.data[x * 4] = parseInt(color.slice(1, 3), 16);
        row.data[x * 4 + 1] = parseInt(color.slice(3, 5), 16);
        row.data[x * 4 + 2] = parseInt(color.slice(5, 7), 16);
        row.data[x * 4 + 3] = 255;
      }
      terrainContext.putImageData(row, 0, y);
    }
    drawnRows = draft.terrain;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(terrainCanvas, 0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#00000012';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= draft.width; i++) {
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, canvas.height);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(canvas.width, i * cell);
    }
    ctx.stroke();
    for (const [team, point] of Object.entries(draft.spawns)) {
      ctx.strokeStyle = team === 'enemy' ? '#a23625' : team === 'player2' ? '#345795' : '#126569';
      ctx.lineWidth = 2;
      for (const [type, dx, dy] of STARTER_BUILDINGS) {
        const size = TYPES[type].size;
        ctx.fillStyle = '#ffffff30';
        ctx.fillRect((point.x + dx) * cell, (point.y + dy) * cell, size * cell, size * cell);
        ctx.strokeRect((point.x + dx) * cell, (point.y + dy) * cell, size * cell, size * cell);
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
        point.x * cell,
        point.y * cell,
        name === 'raid' ? cell : cell * 3,
        name === 'raid' ? cell : cell * 3,
      );
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(
        { player: 'P1', player2: 'P2', enemy: 'E', raid: 'R' }[name]!,
        Math.min(canvas.width - 18, point.x * cell + 1),
        Math.min(canvas.height - 2, point.y * cell + 12),
      );
    }
    el<HTMLButtonElement>('map-undo').disabled = !history.canUndo;
    el<HTMLButtonElement>('map-redo').disabled = !history.canRedo;
    if (painting || metadataPending) {
      el<HTMLButtonElement>('map-play').disabled = true;
      el('map-issues').textContent = painting
        ? 'Painting · readiness checks resume when the stroke ends.'
        : 'Checking updated map details…';
      return;
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
    }
    clearTimeout(recoveryTimer);
    metadataPending = false;
    draw();
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
        metadataPending = true;
        draw();
      }
      clearTimeout(recoveryTimer);
      recoveryTimer = setTimeout(() => {
        metadataPending = false;
        draw();
        persistDraft();
      }, 250);
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
      x = Math.max(
        0,
        Math.min(draft.width - 1, Math.floor(((e.clientX - rect.left) / rect.width) * draft.width)),
      ),
      y = Math.max(
        0,
        Math.min(
          draft.height - 1,
          Math.floor(((e.clientY - rect.top) / rect.height) * draft.height),
        ),
      );
    const cell = { x, y };
    if (lastCell?.x === x && lastCell.y === y) return;
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
  function finishStroke() {
    if (!painting) return;
    painting = false;
    lastCell = null;
    draw();
    persistDraft();
  }
  canvas.onpointerup = canvas.onpointercancel = canvas.onlostpointercapture = finishStroke;
  window.addEventListener('blur', finishStroke);
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
  el('map-template').onclick = () =>
    load(BUILTIN_MAPS.find((map) => map.width === Number(input('map-dimensions').value))!);
  el('map-blank').onclick = () => {
    const template = BUILTIN_MAPS.find(
      (map) => map.width === Number(input('map-dimensions').value),
    )!;
    load({
      ...template,
      name: 'Untitled map',
      author: '',
      description: '',
      terrain: Array(template.height).fill('s'.repeat(template.width)),
    });
  };
  el('map-close').onclick = () => app.setModal('menu');
  el('map-delete-unsupported').onclick = () => {
    try {
      if (
        !window.confirm(
          'Permanently delete unsupported version 1 and 64 × 64 library maps? All other entries will be preserved.',
        )
      )
        return;
      const removed = deleteUnsupportedMaps();
      library();
      status(
        `${removed} unsupported legacy library map${removed === 1 ? '' : 's'} deleted. Other entries were preserved.${mapLibraryNotice() ? ' Unsupported or corrupt entries remain and require manual recovery.' : ''}`,
      );
    } catch (error) {
      status(String(error));
    }
  };
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
      status(`Map file is too large (${MAX_MAP_BYTES / 1024} KB maximum).`);
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
    fitCanvas();
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
    fitCanvas();
  };
  library();
  sync();
  el('map-draft-state').textContent = draftStorage.protectedDraft
    ? 'Original browser draft preserved · export current edits or explicitly replace the browser draft.'
    : JSON.stringify(draft) === savedContent
      ? 'Default template'
      : 'Recovered draft · save a library copy or export';

  draw();
}
