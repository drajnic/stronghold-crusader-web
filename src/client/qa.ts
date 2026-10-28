import type {
  ActionResult,
  BuildingType,
  GameAction,
  GameOptions,
  GameState,
  Team,
  TroopType,
} from '../game/index.js';
import { deserialize, serialize, update } from '../game/index.js';
import type { ClientContext } from './context.js';
import type { MultiplayerView } from './network.js';
interface GameQa {
  snapshot: () => GameState;
  start: (options?: GameOptions) => void;
  restart: () => void;
  step: (seconds: number) => GameState;
  place: (type: BuildingType, x: number, y: number) => Promise<ActionResult>;
  recruit: (type: TroopType) => Promise<ActionResult>;
  command: (ids: number[], x: number, y: number, targetId?: number) => Promise<ActionResult>;
  action: (action: GameAction, quiet?: boolean) => Promise<ActionResult>;
  save: () => string | null;
  load: (raw?: string) => GameState | undefined;
  team: () => Team;
  network: () => {
    online: boolean;
    room: Pick<MultiplayerView, 'code' | 'status' | 'team'> | null;
  };
}
declare global {
  interface Window {
    __game: Readonly<GameQa>;
  }
}
export function attachQa(app: ClientContext): void {
  const snapshot = () => deserialize(serialize(app.state), { rebuildPaths: false });
  window.__game = Object.freeze({
    snapshot,
    start: app.begin,
    restart: () => app.begin(),
    step: (seconds: number) => {
      if (!app.online) {
        const bounded = Math.min(Math.max(Number(seconds) || 0, 0), 1000);
        for (let t = 0; t < bounded; t += 0.05) update(app.state, Math.min(0.05, bounded - t));
        app.refresh();
      }
      return snapshot();
    },
    place: (type: BuildingType, x: number, y: number) =>
      app.act({ type: 'place', building: type, x, y }),
    recruit: (type: TroopType) => app.act({ type: 'recruit', unit: type }),
    command: (ids: number[], x: number, y: number, targetId?: number) =>
      app.act({ type: 'command', ids, x, y, targetId }),
    action: app.act,
    save: () => (app.online ? null : serialize(app.state)),
    load: app.load,
    team: () => app.team,
    network: () => ({
      online: app.online,
      room: app.room ? { code: app.room.code, status: app.room.status, team: app.room.team } : null,
    }),
  });
}
