import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
const require = createRequire(import.meta.url);
const { OrbitalStore } = require('../lib/orbitalStore');
const { CelestrakService, WEEK_MS } = require('../services/celestrakService');
const tle =
  'ISS\n1 25544U 98067A   24060.51835648  .00016717  00000+0  30172-3 0  9993\n2 25544  51.6416  70.5262 0005235  60.8206  44.0617 15.49815374441373';
function database() {
  const values = new Map<string, string>();
  const fetchImpl = vi.fn(async (_url: string, options: RequestInit) => {
    const [command, ...args] = JSON.parse(String(options.body));
    let result: string | number | null = null;
    if (command === 'GET') result = values.get(args[0]) ?? null;
    else if (command === 'SET') {
      if (!values.has(args[0])) {
        values.set(args[0], args[1]);
        result = 'OK';
      }
    } else if (command === 'EVAL') {
      const [, keyCount, lockKey, ...rest] = args;
      if (keyCount === 2) {
        const [key, lease, value] = rest;
        result = values.get(lockKey) === lease ? 1 : 0;
        if (result) values.set(key, value);
      } else {
        result = values.get(lockKey) === rest[0] ? 1 : 0;
        if (result) values.delete(lockKey);
      }
    }
    return new Response(JSON.stringify({ result }));
  });
  const store = () => new OrbitalStore({ url: 'https://redis.example', token: 'test', fetchImpl });
  return { values, store, fetchImpl };
}
describe('serverless durable orbital storage', () => {
  it('serves the original API path while stripping only the Vercel rewrite capture', async () => {
    const db = database();
    const now = Date.now();
    db.values.set(
      'satapp:celestrak:v1',
      JSON.stringify({
        version: 1,
        blockedUntil: null,
        blockedReason: null,
        entries: {
          'elements:group:stations': {
            kind: 'elements',
            query: { GROUP: 'stations', FORMAT: 'tle' },
            body: tle,
            updatedAt: now,
            nextAttemptAt: now + WEEK_MS,
          },
        },
      }),
    );
    const httpFetch = globalThis.fetch;
    vi.stubEnv('KV_REST_API_URL', 'https://redis.example');
    vi.stubEnv('KV_REST_API_TOKEN', 'test');
    vi.stubEnv('REDIS_URL', '');
    vi.stubGlobal('fetch', db.fetchImpl);
    const express = require('express');
    const handler = require('../api/index');
    const server = createServer(express().use(handler));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address() as { port: number };
      const endpoint = `http://127.0.0.1:${address.port}/api/celestrak/elements`;
      const response = await httpFetch(
        `${endpoint}?GROUP=stations&__vercelPath=celestrak%2Felements`,
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(tle);
      const invalid = await httpFetch(
        `${endpoint}?GROUP=stations&unknown=1&__vercelPath=celestrak%2Felements`,
      );
      expect(invalid.status).toBe(400);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
  it('serializes separate instances and retains data and weekly deadlines after cold starts', async () => {
    const db = database();
    let now = Date.now();
    const upstream = vi.fn(async () => new Response(tle));
    const create = () =>
      new CelestrakService({
        store: db.store(),
        fetchImpl: upstream,
        now: () => now,
        minIntervalMs: 0,
      });
    const first = create();
    const second = create();
    const query = { GROUP: 'stations', FORMAT: 'tle' };
    const results = await Promise.all([
      first.get('elements', query),
      second.get('elements', query),
    ]);
    expect(results[0].body).toBe(tle);
    expect(results[1].updatedAt).toBe(results[0].updatedAt);
    expect(upstream).toHaveBeenCalledOnce();
    now += WEEK_MS - 1;
    const restarted = create();
    expect((await restarted.get('elements', query)).body).toBe(tle);
    expect(upstream).toHaveBeenCalledOnce();
    now += 1;
    await restarted.get('elements', query);
    expect(upstream).toHaveBeenCalledTimes(2);
    await Promise.all([first.close(), second.close(), restarted.close()]);
  });
  it('shares provider-wide blocking across independent instances', async () => {
    const db = database();
    const upstream = vi.fn(async () => new Response('blocked', { status: 429 }));
    const services = [0, 1].map(
      () => new CelestrakService({ store: db.store(), fetchImpl: upstream }),
    );
    await expect(services[0].get('elements', { GROUP: 'stations' })).rejects.toMatchObject({
      status: 503,
    });
    await expect(services[1].get('elements', { GROUP: 'amateur' })).rejects.toMatchObject({
      status: 503,
    });
    expect(upstream).toHaveBeenCalledOnce();
    await Promise.all(services.map((service) => service.close()));
  });
  it('fails closed when storage is unavailable and never calls upstream', async () => {
    const store = new OrbitalStore({
      url: 'https://redis.example',
      token: 'test',
      fetchImpl: async () => new Response('', { status: 503 }),
    });
    const upstream = vi.fn();
    const service = new CelestrakService({ store, fetchImpl: upstream });
    await expect(service.get('elements', { GROUP: 'stations' })).rejects.toThrow('storage');
    expect(upstream).not.toHaveBeenCalled();
    await service.close();
  });
  it('refuses stale lease writes and leaves the new owner lock intact', async () => {
    const db = database();
    const store = db.store();
    await store.runExclusive(async () => {
      db.values.set(store.lockKey, 'new-owner');
      await expect(store.write('overwrite')).rejects.toThrow('lease expired');
    });
    expect(db.values.get(store.lockKey)).toBe('new-owner');
    expect(db.values.has(store.key)).toBe(false);
  });
});
