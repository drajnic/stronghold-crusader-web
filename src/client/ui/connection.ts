import { getSelectedMap } from './map-library.js';
import { resetOfflineSession } from './session-state.js';
import { deserialize, encodeMap } from '../../game/index.js';
import type { ClientContext } from '../context.js';
import { MultiplayerSession } from '../network.js';
import { element as $, errorMessage, esc, optionalElement } from './dom.js';
function resetToOffline(app: ClientContext): void {
  resetOfflineSession(app);
  optionalElement('menu-connection-notice')?.setAttribute('hidden', '');
  $('connection-state').textContent = '';
  $('network-error').textContent = '';
  app.center();
  app.renderLedger();
  app.refresh();
}
export function resetTerminatedConnection(app: ClientContext, message: string) {
  // A rejected duplicate tab must never send leave for the healthy original tab.
  resetToOffline(app);
  app.setModal('menu');
  let notice = optionalElement('menu-connection-notice');
  if (!notice) {
    notice = document.createElement('p');
    notice.id = 'menu-connection-notice';
    notice.className = 'intro-copy';
    notice.setAttribute('role', 'status');
    notice.style.color = '#934d36';
    $('menu').insertBefore(notice, $('menu').querySelector('.menu-grid'));
  }
  notice.textContent = message;
  notice.hidden = false;
  app.toast(message);
}
export async function networkCall(app: ClientContext, fn: () => Promise<unknown>) {
  optionalElement('menu-connection-notice')?.setAttribute('hidden', '');
  $('network-error').textContent = 'Connecting…';
  try {
    await fn();
    $('network-error').textContent = '';
  } catch (e) {
    $('network-error').textContent = errorMessage(e);
    app.toast(errorMessage(e));
  }
}
export async function leaveOnline(app: ClientContext) {
  try {
    await app.net.leave();
  } catch {
    /* Browser storage or disconnect cleanup is optional. */
  }
  resetToOffline(app);
}
export function bindConnection(app: ClientContext): void {
  app.net = new MultiplayerSession({
    onUpdate(view) {
      const previousRoom = app.room;
      app.room = view;
      app.online = true;
      app.team = view.team;
      if (view.state) {
        const incoming = typeof view.state === 'string' ? view.state : JSON.stringify(view.state);
        const next = deserialize(incoming, { rebuildPaths: false });
        const rawView = view.state;
        if (Array.isArray(rawView.events))
          next.events = rawView.events
            .filter((e) => e && typeof e.text === 'string' && Number.isFinite(e.time))
            .slice(-10)
            .map((e) => ({ text: e.text.slice(0, 500), time: e.time }));
        app.networkMotion = {
          at: performance.now(),
          from: new Map(
            next.units.map((u) => [
              u.id,
              app.renderer.visualPositions.get(u.id) ||
                app.state.units.find((v) => v.id === u.id) ||
                u,
            ]),
          ),
        };
        app.state = next;
        const first = !app.started || app.modal === 'lobby' || app.modal === 'multiplayer';
        app.started = true;
        app.lastEvent = Math.min(app.lastEvent, app.state.events.length);
        if (first) {
          app.clearSelection();
          app.center();
          app.renderLedger();
        }
        if (
          view.status === 'playing' &&
          ['lobby', 'multiplayer', 'menu'].some((id) => id === app.modal)
        )
          app.setModal(null);
        app.refresh();
      }
      if (view.status === 'lobby') {
        app.started = false;
        $('lobby-code').textContent = view.code;
        if (!optionalElement('export-room-map')) {
          const button = document.createElement('button');
          button.id = 'export-room-map';
          button.type = 'button';
          button.textContent = 'Download shared map';
          button.onclick = () => {
            if (!app.room) return;
            const map = app.room.map;
            const url = URL.createObjectURL(
              new Blob([encodeMap(map)], { type: 'application/json' }),
            );
            const link = document.createElement('a');
            link.href = url;
            link.download = `${map.name.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64) || 'shared-map'}.crusader-map.json`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          };
          $('lobby-copy').insertAdjacentElement('afterend', button);
        }
        $('lobby-copy').textContent =
          `${view.multiplayerMode === 'coop' ? 'Cooperative defense' : 'Head-to-head conquest'} · ${view.map.name} (${view.map.width} × ${view.map.height}, ${view.mapFingerprint}) · Share this room code with the second player.`;
        $('lobby-players').innerHTML = view.players
          .map(
            (p) =>
              `<div class="lobby-player"><i class="${p.team}"></i><b>${esc(p.name)}</b><span>${p.connected ? 'Connected' : 'Disconnected'}</span></div>`,
          )
          .join('');
        $('start-room').hidden = !view.isHost;
        $('start-room').disabled =
          view.players.length < 2 || view.players.some((p) => !p.connected);
        if (previousRoom?.status !== 'lobby' || previousRoom.code !== view.code)
          app.setModal('lobby');
      }
      if (
        view.status === 'paused' &&
        (previousRoom?.status !== 'paused' || previousRoom.pauseReason !== view.pauseReason)
      )
        app.toast(view.pauseReason || 'The battle is paused while a player reconnects.');
      if (view.status === 'aborted' && previousRoom?.status !== 'aborted') {
        app.toast('The room has closed. Return to the menu to begin again.');
        $('connection-state').textContent = 'Room closed';
      }
    },
    onConnection(status, message) {
      if (message && (status === 'conflict' || status === 'disconnected')) {
        app.resetTerminatedConnection(message);
        return;
      }
      if (message) app.toast(message);
      $('connection-state').textContent = app.online
        ? `${status} · ${app.team === 'player2' ? 'Blue' : 'Teal'} realm`
        : '';
    },
  });
  $('create-room').onclick = () =>
    app.networkCall(() =>
      app.net.create({
        map: getSelectedMap('multiplayer-map'),
        name: $('player-name').value,
        multiplayerMode: $('multiplayer-mode').value === 'versus' ? 'versus' : 'coop',
        difficulty: 'normal',
      }),
    );
  $('join-room').onclick = () =>
    app.networkCall(() =>
      app.net.join({
        code: $('room-code').value.trim().toUpperCase(),
        name: $('player-name').value,
      }),
    );
  $('start-room').onclick = () => app.networkCall(() => app.net.start());
  $('leave-room').onclick = async () => {
    await app.leaveOnline();
    app.setModal('menu');
  };
}
