import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseReply, parseView } from '../src/shared/protocol.js';
import type {
  HttpReply,
  MultiplayerView,
  GameSnapshot,
  ConnectionStatus,
} from '../src/shared/protocol.js';
import type { EventStream, SessionEnvironment } from '../src/client/network.js';
function viewOf(reply: HttpReply): MultiplayerView {
  assert.ok(reply.view);
  return reply.view;
}
function tokenOf(reply: HttpReply): string {
  assert.ok(reply.token);
  return reply.token;
}
function stateOf(view: MultiplayerView): GameSnapshot {
  assert.ok(view.state);
  return view.state;
}
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server/host.js';
import { createGame, deserialize, DEFAULT_MAP, mapFingerprint } from '../src/game/index.js';
import { MultiplayerSession } from '../src/client/network.js';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor<T>(check: () => T, label: string, timeout = 3500): Promise<NonNullable<T>> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = check();
    if (result) return result;
    await delay(20);
  }
  assert.fail(`Timed out: ${label}`);
}
async function stream(
  base: string,
  code: string,
  token: string,
  clientId: string = crypto.randomUUID(),
) {
  const controller = new AbortController();
  const response = await fetch(
    `${base}/api/rooms/${code}/events?token=${encodeURIComponent(token)}&clientId=${clientId}`,
    { signal: controller.signal },
  );
  assert.equal(response.status, 200);
  assert.ok(response.body);
  const events: MultiplayerView[] = [],
    reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '';
  const pump = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const message = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = message.split('\n').find((line) => line.startsWith('data: '));
          if (data) events.push(parseView(JSON.parse(data.slice(6)), events.at(-1)?.map));
        }
      }
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'AbortError') throw error;
    }
  })();
  return {
    events,
    get latest() {
      const event = events.at(-1);
      assert.ok(event, 'SSE snapshot received');
      return event;
    },
    async close() {
      controller.abort();
      await pump;
    },
  };
}

void test(
  'authoritative two-player HTTP sessions, ownership, reconnect and static isolation',
  { timeout: 18000 },
  async (t) => {
    const staticRoot = resolve('work/network-static');
    await mkdir(resolve(staticRoot, 'assets'), { recursive: true });
    await writeFile(resolve(staticRoot, 'index.html'), '<h1>Network test client</h1>');
    await writeFile(resolve(staticRoot, 'assets/test.js'), 'export {};');
    const app = createServer({ disconnectGraceMs: 900, roomIdleMs: 1800, staticRoot });
    const address = await app.listen();
    const base = `http://127.0.0.1:${address.port}`;
    const streams: Awaited<ReturnType<typeof stream>>[] = [];
    t.after(async () => {
      await Promise.all(streams.map((s) => s.close()));
      await app.close();
    });
    async function post(
      path: string,
      data: unknown,
      token?: string,
      headers: Record<string, string> = {},
    ) {
      const response = await fetch(base + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: JSON.stringify(data),
      });
      return { status: response.status, ...parseReply(await response.json(), response.status) };
    }
    const host = await post('/api/rooms', {
      name: '<Host>\u0000',
      multiplayerMode: 'coop',
      difficulty: 'normal',
    });
    assert.equal(host.status, 201);
    assert.match(tokenOf(host), /^[\w-]{43}$/);
    assert.equal(viewOf(host).team, 'player');
    assert.equal(viewOf(host).players[0].name, 'Host');
    const code = viewOf(host).code;
    const first = await stream(base, code, tokenOf(host));
    streams.push(first);
    const early = await post(`/api/rooms/${code}/start`, {}, tokenOf(host));
    assert.equal(early.status, 409);
    const guest = await post(`/api/rooms/${code}/join`, { name: 'Guest' });
    assert.equal(guest.status, 201);
    assert.equal(viewOf(guest).team, 'player2');
    const second = await stream(base, code, tokenOf(guest));
    streams.push(second);
    const duplicate = await fetch(
      `${base}/api/rooms/${code}/events?token=${tokenOf(host)}&clientId=duplicate_tab`,
    );
    assert.equal(duplicate.status, 409);
    const duplicateProbe = await fetch(`${base}/api/session?code=${code}&clientId=duplicate_tab`, {
      headers: { Authorization: `Bearer ${tokenOf(host)}` },
    });
    assert.equal(duplicateProbe.status, 409);
    assert.equal(
      first.latest?.players[0].connected,
      true,
      'duplicate stream leaves the original connected',
    );
    const third = await post(`/api/rooms/${code}/join`, { name: 'Third' });
    assert.equal(third.status, 409);
    const unauthorized = await post(`/api/rooms/${code}/start`, {}, 'invalid');
    assert.equal(unauthorized.status, 401);
    const guestStart = await post(`/api/rooms/${code}/start`, {}, tokenOf(guest));
    assert.equal(guestStart.status, 403);
    const started = await post(`/api/rooms/${code}/start`, {}, tokenOf(host));
    assert.equal(started.ok, true);
    assert.equal(viewOf(started).status, 'playing');
    await waitFor(
      () => first.latest?.tick >= 4 && second.latest?.tick >= 4,
      'both clients receive ticking state',
    );
    const sharedTick = first.events.find((a) =>
      second.events.some((b) => a.tick === b.tick && a.tick >= 4),
    );
    assert.ok(sharedTick);
    const otherTick = second.events.find((b) => b.tick === sharedTick.tick);
    assert.ok(otherTick);
    assert.deepEqual(stateOf(sharedTick), stateOf(otherTick));
    assert.equal(stateOf(sharedTick).mode, 'multiplayer');
    assert.ok(stateOf(sharedTick).factions.player2);
    assert.ok(stateOf(sharedTick).factions.enemy);
    assert.equal(JSON.stringify(sharedTick).includes(tokenOf(host)), false);
    assert.equal(JSON.stringify(sharedTick).includes(tokenOf(guest)), false);
    let counter = 0;
    const action = (token: string, value: unknown, id = `network_${++counter}`) =>
      post(`/api/rooms/${code}/action`, { requestId: id, action: value }, token);
    const own1 = stateOf(sharedTick).units.find((u) => u.team === 'player'),
      own2 = stateOf(sharedTick).units.find((u) => u.team === 'player2');
    assert.ok(own1 && own2, 'both players start with independent troops');
    assert.equal(
      (await action(tokenOf(host), { type: 'stance', ids: [own1.id], stance: 'hold' })).ok,
      true,
    );
    assert.equal(
      (await action(tokenOf(guest), { type: 'stance', ids: [own2.id], stance: 'defensive' })).ok,
      true,
    );
    const cross = await action(tokenOf(guest), { type: 'command', ids: [own1.id], x: 20, y: 40 });
    assert.equal(cross.status, 403);
    assert.equal(cross.ok, false);
    const ownKeep = stateOf(sharedTick).buildings.find(
      (b) => b.team === 'player' && b.type === 'keep',
    );
    assert.ok(ownKeep);
    assert.equal((await action(tokenOf(guest), { type: 'demolish', id: ownKeep.id })).status, 403);
    assert.equal(
      (await action(tokenOf(host), { type: 'policy', team: 'player2', tax: 0 })).status,
      403,
    );
    assert.equal((await action(tokenOf(host), { type: 'load', state: {} })).ok, false);
    for (const malformed of [
      null,
      { type: 'command', ids: 'all', x: 0, y: 0 },
      { type: 'recruit', unit: '__proto__' },
      { type: 'place', building: 'constructor', x: 2, y: 2 },
      { type: 'policy', tax: '999' },
      { type: 'trade', resource: 'wood', amount: -100, buy: true },
    ]) {
      const rejected = await action(tokenOf(host), malformed);
      assert.equal(rejected.ok, false, 'malformed intent is rejected');
    }
    assert.equal(
      (await action(tokenOf(host), { type: 'stance', ids: [own1.id], stance: 'hold' })).ok,
      true,
      'legal action still works after malformed intents',
    );
    const dedupId = 'deduplicated_order';
    const once = await action(
      tokenOf(host),
      { type: 'stance', ids: [own1.id], stance: 'hold' },
      dedupId,
    );
    const twice = await action(tokenOf(host), { type: 'demolish', id: ownKeep.id }, dedupId);
    assert.deepEqual(twice, once, 'repeated request ID never executes another intent');
    const recruitId = 'recruit_exactly_once';
    const recruited = await action(tokenOf(host), { type: 'recruit', unit: 'archer' }, recruitId);
    assert.equal(recruited.ok, true);
    const replayed = await action(tokenOf(host), { type: 'recruit', unit: 'archer' }, recruitId);
    assert.deepEqual(replayed, recruited);
    const recruited2 = await action(tokenOf(guest), { type: 'recruit', unit: 'archer' });
    assert.equal(recruited2.ok, true);
    assert.notEqual(recruited.unitId, recruited2.unitId);
    assert.equal((await action(tokenOf(host), { type: 'policy', tax: -2 })).ok, true);
    assert.equal((await action(tokenOf(guest), { type: 'policy', tax: 2 })).ok, true);
    await waitFor(
      () =>
        first.latest.state?.factions.player.tax === -2 &&
        first.latest.state?.factions.player2!.tax === 2,
      'separate faction policies',
    );
    assert.equal(
      stateOf(first.latest).factions.player.resources.bows,
      stateOf(sharedTick).factions.player.resources.bows - 1,
      'host spends own bow once',
    );
    assert.equal(
      stateOf(first.latest).factions.player2!.resources.bows,
      stateOf(sharedTick).factions.player2!.resources.bows - 1,
      'guest spends own bow',
    );
    assert.equal(
      stateOf(first.latest).units.filter((u) => u.team === 'player').length,
      stateOf(sharedTick).units.filter((u) => u.team === 'player').length + 1,
    );
    const blocked = await post(
      `/api/rooms/${code}/action`,
      { requestId: 'external_1', action: { type: 'policy', tax: 0 } },
      tokenOf(host),
      { Origin: 'https://attacker.invalid' },
    );
    assert.equal(blocked.status, 403);
    const huge = await post(
      `/api/rooms/${code}/action`,
      { text: 'x'.repeat(17000) },
      tokenOf(host),
    );
    assert.equal(huge.status, 413);
    for (const path of [
      '/work/expansion/contract.md',
      '/.git/config',
      '/package.json',
      '/server.mjs',
      '/src/../server.mjs',
      '/%2e%2e/server.mjs',
    ])
      assert.equal((await fetch(base + path)).status, 404, path);
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await fetch(base + '/assets/test.js')).status, 200);
    await second.close();
    await waitFor(() => first.latest.status === 'paused', 'host sees peer disconnect');
    const pausedTime = stateOf(first.latest).time;
    await delay(260);
    assert.equal(
      stateOf(first.latest).time,
      pausedTime,
      'authoritative simulation pauses with disconnected peer',
    );
    const session = await fetch(`${base}/api/session?code=${code}`, {
      headers: { Authorization: `Bearer ${tokenOf(guest)}` },
    });
    assert.equal(session.status, 200);
    const rejoined = await stream(base, code, tokenOf(guest));
    streams.push(rejoined);
    await waitFor(
      () => first.latest.status === 'playing' && rejoined.latest?.team === 'player2',
      'same token resumes existing faction',
    );
    await waitFor(() => stateOf(rejoined.latest).time > pausedTime, 'simulation resumes');
    assert.equal(rejoined.latest.players.length, 2);
    assert.ok(
      first.events.every((event, i) => !i || event.revision >= first.events[i - 1].revision),
    );
    await rejoined.close();
    await waitFor(() => first.latest.status === 'aborted', 'expired grace aborts explicitly', 2500);
    assert.match(first.latest.pauseReason || '', /reconnect/);
    const stopped = await action(tokenOf(host), { type: 'stance', ids: [own1.id], stance: 'hold' });
    assert.equal(stopped.status, 409);
  },
);

void test(
  'versus setup, explicit leave, invalid session and empty-room cleanup',
  { timeout: 8000 },
  async (t) => {
    const app = createServer({ roomIdleMs: 200, disconnectGraceMs: 100 });
    const address = await app.listen();
    const base = `http://127.0.0.1:${address.port}`;
    t.after(() => app.close());
    const post = async (path: string, data: unknown, token?: string) => {
      const res = await fetch(base + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
      return { status: res.status, ...parseReply(await res.json(), res.status) };
    };
    const host = await post('/api/rooms', { multiplayerMode: 'versus' });
    assert.equal(viewOf(host).multiplayerMode, 'versus');
    const code = viewOf(host).code;
    const guest = await post(`/api/rooms/${code}/join`, {});
    const one = await stream(base, code, tokenOf(host)),
      two = await stream(base, code, tokenOf(guest));
    await post(`/api/rooms/${code}/start`, {}, tokenOf(host));
    await waitFor(() => one.latest?.state, 'versus state');
    assert.ok(stateOf(one.latest).buildings.some((b) => b.team === 'player2' && b.type === 'keep'));
    assert.equal(stateOf(one.latest).multiplayerMode, 'versus');
    const left = await post(`/api/rooms/${code}/leave`, {}, tokenOf(guest));
    assert.equal(left.ok, true);
    await waitFor(() => one.latest.status === 'aborted', 'explicit leave abort');
    const invalid = await fetch(`${base}/api/session?code=${code}`, {
      headers: { Authorization: 'Bearer invalid' },
    });
    assert.equal(invalid.status, 401);
    await one.close();
    await two.close();
    await delay(300);
    const missing = await post(`/api/rooms/${code}/join`, {});
    assert.equal(missing.status, 404);
  },
);

void test(
  'lobby guest slots recover after never connecting, leaving, and disconnecting',
  { timeout: 8000 },
  async (t) => {
    const app = createServer({ disconnectGraceMs: 180 });
    const address = await app.listen();
    const base = `http://127.0.0.1:${address.port}`;
    const streams: Awaited<ReturnType<typeof stream>>[] = [];
    t.after(async () => {
      await Promise.all(streams.map((s) => s.close()));
      await app.close();
    });
    const post = async (path: string, data: unknown, token?: string) => {
      const res = await fetch(base + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
      return { status: res.status, ...parseReply(await res.json(), res.status) };
    };
    const host = await post('/api/rooms', {}),
      code = viewOf(host).code;
    const one = await stream(base, code, tokenOf(host));
    streams.push(one);
    const abandoned = await post(`/api/rooms/${code}/join`, { name: 'Never connects' });
    assert.equal(abandoned.ok, true);
    await waitFor(
      () => one.events.some((e) => e.players.length === 2),
      'guest slot initially held',
    );
    await waitFor(() => one.latest?.players.length === 1, 'unconnected guest expires');
    const next = await post(`/api/rooms/${code}/join`, {});
    assert.equal(next.status, 201);
    await post(`/api/rooms/${code}/leave`, {}, tokenOf(next));
    await waitFor(() => one.latest?.players.length === 1, 'guest leave frees slot');
    assert.equal(one.latest.status, 'lobby');
    const third = await post(`/api/rooms/${code}/join`, {});
    const two = await stream(base, code, tokenOf(third));
    streams.push(two);
    await two.close();
    await waitFor(() => one.latest?.players.length === 1, 'disconnected lobby guest expires');
    assert.equal((await post(`/api/rooms/${code}/join`, {})).status, 201);
    await post(`/api/rooms/${code}/leave`, {}, tokenOf(host));
  },
);

void test(
  'leaving a finished match preserves the result for the other player',
  { timeout: 8000 },
  async (t) => {
    const app = createServer({
      createInitialGame(options) {
        const state = createGame(options);
        const keep = state.buildings.find((b) => b.type === 'keep' && b.team === 'player2');
        assert.ok(keep);
        keep.hp = 1;
        const attacker = state.units.find((u) => u.team === 'player' && u.type === 'archer');
        assert.ok(attacker);
        Object.assign(attacker, {
          x: keep.x - 2.5,
          y: keep.y + 0.5,
          targetId: keep.id,
          attack: 0,
          stance: 'hold',
        });
        return state;
      },
    });
    const address = await app.listen();
    const base = `http://127.0.0.1:${address.port}`;
    const streams: Awaited<ReturnType<typeof stream>>[] = [];
    t.after(async () => {
      await Promise.all(streams.map((s) => s.close()));
      await app.close();
    });
    const post = async (path: string, data: unknown, token?: string) => {
      const res = await fetch(base + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
      return { status: res.status, ...parseReply(await res.json(), res.status) };
    };
    const host = await post('/api/rooms', { multiplayerMode: 'versus' }),
      code = viewOf(host).code;
    const guest = await post(`/api/rooms/${code}/join`, {});
    const one = await stream(base, code, tokenOf(host)),
      two = await stream(base, code, tokenOf(guest));
    streams.push(one, two);
    await post(`/api/rooms/${code}/start`, {}, tokenOf(host));
    await waitFor(
      () => one.latest?.status === 'finished' && two.latest?.status === 'finished',
      'server attack destroys the keep and broadcasts terminal state',
    );
    for (const [events, team] of [
      [one, 'player'],
      [two, 'player2'],
    ] as const) {
      const result = events.latest;
      assert.equal(result.team, team);
      assert.equal(result.winner, 'player');
      assert.equal(stateOf(result).status, 'victory');
      assert.ok(result.tick >= 1, 'terminal state came from an authoritative simulation tick');
      assert.equal(
        stateOf(result).buildings.some((b) => b.type === 'keep' && b.team === 'player2'),
        false,
        'attack removed the defeated keep',
      );
      assert.equal(stateOf(result).factions.player2!.defeated, true);
      const hydrated = deserialize(JSON.stringify(stateOf(result)), { rebuildPaths: false });
      assert.equal(hydrated.status, 'victory');
      assert.equal(hydrated.winner, 'player');
      assert.ok(hydrated.units.every((u) => u.hp > 0));
    }
    await post(`/api/rooms/${code}/leave`, {}, tokenOf(guest));
    await waitFor(
      () => one.latest?.players.find((p) => p.team === 'player2')?.connected === false,
      'guest departs finished game',
    );
    assert.equal(one.latest.status, 'finished');
    assert.equal(one.latest.winner, 'player');
    assert.equal(stateOf(one.latest).status, 'victory');
    const session = await fetch(`${base}/api/session?code=${code}`, {
      headers: { Authorization: `Bearer ${tokenOf(host)}` },
    });
    assert.equal(viewOf(parseReply(await session.json(), session.status)).status, 'finished');
  },
);

void test(
  'client stops duplicate-tab retry loops and clears terminal SSE sessions',
  { timeout: 10000 },
  async (t) => {
    const app = createServer();
    const address = await app.listen();
    const base = `http://127.0.0.1:${address.port}`;
    const storage = new Map<string, string>();
    let client: MultiplayerSession | undefined;
    const openStreams: Awaited<ReturnType<typeof stream>>[] = [];
    /** Minimal browser transport port; every request and event crosses an actual HTTP socket. */
    class HttpEventStream implements EventStream {
      readyState = 0;
      private openListener: () => void = () => {};
      private updateListener: (data: string) => void = () => {};
      private errorListener: () => void = () => {};
      private readonly controller = new AbortController();
      private closed = false;
      constructor(path: string) {
        void this.run(path);
      }
      onOpen(listener: () => void): void {
        this.openListener = listener;
      }
      onUpdate(listener: (data: string) => void): void {
        this.updateListener = listener;
      }
      onError(listener: () => void): void {
        this.errorListener = listener;
      }
      close(): void {
        this.closed = true;
        this.readyState = 2;
        this.controller.abort();
      }
      private async run(path: string): Promise<void> {
        try {
          const response = await fetch(new URL(path, base), { signal: this.controller.signal });
          if (!response.ok) {
            this.readyState = 2;
            this.errorListener();
            return;
          }
          this.readyState = 1;
          this.openListener();
          const reader = response.body?.getReader();
          assert.ok(reader);
          const decoder = new TextDecoder();
          let buffer = '';
          while (!this.closed) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let end: number;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              const message = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              const data = message.split('\n').find((line) => line.startsWith('data: '));
              if (data) this.updateListener(data.slice(6));
            }
          }
          if (!this.closed) {
            this.readyState = 2;
            this.errorListener();
          }
        } catch {
          if (!this.closed) {
            this.readyState = 2;
            this.errorListener();
          }
        }
      }
    }
    const environment: SessionEnvironment = {
      request: (input, init) =>
        fetch(typeof input === 'string' ? new URL(input, base) : input, init),
      storage: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => {
          storage.set(key, value);
        },
        removeItem: (key) => {
          storage.delete(key);
        },
      },
      openStream: (path) => new HttpEventStream(path),
    };
    t.after(async () => {
      client?.disconnect();
      await Promise.all(openStreams.map((stream) => stream.close()));
      await app.close();
    });
    const response = await fetch(base + '/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const host = parseReply(await response.json(), response.status),
      code = viewOf(host).code;
    const first = await stream(base, code, tokenOf(host));
    openStreams.push(first);
    const key = 'stronghold-crusader-multiplayer-v2';
    storage.set(key, JSON.stringify({ code, token: tokenOf(host) }));
    const connections: { status: ConnectionStatus; message?: string }[] = [];
    const updates: MultiplayerView[] = [];
    const callbacks = {
      environment,
      onConnection: (status: ConnectionStatus, message?: string) => {
        connections.push({ status, message });
      },
      onUpdate: (view: MultiplayerView) => {
        updates.push(view);
      },
    };
    client = new MultiplayerSession(callbacks);
    assert.equal(await client.reconnect(), false);
    assert.equal(connections.at(-1)?.status, 'conflict');
    assert.match(connections.at(-1)?.message || '', /another tab/);
    assert.equal(client.credentials, null);
    assert.equal(storage.has(key), false);
    assert.equal(updates.length, 0, 'duplicate session never replaces local menu');
    assert.equal(first.latest.players[0].connected, true);
    await first.close();
    await delay(60);
    storage.set(key, JSON.stringify({ code, token: tokenOf(host) }));
    client = new MultiplayerSession(callbacks);
    assert.equal(await client.reconnect(), true);
    await waitFor(() => updates.length > 0, 'reload reconnects after old socket closes');
    await fetch(`${base}/api/rooms/${code}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenOf(host)}` },
      body: '{}',
    });
    await waitFor(
      () => client?.credentials === null && connections.at(-1)?.status === 'disconnected',
      '410 terminal SSE clears credentials',
    );
    assert.equal(storage.has(key), false);
    assert.equal(client.source, null);
  },
);

void test('protocol boundary rejects malformed view metadata and action receipts', () => {
  const valid: MultiplayerView = {
    code: 'ABC123',
    map: DEFAULT_MAP,
    mapFingerprint: mapFingerprint(DEFAULT_MAP),
    team: 'player',
    isHost: true,
    status: 'lobby',
    revision: 0,
    tick: 0,
    multiplayerMode: 'coop',
    difficulty: 'normal',
    players: [{ name: 'Host', team: 'player', connected: false }],
    state: null,
    pauseReason: null,
    winner: null,
  };
  assert.deepEqual(parseView(valid), valid);
  for (const patch of [
    { tick: Infinity },
    { revision: -1 },
    { isHost: 'yes' },
    { difficulty: 'impossible' },
    { multiplayerMode: 'free-for-all' },
    { winner: 'visitor' },
    { players: [{ name: 'Host', team: 'player', connected: 'yes' }] },
    { state: { version: 2 } },
  ])
    assert.throws(() => parseView({ ...valid, ...patch }));
  assert.throws(() => parseReply({ ok: true, unit: { id: 'not-a-number' } }, 200));
  assert.throws(() => parseReply({ ok: true, token: 'short' }, 200));
});
