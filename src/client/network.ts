import { isRecord, parseReply, parseView } from '../shared/protocol.js';
import type {
  ConnectionStatus,
  Credentials,
  HttpReply,
  MultiplayerView,
  SessionCallbacks,
} from '../shared/protocol.js';
import type { Difficulty, GameAction, MultiplayerMode, MapDefinition } from '../game/index.js';
export type { MultiplayerView } from '../shared/protocol.js';
interface CreateOptions {
  map?: MapDefinition;
  name?: string;
  multiplayerMode?: MultiplayerMode;
  difficulty?: Difficulty;
}
interface RequestOptions {
  authenticated?: boolean;
  method?: 'GET' | 'POST';
}
export interface EventStream {
  readonly readyState: number;
  onOpen(listener: () => void): void;
  onUpdate(listener: (data: string) => void): void;
  onError(listener: () => void): void;
  close(): void;
}
export interface SessionEnvironment {
  request: typeof fetch;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  openStream: (url: string) => EventStream;
}
interface SessionOptions extends SessionCallbacks {
  environment?: SessionEnvironment;
}
const browserEnvironment: SessionEnvironment = {
  request: (input, init) => fetch(input, init),
  storage: {
    getItem: (key) => sessionStorage.getItem(key),
    setItem: (key, value) => sessionStorage.setItem(key, value),
    removeItem: (key) => sessionStorage.removeItem(key),
  },
  openStream(url) {
    const source = new EventSource(url);
    return {
      get readyState() {
        return source.readyState;
      },
      onOpen(listener) {
        source.onopen = listener;
      },
      onUpdate(listener) {
        source.addEventListener('update', (event) => listener(String(event.data)));
      },
      onError(listener) {
        source.onerror = listener;
      },
      close() {
        source.close();
      },
    };
  },
};

/** Two-player authoritative sessions. All simulation time belongs to the server. */
const STORAGE_KEY = 'stronghold-crusader-multiplayer-v2';

export class MultiplayerSession {
  readonly onUpdate: (view: MultiplayerView) => void;
  readonly onConnection: (status: ConnectionStatus, message?: string) => void;
  credentials: Credentials | null = null;
  source: EventStream | null = null;
  private readonly environment: SessionEnvironment;
  view: MultiplayerView | null = null;
  private generation = 0;
  private pendingConnect: (() => void) | null = null;
  private readonly clientId: string;
  constructor({
    onUpdate = () => {},
    onConnection = () => {},
    environment = browserEnvironment,
  }: SessionOptions = {}) {
    this.environment = environment;
    this.onUpdate = onUpdate;
    this.onConnection = onConnection;
    this.credentials = null;
    this.source = null;
    this.view = null;
    this.generation = 0;
    this.pendingConnect = null;
    this.clientId = crypto.randomUUID();
  }
  private _save(credentials: Credentials | null): void {
    this.credentials = credentials;
    try {
      if (credentials) this.environment.storage.setItem(STORAGE_KEY, JSON.stringify(credentials));
      else this.environment.storage.removeItem(STORAGE_KEY);
    } catch {
      // Restricted storage or transient session-probe failure must not break local play.
    }
  }
  private async _request(
    path: string,
    data: unknown,
    { authenticated = true, method = 'POST' }: RequestOptions = {},
  ): Promise<HttpReply> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authenticated && this.credentials)
      headers.Authorization = `Bearer ${this.credentials.token}`;
    const response = await this.environment.request(path, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(data || {}),
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(10000),
    });
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw Error('The game host returned an invalid response.');
    }
    return parseReply(result, response.status, this.view?.map);
  }
  private _publish(view: MultiplayerView): MultiplayerView {
    this.view = view;
    this.onUpdate(view);
    return view;
  }
  async create({
    name = 'Crusader',
    map,
    multiplayerMode = 'coop',
    difficulty = 'normal',
  }: CreateOptions = {}): Promise<MultiplayerView | null> {
    const result = await this._request(
      '/api/rooms',
      { name, multiplayerMode, difficulty, map },
      { authenticated: false },
    );
    if (!result.ok) throw Error(result.reason);
    if (!result.view || !result.token) throw Error('The host omitted player credentials.');
    this.disconnect();
    this._save({ code: result.view.code, token: result.token });
    this._publish(result.view);
    await this.connect();
    return this.view;
  }
  async join({
    code = '',
    name = 'Crusader',
  }: { code?: string; name?: string } = {}): Promise<MultiplayerView | null> {
    code = String(code || '')
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) throw Error('Enter the six-character room code.');
    const result = await this._request(
      `/api/rooms/${code}/join`,
      { name },
      { authenticated: false },
    );
    if (!result.ok) throw Error(result.reason);
    if (!result.view || !result.token) throw Error('The host omitted player credentials.');
    this.disconnect();
    this._save({ code, token: result.token });
    this._publish(result.view);
    await this.connect();
    return this.view;
  }
  /** Resume the tab's session after refresh; false means no usable saved room. */
  async reconnect(): Promise<boolean> {
    let credentials: unknown;
    try {
      credentials = JSON.parse(this.environment.storage.getItem(STORAGE_KEY) || 'null');
    } catch {
      return false;
    }
    if (
      !isRecord(credentials) ||
      typeof credentials.code !== 'string' ||
      !/^[A-Z0-9]{6}$/.test(credentials.code) ||
      typeof credentials.token !== 'string'
    )
      return false;
    this.credentials = { code: credentials.code, token: credentials.token };
    try {
      const result = await this._request(`/api/session?code=${credentials.code}`, null, {
        method: 'GET',
      });
      if (!result.ok) {
        if ([401, 404, 410].includes(result.httpStatus)) this._save(null);
        return false;
      }
      if (!result.view || result.view.status === 'aborted') {
        this._save(null);
        return false;
      }
      await this.connect();
      return true;
    } catch (error) {
      if (!(error instanceof Error && 'connectionHandled' in error && error.connectionHandled))
        this.onConnection('disconnected');
      return false;
    }
  }
  /** Connect or replace the SSE stream without changing the player token. */
  async connect(allowSettledRetry = true): Promise<MultiplayerView | null> {
    if (!this.credentials) throw Error('Join or create a room first.');
    this.disconnect();
    const generation = this.generation;
    this.onConnection('connecting');
    const { code, token } = this.credentials;
    const source = this.environment.openStream(
      `/api/rooms/${code}/events?token=${encodeURIComponent(token)}&clientId=${this.clientId}`,
    );
    this.source = source;
    let opened = false;
    return new Promise<MultiplayerView | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (opened) return;
        source.close();
        if (this.source === source) this.source = null;
        this.pendingConnect = null;
        this.onConnection('disconnected');
        reject(Error('Could not connect to the room. Refresh to reconnect.'));
      }, 10000);
      this.pendingConnect = () => {
        clearTimeout(timeout);
        reject(Error('Connection cancelled.'));
      };
      source.onOpen(() => {
        if (generation !== this.generation) return;
        opened = true;
        clearTimeout(timeout);
        this.pendingConnect = null;
        this.onConnection('connected');
        resolve(this.view);
      });
      source.onUpdate((data) => {
        if (generation !== this.generation) return;
        try {
          this._publish(parseView(JSON.parse(data), this.view?.map));
        } catch {
          this.onConnection('disconnected');
        }
      });
      source.onError(() => {
        void handleError();
      });
      const handleError = async (): Promise<void> => {
        if (generation !== this.generation) return;
        if (source.readyState !== 2) {
          this.onConnection('reconnecting');
          return;
        }
        source.close();
        clearTimeout(timeout);
        let result: HttpReply | null = null;
        let sawConflict = false;
        // A refresh may arrive just before its old socket closes. Briefly allow it to settle.
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            result = await this._request(
              `/api/session?code=${code}&clientId=${this.clientId}`,
              null,
              { method: 'GET' },
            );
          } catch {
            // Restricted storage or transient session-probe failure must not break local play.
          }
          if (generation !== this.generation) return;
          if (result?.httpStatus === 409) sawConflict = true;
          if (result?.httpStatus !== 409 || attempt === 2) break;
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        if (generation !== this.generation) return;
        if (result?.ok && sawConflict && !opened && allowSettledRetry) {
          this.source = null;
          this.pendingConnect = null;
          try {
            await this.connect(false);
            resolve(this.view);
          } catch (error) {
            reject(error);
          }
          return;
        }
        this.source = null;
        this.pendingConnect = null;
        const conflict = result?.httpStatus === 409;
        if (conflict || [401, 404, 410].includes(result?.httpStatus ?? 0)) this._save(null);
        const message = conflict
          ? result?.reason
          : 'The multiplayer connection has closed. Return to the menu or refresh to reconnect.';
        this.onConnection(conflict ? 'conflict' : 'disconnected', message);
        if (!opened) reject(Object.assign(Error(message), { connectionHandled: true }));
      };
    });
  }
  async start(): Promise<HttpReply> {
    if (!this.credentials) throw Error('No active multiplayer session.');
    const result = await this._request(`/api/rooms/${this.credentials.code}/start`, {});
    if (!result.ok) throw Error(result.reason);
    if (result.view) this._publish(result.view);
    return result;
  }
  async action(action: GameAction): Promise<HttpReply> {
    if (!this.credentials)
      return { ok: false, reason: 'No active multiplayer session.', httpStatus: 401 };
    // Each intent has one ID. The host remembers it so retransmission cannot spend twice.
    const requestId = crypto.randomUUID();
    return this._request(`/api/rooms/${this.credentials.code}/action`, { action, requestId });
  }
  /** Explicitly leaves/aborts the match. Closing a tab only pauses it for a reconnect grace. */
  async leave(): Promise<void> {
    const credentials = this.credentials;
    try {
      if (credentials) await this._request(`/api/rooms/${credentials.code}/leave`, {});
    } finally {
      this.disconnect();
      this._save(null);
      this.view = null;
    }
  }
  disconnect(): void {
    this.generation++;
    if (this.pendingConnect) {
      this.pendingConnect();
      this.pendingConnect = null;
    }
    if (this.source) {
      this.source.close();
      this.source = null;
    }
    this.onConnection('disconnected');
  }
}
