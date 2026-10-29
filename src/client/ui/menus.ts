import { getSelectedMap } from './map-library.js';
import { modalAfterClose, requiresLeaveConfirmation } from './interaction.js';
import type { GameOptions } from '../../game/index.js';
import * as sim from '../../game/index.js';
import type { ClientContext, Modal } from '../context.js';
import { element as $, buttonTarget, esc, time } from './dom.js';
import { PROGRESS_KEY } from './services.js';
export function setModal(app: ClientContext, name: Modal) {
  app.modal = name;
  app.rallyBuilding = null;
  app.pointer = null;
  $('modal-backdrop').hidden = !name;
  for (const section of $('modal-backdrop').children)
    if (section instanceof HTMLElement) section.hidden = section.id !== name;
  $('resume').hidden = !app.started || app.online;
  if (name === 'campaign') app.renderMissions();
  if (name === 'stockpile') app.renderStockpile();
  app.keys.clear();
}
export function closeModal(app: ClientContext) {
  if (app.modal === 'result' && app.state.status !== 'playing') {
    void app.menu();
    return;
  }
  app.setModal(
    modalAfterClose({
      current: app.modal,
      returnModal: app.returnModal,
      online: app.online,
      started: app.started,
      roomStatus: app.room?.status,
    }),
  );
  app.returnModal = null;
  $('world').focus();
}
export function showResult(app: ClientContext) {
  const won = app.online
    ? app.state.winner === app.team ||
      (app.room?.multiplayerMode === 'coop' && app.state.status === 'victory')
    : app.state.status === 'victory';
  if (won && app.state.mode === 'campaign') {
    app.progress.unlocked = Math.max(app.progress.unlocked, (app.state.scenario || 0) + 1);
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(app.progress));
    } catch {
      /* Browser storage or disconnect cleanup is optional. */
    }
  }
  $('result-icon').textContent = won ? '♜' : '⚑';
  $('result-title').textContent = won ? 'The valley is yours.' : 'The keep has fallen.';
  $('result-copy').textContent = won
    ? 'Your people have endured. Your standard flies above the sands.'
    : 'Your realm has fallen. A stronger economy, protected approaches and a well supplied army will turn the next battle.';
  $('result-stats').innerHTML =
    `<span><b>${time(app.state.time)}</b><small>TIME IN VALLEY</small></span><span><b>${app.state.kills || 0}</b><small>ENEMIES DEFEATED</small></span><span><b>${app.state.buildings.filter(app.owned).length}</b><small>BUILDINGS STANDING</small></span>`;
  $('next-mission').hidden = !(won && app.state.mode === 'campaign' && app.state.scenario < 2);
  app.setModal('result');
}
export function renderMissions(app: ClientContext) {
  $('missions').innerHTML = [
    ['A foothold in the sands', 'Establish the first desert stronghold.'],
    ['The caravan road', 'Break the rival hold on the trade route.'],
    ['The last citadel', 'Overcome the strongest rival in the valley.'],
  ]
    .map(
      ([name, copy], i) =>
        `<button class="mission" data-scenario="${i}" ${i > app.progress.unlocked ? 'disabled' : ''}><b>${String(i + 1).padStart(2, '0')} · ${esc(sim.SCENARIOS?.[i]?.name || name)}</b><small>${esc(sim.SCENARIOS?.[i]?.description || copy)}</small><span>${i > app.progress.unlocked ? 'Locked · complete the previous chapter' : i < app.progress.unlocked ? 'Completed · play again' : 'Begin chapter →'}</span></button>`,
    )
    .join('');
}
export async function menu(app: ClientContext) {
  if (requiresLeaveConfirmation(app.online, app.room?.status)) {
    app.returnModal = null;
    app.setModal('battle-menu');
    return;
  }
  if (app.online) await app.leaveOnline();
  if (app.state.status !== 'playing') app.started = false;
  app.returnModal = null;
  app.setModal('menu');
}
export function bindMenus(app: ClientContext): void {
  let setupMode: 'skirmish' | 'sandbox' | 'survival' = 'skirmish';
  function configureSetup(mode: typeof setupMode) {
    setupMode = mode;
    document.querySelector('#skirmish h1')!.textContent =
      mode === 'sandbox'
        ? 'Build your kingdom.'
        : mode === 'survival'
          ? 'Prepare for the siege.'
          : 'Choose your rival.';
    document.querySelector('#skirmish p')!.textContent =
      mode === 'sandbox'
        ? 'Choose a map and build at your own pace. Call an invasion when ready.'
        : mode === 'survival'
          ? 'Choose a map, raise your defenses and survive four raids.'
          : 'Build an economy, arm your soldiers and destroy the rival keep while protecting your own.';
    $('opponent').closest('label')!.hidden = mode !== 'skirmish';
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-open]'))
    b.onclick = () => {
      app.returnModal = 'menu';
      if (b.dataset.open === 'skirmish') configureSetup('skirmish');
      app.setModal(b.dataset.open as Modal);
    };
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]'))
    b.onclick = () => {
      configureSetup(b.dataset.mode === 'sandbox' ? 'sandbox' : 'survival');
      app.returnModal = 'menu';
      app.setModal('skirmish');
    };
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-back]'))
    b.onclick = () => app.setModal('menu');
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-close]'))
    b.onclick = app.closeModal;
  $('missions').onclick = (e) => {
    const b = buttonTarget(e);
    if (b && !b.disabled)
      app.begin({ mode: 'campaign', scenario: Number(b.dataset.scenario), difficulty: 'normal' });
  };
  const setupError = document.createElement('p');
  setupError.setAttribute('role', 'alert');
  $('start-skirmish').before(setupError);
  $('start-skirmish').onclick = () => {
    setupError.textContent = '';
    try {
      app.begin({
        mode: setupMode,
        map: getSelectedMap('skirmish-map'),
        difficulty:
          $('difficulty').value === 'easy'
            ? 'easy'
            : $('difficulty').value === 'hard'
              ? 'hard'
              : 'normal',
        scenario: Number($('opponent').value),
      });
    } catch (error) {
      setupError.textContent = error instanceof Error ? error.message : String(error);
    }
  };
  $('resume').onclick = () => app.setModal(null);
  $('menu-button').onclick = () => app.menu();
  $('help').onclick = () => {
    app.returnModal = app.modal;
    app.setModal('guide');
  };
  $('stockpile-button').onclick = () => {
    app.returnModal = null;
    app.setModal('stockpile');
  };
  $('dismiss-objectives').onclick = () => {
    $('objectives').hidden = true;
    $('show-objectives').hidden = false;
  };
  $('show-objectives').onclick = () => {
    $('objectives').hidden = false;
    $('show-objectives').hidden = true;
  };
  $('resume-battle').onclick = () => app.setModal(null);
  $('request-leave').onclick = () => app.setModal('leave-confirm');
  $('cancel-leave').onclick = () => app.setModal('battle-menu');
  $('confirm-leave').onclick = async () => {
    await app.leaveOnline();
    app.returnModal = null;
    app.setModal('menu');
  };
  $('result-menu').onclick = app.menu;
  $('play-again').onclick = async () => {
    const options: GameOptions = {
      mode: app.state.mode === 'multiplayer' ? 'skirmish' : app.state.mode,
      difficulty: app.state.difficulty,
      scenario: app.state.scenario,
      map: app.state.map,
    };
    if (app.online) await app.leaveOnline();
    app.begin(options);
  };
  $('next-mission').onclick = () =>
    app.begin({
      mode: 'campaign',
      scenario: app.state.scenario + 1,
      difficulty: app.state.difficulty,
    });
}
