import type { GameState } from '../../game/index.js';
import { deserialize, serialize } from '../../game/index.js';
import type { ClientContext } from '../context.js';
import { element as $, errorMessage, optionalElement } from './dom.js';
import { SAVE_KEY, SETTINGS_KEY } from './services.js';
export function saveSettings(app: ClientContext) {
  app.settings = {
    sound: $('sound').value === 'on' ? 'on' : 'off',
    cameraSpeed: Number($('camera-speed').value),
  };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(app.settings));
  } catch {
    /* Browser storage or disconnect cleanup is optional. */
  }
  app.sound();
}
export function save(app: Pick<ClientContext, 'online' | 'started' | 'state' | 'toast'>) {
  if (app.online || !app.started || app.state.status !== 'playing') return;
  try {
    localStorage.setItem(SAVE_KEY, serialize(app.state));
    app.toast('Your kingdom has been saved in this browser.');
  } catch {
    app.toast('Browser storage is unavailable.');
  }
}
export function load(app: ClientContext, raw?: string): GameState | undefined {
  if (app.online) return;
  try {
    const source = raw || localStorage.getItem(SAVE_KEY);
    if (!source) {
      app.toast(
        localStorage.getItem('saffron-keep-save-v1')
          ? 'An older Saffron Keep save was found. Version 1 saves cannot be loaded in this expanded game. Start a new kingdom.'
          : 'No saved kingdom yet. Save a local game first.',
      );
      return;
    }
    const loaded = deserialize(source);
    optionalElement('menu-connection-notice')?.setAttribute('hidden', '');
    app.state = loaded;
    app.team = 'player';
    app.started = true;
    app.paused = false;
    app.lastEvent = app.state.events.length;
    app.clearSelection();
    app.groups.clear();
    app.center();
    app.setModal(null);
    app.renderLedger();
    app.refresh();
    app.toast('Your saved kingdom has been restored.');
    return app.state;
  } catch (e) {
    app.toast(errorMessage(e) || 'This save could not be loaded.');
  }
}
export function bindPersistence(app: ClientContext): void {
  $('sound').value = app.settings.sound;
  $('camera-speed').value = String(app.settings.cameraSpeed);
  $('sound').onchange = app.saveSettings;
  $('camera-speed').onchange = app.saveSettings;
  $('load-saved').onclick = () => app.load();
  $('save').onclick = app.save;
  $('load').onclick = () => app.load();
  $('pause').onclick = () => {
    if (!app.online) {
      app.paused = !app.paused;
      app.refresh();
    }
  };
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]'))
    b.onclick = () => {
      if (!app.online) {
        app.speed = Number(b.dataset.speed);
        app.paused = false;
        app.refresh();
      }
    };
}
