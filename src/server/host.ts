import { createServer as createHttpServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  createGame,
  applyAction,
  update,
  parseMap,
  validateMap,
  SMALL_MAP,
  MAX_MAP_UPLOAD_BYTES,
  mapFingerprint,
} from '../game/index.js';
import type { ActionResult, GameOptions, GameState } from '../game/index.js';
import type { GameSnapshot, MultiplayerView } from '../shared/protocol.js';
import {
  auth,
  actionOwnership,
  cleanName,
  secret,
  snapshot,
  type Room,
  type Player,
} from './rooms.js';
import { body, json, sameOrigin, HttpError } from './http.js';
import { serveStatic } from './static.js';

interface ServerOptions {
  disconnectGraceMs?: number;
  roomIdleMs?: number;
  maxRooms?: number;
  staticRoot?: string;
  createInitialGame?: (options: GameOptions) => GameState;
}
interface GameServer {
  server: Server;
  listen(options?: { port?: number; host?: string }): Promise<AddressInfo>;
  close(): Promise<void>;
}
export function createServer({
  disconnectGraceMs = 30000,
  roomIdleMs = 15 * 60 * 1000,
  maxRooms = 100,
  createInitialGame = createGame,
  staticRoot = fileURLToPath(new URL('../../dist/client/', import.meta.url)),
}: ServerOptions = {}): GameServer {
  const rooms = new Map<string, Room>(),
    rates = new Map<string, { since: number; count: number }>();
  let timer: ReturnType<typeof setInterval> | null = null,
    heartbeat: ReturnType<typeof setInterval> | null = null,
    closing = false;
  function view(room: Room, player: Player, state = snapshot(room.state)): MultiplayerView {
    return {
      code: room.code,
      map: room.map,
      mapFingerprint: room.mapFingerprint,
      team: player.team,
      isHost: player.team === 'player',
      status: room.status,
      revision: room.revision,
      tick: room.tick,
      multiplayerMode: room.multiplayerMode,
      difficulty: room.difficulty,
      players: room.players.map((p) => ({ name: p.name, team: p.team, connected: !!p.stream })),
      state,
      pauseReason: room.pauseReason || null,
      winner: room.state?.winner || null,
    };
  }
  function send(room: Room, player: Player, state: GameSnapshot | null): void {
    if (!player.stream) return;
    if (player.stream.writableLength > 1024 * 1024) {
      player.stream.destroy();
      return;
    }
    const full = view(room, player, state);
    const { map, ...metadata } = full;
    const wire = {
      ...metadata,
      ...(player.mapSent ? {} : { map }),
      state: state ? (({ map: _map, ...dynamic }) => dynamic)(state) : null,
    };
    player.stream.write(`event: update\ndata: ${JSON.stringify(wire)}\n\n`);
    player.mapSent = true;
  }
  function broadcast(room: Room): void {
    room.revision++;
    const state = snapshot(room.state);
    for (const p of room.players) send(room, p, state);
  }
  function abort(room: Room, reason: string): void {
    room.status = 'aborted';
    room.pauseReason = reason;
    room.updated = Date.now();
    broadcast(room);
  }
  function presence(room: Room): void {
    if (!room.state || ['finished', 'aborted'].includes(room.status)) return;
    const missing = room.players.filter((p) => !p.stream);
    if (missing.length) {
      room.status = 'paused';
      room.pauseReason = `Waiting for ${missing.map((p) => p.name).join(' and ')} to reconnect.`;
    } else {
      room.status = 'playing';
      room.pauseReason = null;
    }
  }
  function rate(key: string, limit: number, window = 1000): boolean {
    const now = Date.now();
    let r = rates.get(key);
    if (!r || now - r.since >= window) {
      r = { since: now, count: 0 };
      rates.set(key, r);
    }
    return ++r.count <= limit;
  }
  const server = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      // Browser requests must originate from this exact host; no wildcard CORS.
      if (!sameOrigin(req))
        return json(res, 403, { ok: false, reason: 'Cross-origin requests are forbidden.' });
      if (req.headers['sec-fetch-site'] === 'cross-site')
        return json(res, 403, { ok: false, reason: 'Cross-site requests are forbidden.' });
      const ip = req.socket.remoteAddress || 'local';
      if (url.pathname.startsWith('/api/')) {
        if (!rate(`ip:${ip}`, 240))
          return json(res, 429, { ok: false, reason: 'Too many requests.' });
        if (req.method === 'POST' && url.pathname === '/api/rooms') {
          const data = await body(req, MAX_MAP_UPLOAD_BYTES);
          if (!rate(`create:${ip}`, 20, 60000))
            return json(res, 429, {
              ok: false,
              reason: 'Too many rooms created. Try again in a minute.',
            });
          if (rooms.size >= maxRooms)
            return json(res, 503, { ok: false, reason: 'The host has too many rooms.' });
          const multiplayerMode = data.multiplayerMode || 'coop',
            difficulty = data.difficulty || 'normal';
          if (
            (multiplayerMode !== 'coop' && multiplayerMode !== 'versus') ||
            (difficulty !== 'easy' && difficulty !== 'normal' && difficulty !== 'hard')
          )
            return json(res, 400, { ok: false, reason: 'Invalid game options.' });
          let map;
          try {
            map = parseMap(data.map === undefined ? SMALL_MAP : data.map);
            const validation = validateMap(map);
            if (validation.errors.length) throw Error(validation.errors.join(' '));
          } catch (error) {
            throw new HttpError(
              400,
              `Invalid map: ${error instanceof Error ? error.message : 'Invalid definition.'}`,
            );
          }
          let code: string;
          do {
            code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
          } while (rooms.has(code));
          const player: Player = {
            team: 'player',
            name: cleanName(data.name),
            token: secret(),
            stream: null,
            disconnectedAt: Date.now(),
            requests: new Map(),
          };
          const room: Room = {
            code,
            map,
            mapFingerprint: mapFingerprint(map),
            players: [player],
            multiplayerMode,
            difficulty,
            state: null,
            status: 'lobby',
            updated: Date.now(),
            lastSnapshot: 0,
            revision: 0,
            tick: 0,
          };
          rooms.set(code, room);
          return json(res, 201, { ok: true, token: player.token, view: view(room, player) });
        }
        if (req.method === 'GET' && url.pathname === '/api/session') {
          const room = rooms.get(String(url.searchParams.get('code')).toUpperCase());
          const player = auth(req, url, room);
          if (!room) throw new HttpError(404, 'Room not found.');
          if (
            player.stream &&
            url.searchParams.get('clientId') &&
            url.searchParams.get('clientId') !== player.clientId
          )
            return json(res, 409, {
              ok: false,
              reason:
                'This player is already connected in another tab. Close that tab and refresh to reconnect.',
            });
          return json(res, 200, { ok: true, view: view(room, player) });
        }
        const match = /^\/api\/rooms\/([A-Z0-9]{6})\/(join|events|start|action|leave)$/.exec(
          url.pathname,
        );
        if (!match) return json(res, 404, { ok: false, reason: 'Unknown endpoint.' });
        const room = rooms.get(match[1]),
          operation = match[2];
        if (!room) return json(res, 404, { ok: false, reason: 'Room not found or expired.' });
        if (operation === 'join' && req.method === 'POST') {
          const data = await body(req);
          if (room.players.length >= 2)
            return json(res, 409, { ok: false, reason: 'This room already has two players.' });
          if (room.status !== 'lobby')
            return json(res, 409, {
              ok: false,
              reason: 'This room is no longer accepting players.',
            });
          const player: Player = {
            team: 'player2',
            name: cleanName(data.name),
            token: secret(),
            stream: null,
            disconnectedAt: Date.now(),
            requests: new Map(),
          };
          room.players.push(player);
          room.updated = Date.now();
          broadcast(room);
          return json(res, 201, { ok: true, token: player.token, view: view(room, player) });
        }
        const player = auth(req, url, room);
        if (operation === 'events' && req.method === 'GET') {
          const clientId = url.searchParams.get('clientId');
          if (typeof clientId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(clientId))
            return json(res, 400, { ok: false, reason: 'A browser clientId is required.' });
          if (player.stream && !player.stream.destroyed && !player.stream.writableEnded)
            return json(res, 409, {
              ok: false,
              reason:
                'This player is already connected in another tab. Close that tab and refresh to reconnect.',
            });
          player.stream = res;
          player.mapSent = false;
          player.clientId = clientId;
          player.disconnectedAt = null;
          room.updated = Date.now();
          presence(room);
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Referrer-Policy': 'no-referrer',
          });
          res.write('retry: 1500\n\n');
          broadcast(room);
          res.on('close', () => {
            if (closing || player.stream !== res) return;
            player.stream = null;
            player.disconnectedAt = Date.now();
            room.updated = Date.now();
            presence(room);
            broadcast(room);
          });
          return;
        }
        if (req.method !== 'POST')
          return json(res, 405, { ok: false, reason: 'Method not allowed.' });
        const data = await body(req);
        room.updated = Date.now();
        if (operation === 'start') {
          if (player.team !== 'player')
            return json(res, 403, { ok: false, reason: 'Only the host may start the game.' });
          if (room.status !== 'lobby')
            return json(res, 409, { ok: false, reason: 'The game has already started or ended.' });
          if (room.players.length !== 2 || room.players.some((p) => !p.stream))
            return json(res, 409, { ok: false, reason: 'Both players must be connected.' });
          room.state = createInitialGame({
            mode: 'multiplayer',
            map: room.map,
            multiplayerMode: room.multiplayerMode,
            difficulty: room.difficulty,
          });
          room.status = 'playing';
          broadcast(room);
          return json(res, 200, { ok: true, view: view(room, player) });
        }
        if (operation === 'leave') {
          player.left = true;
          if (room.status === 'lobby' && player.team === 'player2') {
            room.players = room.players.filter((p) => p !== player);
            broadcast(room);
          } else if (!['finished', 'aborted'].includes(room.status))
            abort(room, `${player.name} left the room. Create a new room to play again.`);
          else broadcast(room);
          json(res, 200, { ok: true });
          if (player.stream) player.stream.end();
          return;
        }
        if (operation === 'action') {
          if (typeof data.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(data.requestId))
            return json(res, 400, { ok: false, reason: 'A unique action requestId is required.' });
          const prior = player.requests.get(data.requestId);
          if (prior) {
            return json(res, prior.status, prior.result);
          }
          if (!rate(`player:${player.token}`, 45))
            return json(res, 429, { ok: false, reason: 'Too many actions. Please slow down.' });
          let status = 200;
          let result: ActionResult;
          if (room.status !== 'playing' || !room.state) {
            status = 409;
            result = { ok: false, reason: 'The game is not running.' };
          } else {
            const reason = actionOwnership(room.state, data.action, player.team);
            if (reason) {
              status = 403;
              result = { ok: false, reason };
            } else result = applyAction(room.state, data.action, player.team);
          }
          result = structuredClone(result);
          player.requests.set(data.requestId, { status, result });
          if (player.requests.size > 256) {
            const oldest = player.requests.keys().next().value;
            if (oldest) player.requests.delete(oldest);
          }
          return json(res, status, result);
        }
        return json(res, 404, { ok: false, reason: 'Unknown endpoint.' });
      }
      await serveStatic(req, res, url, staticRoot);
    } catch (error) {
      if (!res.headersSent)
        json(res, error instanceof HttpError ? error.status : 400, {
          ok: false,
          reason:
            error instanceof HttpError ? error.message : 'The request could not be processed.',
        });
      else res.destroy();
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 12000;
  function startTimers() {
    if (timer) return;
    timer = setInterval(() => {
      const now = Date.now();
      for (const [code, room] of rooms) {
        if (room.status === 'lobby') {
          const guest = room.players.find((p) => p.team === 'player2');
          if (guest && !guest.stream && now - (guest.disconnectedAt ?? now) >= disconnectGraceMs) {
            guest.left = true;
            room.players = room.players.filter((p) => p !== guest);
            room.updated = now;
            broadcast(room);
          }
        }
        if (room.status === 'playing' && room.state) {
          try {
            update(room.state, 0.05);
            room.tick++;
            if (room.state.status !== 'playing') {
              room.status = 'finished';
              room.updated = now;
              broadcast(room);
            }
          } catch {
            abort(room, 'The simulation stopped. Please create a new room.');
          }
        }
        if (
          room.status === 'paused' &&
          room.players.some(
            (p) => !p.stream && now - (p.disconnectedAt ?? now) >= disconnectGraceMs,
          )
        )
          abort(room, 'A player did not reconnect in time. Create a new room to continue.');
        if (now - room.lastSnapshot >= 200 && ['playing', 'paused'].includes(room.status)) {
          broadcast(room);
          room.lastSnapshot = now;
        }
        if (
          (room.players.every((p) => !p.stream) || ['finished', 'aborted'].includes(room.status)) &&
          now - room.updated >= roomIdleMs
        ) {
          rooms.delete(code);
          for (const p of room.players) if (p.stream) p.stream.end();
        }
      }
      for (const [key, r] of rates) if (now - r.since > 60000) rates.delete(key);
    }, 50);
    heartbeat = setInterval(() => {
      for (const r of rooms.values())
        for (const p of r.players) if (p.stream) p.stream.write(': heartbeat\n\n');
    }, 15000);
  }
  return {
    server,
    async listen({ port = 0, host = '127.0.0.1' } = {}): Promise<AddressInfo> {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      startTimers();
      const address = server.address();
      if (!address || typeof address === 'string') throw Error('TCP listener unavailable.');
      return address;
    },
    async close() {
      closing = true;
      if (timer) clearInterval(timer);
      if (heartbeat) clearInterval(heartbeat);
      timer = null;
      for (const r of rooms.values()) for (const p of r.players) if (p.stream) p.stream.end();
      rooms.clear();
      await new Promise<void>((resolve, reject) => {
        server.close((e) => (e ? reject(e) : resolve()));
        server.closeIdleConnections();
      });
    },
  };
}
