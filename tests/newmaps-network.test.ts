import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server/host.js';
import { DEFAULT_MAP, parseMap, mapFingerprint } from '../src/game/index.js';
import { parseReply } from '../src/shared/protocol.js';

void test('custom maps remain authoritative through HTTP, SSE, parallel rooms and reconnect', async (t) => {
  const app = createServer({ maxRooms: 2 });
  const address = await app.listen();
  const base = `http://127.0.0.1:${address.port}`;
  const controllers: AbortController[] = [];
  t.after(async () => {
    controllers.forEach((c) => c.abort());
    await app.close();
  });
  const post = async (path: string, data: unknown, token?: string) => {
    const response = await fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });
    return parseReply(await response.json(), response.status);
  };
  const map = parseMap({ ...DEFAULT_MAP, name: 'Shared oasis', author: 'Host' });
  for (const bad of [
    { ...map, width: 63 },
    { ...map, terrain: ['s'] },
    { ...map, terrain: Array.from({ length: 64 }, () => 'w'.repeat(64)) },
  ]) {
    const reply = await post('/api/rooms', { map: bad });
    assert.equal(reply.httpStatus, 400);
    assert.match(reply.reason || '', /Invalid map/);
  }
  assert.equal((await post('/api/rooms', { map, padding: 'x'.repeat(33000) })).httpStatus, 413);
  const host = await post('/api/rooms', {
    map,
    mapFingerprint: 'untrusted',
    multiplayerMode: 'versus',
  });
  assert.equal(host.httpStatus, 201, 'invalid maps never allocate rooms');
  assert.ok(host.view);
  assert.ok(host.token);
  assert.equal(host.view.mapFingerprint, mapFingerprint(map));
  const other = await post('/api/rooms', { map: { ...map, name: 'Another room' } });
  assert.ok(other.view);
  assert.notEqual(other.view.mapFingerprint, host.view.mapFingerprint);
  const code = host.view.code;
  const guest = await post(`/api/rooms/${code}/join`, {
    name: 'Guest',
    map: { ...map, name: 'Guest override' },
  });
  assert.ok(guest.view);
  assert.ok(guest.token);
  assert.deepEqual(guest.view.map, map);
  const connect = async (token: string) => {
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(
      `${base}/api/rooms/${code}/events?token=${token}&clientId=${crypto.randomUUID()}`,
      { signal: controller.signal },
    );
    assert.equal(response.status, 200);
    assert.ok(response.body);
    const reader = response.body.getReader();
    let buffer = '';
    const decoder = new TextDecoder();
    const nextRaw = async () => {
      while (true) {
        const end = buffer.indexOf('\n\n');
        if (end >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = frame.split('\n').find((line) => line.startsWith('data: '));
          if (data) return JSON.parse(data.slice(6)) as Record<string, unknown>;
          continue;
        }
        const part = await reader.read();
        assert.equal(part.done, false);
        buffer += decoder.decode(part.value, { stream: true });
      }
    };
    const raw = await nextRaw();
    assert.deepEqual(raw.map, map, 'each SSE connection handshakes with the full map');
    if (raw.state) assert.equal(Object.hasOwn(raw.state, 'map'), false);
    const reply = parseReply({ ok: true, view: raw }, 200);
    assert.deepEqual(reply.view?.map, map);
    return { controller, reader, nextRaw };
  };
  const h = await connect(host.token),
    g = await connect(guest.token);
  const started = await post(`/api/rooms/${code}/start`, { map: DEFAULT_MAP }, host.token);
  assert.equal(started.httpStatus, 200);
  assert.deepEqual(started.view?.state?.map, map);
  for (const connection of [h, g]) {
    let raw = await connection.nextRaw();
    while (!raw.state) {
      assert.equal(Object.hasOwn(raw, 'map'), false);
      raw = await connection.nextRaw();
    }
    assert.equal(Object.hasOwn(raw, 'map'), false, 'subsequent updates omit static map');
    assert.equal(Object.hasOwn(raw.state as object, 'map'), false, 'state omits duplicate map');
    assert.throws(() => parseReply({ ok: true, view: raw }, 200), 'map context is required');
    assert.throws(
      () => parseReply({ ok: true, view: raw }, 200, other.view?.map),
      'wrong room context rejected',
    );
    const hydrated = parseReply({ ok: true, view: raw }, 200, map);
    assert.deepEqual(hydrated.view?.state?.map, map);
  }
  const probe = async (token: string) => {
    const response = await fetch(`${base}/api/session?code=${code}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return parseReply(await response.json(), response.status);
  };
  assert.deepEqual((await probe(guest.token)).view?.state?.map, map);
  assert.equal(
    (await post(`/api/rooms/${code}/action`, { padding: 'x'.repeat(17000) }, guest.token))
      .httpStatus,
    413,
  );
  g.controller.abort();
  await g.reader.cancel().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 80));
  const reconnected = await connect(guest.token);
  assert.deepEqual((await probe(guest.token)).view?.state?.map, map);
  reconnected.controller.abort();
  h.controller.abort();
});
