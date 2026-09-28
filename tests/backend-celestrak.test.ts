import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { CelestrakService, WEEK_MS } = require('../services/celestrakService');
const { createApp } = require('../server');
const tle =
  'ISS\n1 25544U 98067A   24060.51835648  .00016717  00000+0  30172-3 0  9993\n2 25544  51.6416  70.5262 0005235  60.8206  44.0617 15.49815374441373';
const query = { GROUP: 'stations', FORMAT: 'tle' };
let dir: string, now: number;
const services: Array<{ close: () => Promise<void> }> = [];
function create(fetchImpl: ReturnType<typeof vi.fn>) {
  const service = new CelestrakService({
    cacheDir: dir,
    fetchImpl,
    now: () => now,
    minIntervalMs: 0,
  });
  services.push(service);
  return service;
}
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'celestrak-cache-'));
  now = Date.parse('2026-09-28T00:00:00Z');
});
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.close()));
  await rm(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('shared persistent CelesTrak cache', () => {
  it('deduplicates requests and reuses the original data age across clients and restarts for seven days', async () => {
    const upstream = vi.fn(async () => new Response(tle));
    const first = create(upstream);
    const pending = first.get('elements', query);
    expect(first.get('elements', query)).toBe(pending);
    const result = await pending;
    now += WEEK_MS - 1;
    const restarted = create(upstream);
    expect((await restarted.get('elements', query)).updatedAt).toBe(result.updatedAt);
    expect(upstream).toHaveBeenCalledOnce();
    now += 1;
    expect((await restarted.get('elements', query)).updatedAt).toBe(now);
    expect(upstream).toHaveBeenCalledTimes(2);
    const disk = JSON.parse(await readFile(path.join(dir, 'cache.json'), 'utf8'));
    expect(disk.entries['elements:group:stations'].body).toBe(tle);
  });
  it.each([403, 429])(
    'serializes upstream and persists provider-wide weekly cooldown after HTTP %s',
    async (status) => {
      const upstream = vi.fn(async () => new Response('blocked', { status }));
      const service = create(upstream);
      const result = await Promise.allSettled([
        service.get('elements', query),
        service.get('elements', { GROUP: 'active', FORMAT: 'tle' }),
        service.get('satcat', { CATNR: '25544', FORMAT: 'json' }),
      ]);
      expect(upstream).toHaveBeenCalledOnce();
      for (const item of result) {
        expect(item.status).toBe('rejected');
        if (item.status === 'rejected')
          expect(item.reason.metadata.blockedUntil).toBe(now + WEEK_MS);
      }
      const restarted = create(upstream);
      await expect(
        restarted.get('elements', { CATNR: '10669', FORMAT: 'tle' }),
      ).rejects.toMatchObject({ status: 503, metadata: { nextRefreshAt: now + WEEK_MS } });
      expect(upstream).toHaveBeenCalledOnce();
    },
  );
  it('retains the last good response indefinitely through blocked refreshes and restarts', async () => {
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(new Response(tle))
      .mockImplementation(async () => new Response('blocked', { status: 403 }));
    const service = create(upstream);
    const original = await service.get('elements', query);
    now += 100 * WEEK_MS;
    const retained = await service.get('elements', query);
    expect(retained.body).toBe(tle);
    expect(retained.updatedAt).toBe(original.updatedAt);
    expect(retained.blockedUntil).toBe(now + WEEK_MS);
    const restarted = create(upstream);
    expect((await restarted.get('elements', query)).body).toBe(tle);
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it.each([
    '<html>provider maintenance</html>',
    'No GP data found',
    tle.replace('2 25544', '2 12345'),
  ])('does not replace last good data with invalid payload %s', async (invalid) => {
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(new Response(tle))
      .mockResolvedValueOnce(new Response(invalid));
    const service = create(upstream);
    const original = await service.get('elements', query);
    now += WEEK_MS;
    const retained = await service.get('elements', query);
    expect(retained.body).toBe(tle);
    expect(retained.updatedAt).toBe(original.updatedAt);
    expect(retained.warning).toContain('invalid');
    const restarted = create(upstream);
    expect((await restarted.get('elements', query)).body).toBe(tle);
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it('validates SATCAT identity and gives it the same durable weekly cache', async () => {
    const body = JSON.stringify([{ NORAD_CAT_ID: 25544, OBJECT_NAME: 'ISS' }]);
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(new Response(body))
      .mockResolvedValueOnce(new Response('[{"NORAD_CAT_ID":1}]'));
    const service = create(upstream);
    const request = { CATNR: '25544', FORMAT: 'json' };
    await service.get('satcat', request);
    now += WEEK_MS;
    expect((await service.get('satcat', request)).body).toBe(body);
    expect(upstream.mock.calls[0][0]).toBe(
      'https://celestrak.org/satcat/records.php?CATNR=25544&FORMAT=json',
    );
  });
  it('refreshes due known entries through maintenance but never fetches cold catalogs', async () => {
    const upstream = vi.fn(async () => new Response(tle));
    const service = create(upstream);
    await service.refreshDue();
    expect(upstream).not.toHaveBeenCalled();
    await service.get('elements', query);
    now += WEEK_MS - 1;
    await service.refreshDue();
    expect(upstream).toHaveBeenCalledOnce();
    now++;
    await service.refreshDue();
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it('fails closed on corrupt disk state without unhandled rejection or upstream access', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await writeFile(path.join(dir, 'cache.json'), '{broken');
    const upstream = vi.fn();
    const service = create(upstream);
    await expect(service.ready).resolves.toBeUndefined();
    await expect(service.get('elements', query)).rejects.toMatchObject({ status: 503 });
    await service.refreshDue();
    expect(upstream).not.toHaveBeenCalled();
    expect(await readFile(path.join(dir, 'cache.json'), 'utf8')).toBe('{broken');
  });
  it('rejects arbitrary URLs, unknown groups and malformed catalog IDs before any network work', async () => {
    const upstream = vi.fn();
    const service = create(upstream);
    for (const invalid of [
      { url: 'https://example.com' },
      { GROUP: 'unknown' },
      { CATNR: '../1' },
      { CATNR: '0' },
      { CATNR: ['25544'] },
      { GROUP: 'stations', CATNR: '25544' },
      { GROUP: 'stations', FORMAT: 'html' },
    ]) {
      await expect(service.get('elements', invalid)).rejects.toMatchObject({ status: 400 });
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it('never has more than one upstream request active across different keys', async () => {
    let active = 0,
      maximum = 0;
    const upstream = vi.fn(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return new Response(tle);
    });
    const service = create(upstream);
    await Promise.all(
      ['stations', 'active', 'amateur'].map((GROUP) =>
        service.get('elements', { GROUP, FORMAT: 'tle' }),
      ),
    );
    expect(maximum).toBe(1);
  });
});

it('proxy responds with original body and durable ISO metadata, including stale blocked data', async () => {
  const upstream = vi
    .fn()
    .mockResolvedValueOnce(new Response(tle))
    .mockResolvedValueOnce(new Response('blocked', { status: 403 }));
  const service = create(upstream);
  const app = createApp({ radioService: {}, celestrakService: service });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const first = await fetch(`${base}/api/celestrak/elements?GROUP=stations&FORMAT=tle`);
    expect(first.status).toBe(200);
    const date = first.headers.get('x-celestrak-updated-at');
    expect(date).toBe(new Date(now).toISOString());
    expect(await first.text()).toBe(tle);
    now += WEEK_MS;
    const stale = await fetch(`${base}/api/celestrak/elements?GROUP=stations&FORMAT=tle`);
    expect(stale.status).toBe(200);
    expect(stale.headers.get('x-celestrak-updated-at')).toBe(date);
    expect(stale.headers.get('x-celestrak-blocked-until')).toBe(
      new Date(now + WEEK_MS).toISOString(),
    );
    expect(await stale.text()).toBe(tle);
    const missing = await fetch(`${base}/api/celestrak/elements?GROUP=amateur&FORMAT=tle`);
    expect(missing.status).toBe(503);
    expect(missing.headers.get('x-celestrak-blocked-until')).toBe(
      new Date(now + WEEK_MS).toISOString(),
    );
    expect((await fetch(`${base}/api/celestrak/elements?url=https://example.com`)).status).toBe(
      400,
    );
    expect(upstream).toHaveBeenCalledTimes(2);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
