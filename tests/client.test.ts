import { createGame } from '../src/game/index.js';
import { modalAfterClose } from '../src/client/ui/interaction.js';
import { resetOfflineSession } from '../src/client/ui/session-state.js';
import { save } from '../src/client/ui/persistence.js';
import { SAVE_KEY } from '../src/client/ui/services.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampZoom,
  interpolatePosition,
  isGroupChord,
  requiresLeaveConfirmation,
  shouldIgnoreShortcut,
} from '../src/client/ui/interaction.js';
const chord = (key: string, ctrlKey = false, metaKey = false, altKey = false) => ({
  key,
  ctrlKey,
  metaKey,
  altKey,
});
void test('native shortcuts cannot start camera pan while control groups retain their chord', () => {
  for (const key of ['a', 's', 'w', 'd']) {
    assert.equal(shouldIgnoreShortcut(chord(key, true)), true);
    assert.equal(shouldIgnoreShortcut(chord(key, false, true)), true);
  }
  assert.equal(isGroupChord(chord('3', true)), true);
  assert.equal(shouldIgnoreShortcut(chord('3', true)), false);
  assert.equal(isGroupChord(chord('3', true, false, true)), false);
  assert.equal(shouldIgnoreShortcut(chord('a')), false);
});
void test('online menus request confirmation only while leaving can end a live room', () => {
  assert.equal(requiresLeaveConfirmation(true, 'playing'), true);
  assert.equal(requiresLeaveConfirmation(true, 'paused'), true);
  assert.equal(requiresLeaveConfirmation(true, 'lobby'), true);
  assert.equal(requiresLeaveConfirmation(true, 'finished'), false);
  assert.equal(requiresLeaveConfirmation(true, 'aborted'), false);
  assert.equal(requiresLeaveConfirmation(false, undefined), false);
});
void test('snapshot presentation interpolates within bounds without mutating authoritative points', () => {
  const from = { x: 10, y: 20 },
    to = { x: 20, y: 10 };
  assert.deepEqual(interpolatePosition(from, to, 95), { x: 15, y: 15 });
  assert.deepEqual(interpolatePosition(from, to, 400), to);
  assert.deepEqual(interpolatePosition(from, to, -10), from);
  assert.deepEqual(from, { x: 10, y: 20 });
  assert.deepEqual(to, { x: 20, y: 10 });
  assert.equal(clampZoom(-2), 0.35);
  assert.equal(clampZoom(4), 1.6);
  assert.equal(clampZoom(0.83), 0.83);
});

void test('Escape and guide dismissal retain an online lobby while offline menus remain reachable', () => {
  for (const current of ['lobby', 'guide', 'settings'] as const)
    assert.equal(
      modalAfterClose({
        current,
        returnModal: 'menu',
        online: true,
        started: false,
        roomStatus: 'lobby',
      }),
      'lobby',
    );
  assert.equal(
    modalAfterClose({
      current: 'battle-menu',
      returnModal: null,
      online: true,
      started: false,
      roomStatus: 'lobby',
    }),
    'lobby',
  );
  assert.equal(
    modalAfterClose({
      current: 'battle-menu',
      returnModal: null,
      online: true,
      started: true,
      roomStatus: 'playing',
    }),
    null,
  );
  assert.equal(
    modalAfterClose({
      current: 'guide',
      returnModal: 'menu',
      online: false,
      started: false,
      roomStatus: undefined,
    }),
    'menu',
  );
  assert.equal(
    modalAfterClose({
      current: 'guide',
      returnModal: null,
      online: false,
      started: true,
      roomStatus: undefined,
    }),
    null,
  );
});
void test('leaving online retires control groups, interpolation, placement and stale events together', () => {
  const session: Parameters<typeof resetOfflineSession>[0] = {
    state: createGame({ mode: 'multiplayer' }),
    online: true,
    room: null,
    team: 'player2',
    started: true,
    paused: true,
    speed: 3,
    returnModal: 'guide',
    networkMotion: { at: 1, from: new Map([[99, { x: 4, y: 5 }]]) },
    groups: new Map([['1', [99]]]),
    keys: new Set(['a']),
    pointer: {
      button: 0,
      start: { x: 0, y: 0 },
      last: { x: 1, y: 1 },
      shift: false,
      world: { x: 2, y: 3 },
    },
    lastEvent: 12,
    lastEventSignature: 'old',
    selected: new Set([99]),
    pendingSelected: new Map([[100, Infinity]]),
    selectedBuilding: 8,
    buildType: 'tower',
    orderMode: 'garrison',
    accumulator: 0.04,
    renderer: {
      visualPositions: new Map([[99, { x: 4, y: 5 }]]),
      selection: { a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
      buildType: 'tower',
    },
  };
  resetOfflineSession(session);
  assert.equal(session.online, false);
  assert.equal(session.team, 'player');
  assert.equal(session.started, false);
  assert.equal(session.state.mode, 'skirmish');
  assert.equal(session.state.time, 0);
  assert.equal(session.networkMotion, null);
  assert.equal(session.pointer, null);
  assert.equal(session.returnModal, null);
  assert.equal(session.buildType, null);
  assert.equal(session.orderMode, null);
  assert.equal(session.groups.size, 0);
  assert.equal(session.selected.size, 0);
  assert.equal(session.pendingSelected.size, 0);
  assert.equal(session.keys.size, 0);
  assert.equal(session.renderer.visualPositions.size, 0);
  assert.equal(session.renderer.selection, null);
  assert.equal(session.lastEvent, session.state.events.length);
  const event = session.state.events.at(-1);
  assert.equal(session.lastEventSignature, event ? `${event.time}:${event.text}` : '');
});
void test('save cannot overwrite a real kingdom with a menu preview, online state or finished match', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    const app = {
      state: createGame({ mode: 'sandbox' }),
      online: false,
      started: true,
      toast: (_message: string) => {},
    };
    save(app);
    const original = values.get(SAVE_KEY);
    assert.ok(original);
    app.state = createGame({ mode: 'skirmish' });
    app.started = false;
    save(app);
    assert.equal(values.get(SAVE_KEY), original);
    app.started = true;
    app.online = true;
    save(app);
    assert.equal(values.get(SAVE_KEY), original);
    app.online = false;
    for (const status of ['victory', 'defeat'] as const) {
      app.state.status = status;
      save(app);
      assert.equal(values.get(SAVE_KEY), original);
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
