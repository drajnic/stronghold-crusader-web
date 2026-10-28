import { createGame } from '../../game/index.js';
import type { ClientContext } from '../context.js';
import type { Renderer } from '../render/renderer.js';
type SessionState = Pick<
  ClientContext,
  | 'state'
  | 'online'
  | 'room'
  | 'team'
  | 'started'
  | 'paused'
  | 'speed'
  | 'returnModal'
  | 'networkMotion'
  | 'groups'
  | 'keys'
  | 'pointer'
  | 'lastEvent'
  | 'lastEventSignature'
  | 'selected'
  | 'pendingSelected'
  | 'selectedBuilding'
  | 'buildType'
  | 'orderMode'
  | 'accumulator'
> & {
  rallyBuilding?: number | null;
  renderer: Pick<Renderer, 'visualPositions' | 'selection' | 'buildType'>;
};
/** Explicit departure and terminal disconnect both retire the same transient session data. */
export function resetOfflineSession(app: SessionState): void {
  app.online = false;
  app.room = null;
  app.team = 'player';
  app.started = false;
  app.paused = false;
  app.speed = 1;
  app.returnModal = null;
  app.networkMotion = null;
  app.pointer = null;
  app.accumulator = 0;
  app.selected.clear();
  app.pendingSelected.clear();
  app.groups.clear();
  app.keys.clear();
  app.selectedBuilding = null;
  app.rallyBuilding = null;
  app.buildType = null;
  app.orderMode = null;
  app.renderer.visualPositions.clear();
  app.renderer.selection = null;
  app.renderer.buildType = null;
  app.state = createGame({ mode: 'skirmish' });
  app.lastEvent = app.state.events.length;
  const event = app.state.events.at(-1);
  app.lastEventSignature = event ? `${event.time}:${event.text}` : '';
}
