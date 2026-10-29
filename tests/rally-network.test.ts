import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server/host.js';
import { parseReply, parseView } from '../src/shared/protocol.js';
import type { MultiplayerView } from '../src/shared/protocol.js';
import { SMALL_MAP, canPlace, deserialize } from '../src/game/index.js';
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
  'rallies propagate through authenticated HTTP and SSE with facility-specific recruits',
  { timeout: 12000 },
  async (t) => {
    const app = createServer();
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
      token = host.token;
    const guest = await post(`/api/rooms/${code}/join`, { name: 'Guest' });
    assert.ok(guest.token);
    const first = await stream(base, code, token),
      second = await stream(base, code, guest.token);
    streams.push(first, second);
    assert.equal((await post(`/api/rooms/${code}/start`, {}, token)).ok, true);
    await waitFor(() => first.latest.state && second.latest.state, 'initial states');
    let counter = 0;
    const action = (auth: string, value: unknown) =>
      post(
        `/api/rooms/${code}/action`,
        { requestId: `rally_action_${++counter}`, action: value },
        auth,
      );
    const workplace = first.latest.state!.buildings.find(
      (b) => b.team === 'player' && b.type === 'lumber',
    )!;
    assert.equal(
      (await action(token, { type: 'workplace', id: workplace.id, paused: true })).ok,
      true,
    );
    await waitFor(
      () =>
        [first.latest, second.latest].every(
          (v) => v.state?.buildings.find((b) => b.id === workplace.id)?.paused,
        ),
      'paused workplace snapshots',
    );
    const initial = first.latest.state!;
    const local = deserialize(JSON.stringify({ ...initial, version: 3 }));
    let site: { x: number; y: number } | undefined;
    for (let y = 1; y < SMALL_MAP.width - 4 && !site; y++)
      for (let x = 1; x < SMALL_MAP.width - 4 && !site; x++)
        if (canPlace(local, 'barracks', x, y).ok) site = { x, y };
    assert.ok(site);
    const placed = await action(token, { type: 'place', building: 'barracks', ...site });
    assert.equal(placed.ok, true, JSON.stringify(placed));
    await waitFor(
      () =>
        [first.latest, second.latest].every((v) =>
          v.state?.buildings.some((b) => b.team === 'player' && b.type === 'barracks'),
        ),
      'facility snapshots',
    );
    const facility = first.latest.state!.buildings.find(
      (b) => b.team === 'player' && b.type === 'barracks',
    )!;
    const point = { x: site.x + 6, y: site.y + 6 };
    const rally = { type: 'rally', id: facility.id, point };
    assert.equal((await action(guest.token, rally)).ok, false);
    assert.equal((await action(token, { ...rally, point: { x: '2', y: 2 } })).ok, false);
    assert.equal(
      (await action(token, { ...rally, point: { x: SMALL_MAP.width, y: 2 } })).ok,
      false,
    );
    assert.equal((await action(token, { ...rally, team: 'player2' })).ok, false);
    assert.equal((await action(token, rally)).ok, true);
    await waitFor(
      () =>
        [first.latest, second.latest].every((v) => {
          const p = v.state?.buildings.find((b) => b.id === facility.id)?.rallyPoint;
          return p?.x === point.x && p.y === point.y;
        }),
      'rally reflected on both clients',
    );
    assert.equal(
      (await action(guest.token, { type: 'recruit', unit: 'spearman', facilityId: facility.id }))
        .ok,
      false,
    );
    assert.equal(
      (await action(token, { type: 'recruit', unit: 'spearman', facilityId: 999999 })).ok,
      false,
    );
    const recruited = await action(token, {
      type: 'recruit',
      unit: 'spearman',
      facilityId: facility.id,
    });
    assert.equal(recruited.ok, true);
    await waitFor(
      () =>
        [first.latest, second.latest].every((v) =>
          v.state?.units.some((u) => u.team === 'player' && u.type === 'spearman' && u.goal),
        ),
      'recruit walking to rally',
    );
    const fixture = structuredClone(first.latest);
    const burning = fixture.state!.buildings.find((b) => b.id === facility.id)!;
    burning.fire = { remaining: 20, spread: 1 };
    const parsed = parseView(fixture, fixture.map);
    assert.deepEqual(parsed.state!.buildings.find((b) => b.id === facility.id)?.fire, burning.fire);
    const wellState = deserialize(JSON.stringify({ ...first.latest.state!, version: 3 }));
    let wellSite: { x: number; y: number } | undefined;
    for (let y = 1; y < SMALL_MAP.width - 3 && !wellSite; y++)
      for (let x = 1; x < SMALL_MAP.width - 3 && !wellSite; x++)
        if (canPlace(wellState, 'well', x, y).ok) wellSite = { x, y };
    assert.ok(wellSite);
    assert.equal((await action(token, { type: 'place', building: 'well', ...wellSite })).ok, true);
    await waitFor(
      () =>
        [first.latest, second.latest].every((v) =>
          v.state?.buildings.some((b) => b.team === 'player' && b.type === 'well'),
        ),
      'well snapshots',
    );
    assert.equal((await action(token, { type: 'rally', id: facility.id, point: null })).ok, true);
    await waitFor(
      () =>
        [first.latest, second.latest].every(
          (v) => !v.state?.buildings.find((b) => b.id === facility.id)?.rallyPoint,
        ),
      'rally cleared on both clients',
    );
  },
);
