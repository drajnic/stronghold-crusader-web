import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server/host.js';
import { parseReply, parseView } from '../src/shared/protocol.js';
import type { MultiplayerView, GameSnapshot } from '../src/shared/protocol.js';
import { SMALL_MAP, canPlace, deserialize, fearFactor } from '../src/game/index.js';
import type { Building } from '../src/game/index.js';
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
  'workplace management and fear buildings propagate through authenticated coop HTTP and SSE',
  { timeout: 12000 },
  async (t) => {
    const app = createServer({ disconnectGraceMs: 1000 });
    const address = await app.listen(),
      base = `http://127.0.0.1:${address.port}`;
    const streams: Awaited<ReturnType<typeof stream>>[] = [];
    t.after(async () => {
      await Promise.all(streams.map((s) => s.close()));
      await app.close();
    });
    async function post(path: string, data: unknown, token?: string) {
      const response = await fetch(base + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(data),
      });
      return { status: response.status, ...parseReply(await response.json(), response.status) };
    }
    const host = await post('/api/rooms', {
      map: SMALL_MAP,
      name: 'Host',
      multiplayerMode: 'coop',
      difficulty: 'normal',
    });
    assert.ok(host.token && host.view);
    const code = host.view.code,
      hostToken = host.token;
    const guest = await post(`/api/rooms/${code}/join`, { name: 'Guest' });
    assert.ok(guest.token);
    const first = await stream(base, code, hostToken);
    streams.push(first);
    const second = await stream(base, code, guest.token);
    streams.push(second);
    assert.equal((await post(`/api/rooms/${code}/start`, {}, hostToken)).ok, true);
    const state = (view: MultiplayerView): GameSnapshot => {
      assert.ok(view.state);
      return view.state;
    };
    await waitFor(
      () => first.latest.state && second.latest.state && first.latest.tick > 0,
      'playing snapshots',
    );
    const own = state(first.latest).buildings.find(
      (b) => b.team === 'player' && b.type === 'lumber',
    );
    const ally = state(first.latest).buildings.find(
      (b) => b.team === 'player2' && b.type === 'lumber',
    );
    assert.ok(own && ally);
    let counter = 0;
    const action = (token: string, value: unknown) =>
      post(
        `/api/rooms/${code}/action`,
        { requestId: `management_${++counter}`, action: value },
        token,
      );
    const workplace = (id: number, paused: boolean) => ({ type: 'workplace', id, paused });
    assert.equal((await action(guest.token, workplace(own.id, true))).ok, false);
    assert.equal((await action(hostToken, workplace(ally.id, true))).ok, false);
    for (const paused of [null, 0, 'true', {}])
      assert.equal((await action(hostToken, { type: 'workplace', id: own.id, paused })).ok, false);
    assert.equal((await action(hostToken, workplace(own.id + 0.5, true))).ok, false);
    assert.equal((await action(hostToken, workplace(own.id, true))).ok, true);
    const pausedOn = (view: MultiplayerView) =>
      view.state?.buildings.find((b) => b.id === own.id)?.paused === true;
    await waitFor(() => pausedOn(first.latest) && pausedOn(second.latest), 'pause on both clients');
    const pausedTick = first.latest.tick;
    const wood = state(first.latest).factions.player.resources.wood;
    await waitFor(
      () => first.latest.tick >= pausedTick + 6 && second.latest.tick >= pausedTick + 6,
      'several paused production steps',
    );
    assert.equal(
      state(first.latest).factions.player.resources.wood,
      wood,
      'paused woodcutter produces nothing',
    );
    for (const view of [first.latest, second.latest]) {
      const b: Building | undefined = state(view).buildings.find(
        (candidate) => candidate.id === own.id,
      );
      assert.equal(b?.paused, true);
      assert.equal(b?.active, 0);
    }
    assert.equal((await action(hostToken, workplace(own.id, false))).ok, true);
    await waitFor(
      () =>
        [first.latest, second.latest].every((view) => {
          const b = view.state?.buildings.find((b) => b.id === own.id);
          return b && !b.paused && (b.active || 0) > 0;
        }),
      'resume on both clients',
    );
    await waitFor(
      () => state(first.latest).factions.player.resources.wood > wood,
      'production resumes',
    );
    const local = deserialize(JSON.stringify({ ...state(first.latest), version: 3 }));
    let site: { x: number; y: number } | undefined;
    for (let y = 1; y < SMALL_MAP.width - 3 && !site; y++)
      for (let x = 1; x < SMALL_MAP.width - 3 && !site; x++)
        if (canPlace(local, 'garden', x, y).ok) site = { x, y };
    assert.ok(site);
    assert.equal(
      (await action(hostToken, { type: 'place', building: 'garden', ...site })).ok,
      true,
    );
    await waitFor(
      () =>
        [first.latest, second.latest].every((view) =>
          view.state?.buildings.some((b) => b.team === 'player' && b.type === 'garden'),
        ),
      'garden on both clients',
    );
    for (const view of [first.latest, second.latest]) {
      const received = deserialize(JSON.stringify({ ...state(view), version: 3 }));
      assert.deepEqual(fearFactor(received), {
        score: 1,
        productivity: 0.95,
        morale: 1.05,
        popularity: 2,
      });
      assert.equal(fearFactor(received, 'player2').score, 0);
    }
  },
);
