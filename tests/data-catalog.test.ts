import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixtures = vi.hoisted(() => ({
  categories: [
    { key: 'iss', label: 'ISS', color: '#f00', url: 'stations' },
    { key: 'amateur', label: 'Amateur', color: '#0f0', url: 'amateur' },
    { key: 'weather', label: 'Weather', color: '#00f', url: 'weather' },
    { key: 'other', label: 'Other', color: '#fff', url: 'active' },
  ] as Array<{
    key: string;
    label: string;
    color: string;
    url: string;
    include?: (name: string) => boolean;
  }>,
  request: vi.fn(),
}));
vi.mock('../src/domain/config', () => ({
  CATEGORY_CONFIG: fixtures.categories,
  FLEET_SATCOM_TARGETS: [
    { noradId: '10669', name: 'OPS 6391 (FLTSATCOM 1)' },
    { noradId: '11353', name: 'OPS 6392 (FLTSATCOM 2)' },
  ],
}));
vi.mock('../src/data/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/data/http')>()),
  request: fixtures.request,
}));
import { HttpError } from '../src/data/http';
import { loadCatalog, readCatalog, type Catalog } from '../src/data/catalog';

const now = Date.UTC(2024, 1, 29, 14);
const day = 86400000;
function record(id: string, name = `SAT ${id}`) {
  return {
    name,
    line1: `1 ${id}U 98067A   24060.51835648  .00016717  00000+0  30172-3 0  9993`,
    line2: `2 ${id}  51.6416  89.8378 0006703  79.7029  39.1195 15.50068474440912`,
  };
}
function text(id: string, name?: string) {
  const r = record(id, name);
  return `${r.name}\n${r.line1}\n${r.line2}`;
}
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.spyOn(Date, 'now').mockReturnValue(now);
  fixtures.request.mockReset();
});
afterEach(() => {
  fixtures.categories.splice(4);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('retains old valid data indefinitely while rejecting future timestamps', () => {
  storage.set(
    'satapp_catalog_v2',
    JSON.stringify([
      { key: 'iss', savedAt: now - 15 * day, records: [record('25544')] },
      { key: 'amateur', savedAt: now + 2 * day, records: [record('12345')] },
      { key: 'weather', savedAt: now - 2 * day, records: [record('23456')] },
    ]),
  );
  const cached = readCatalog();
  expect(cached.satellites.map((s) => s.noradId)).toEqual(['25544', '23456']);
  expect(cached.stale).toBe(true);
  storage.delete('satapp_catalog_v2');
  storage.set('satapp_tle_cache_iss', JSON.stringify({ savedAt: now + day, text: text('25544') }));
  expect(readCatalog().satellites).toEqual([]);
});

it('reports old orbital epochs even when the feed was recently downloaded', () => {
  storage.set(
    'satapp_catalog_v2',
    JSON.stringify([{ key: 'iss', savedAt: now, records: [record('25544')] }]),
  );
  expect(readCatalog().stale).toBe(false);
  vi.mocked(Date.now).mockReturnValue(now + 8 * day);
  storage.set(
    'satapp_catalog_v2',
    JSON.stringify([{ key: 'iss', savedAt: now + 8 * day, records: [record('25544')] }]),
  );
  expect(readCatalog().stale).toBe(true);
});

it('publishes incremental snapshots and limits concurrent feed requests to three', async () => {
  const pending: Array<() => void> = [];
  let active = 0;
  let maxActive = 0;
  fixtures.request.mockImplementation(
    (url: string) =>
      new Promise((resolve) => {
        active++;
        maxActive = Math.max(maxActive, active);
        pending.push(() => {
          active--;
          resolve(
            text(
              url.includes('GROUP=stations')
                ? '25544'
                : url.includes('GROUP=amateur')
                  ? '12345'
                  : url.includes('GROUP=weather')
                    ? '23456'
                    : '34567',
            ),
          );
        });
      }),
  );
  const snapshots: Catalog[] = [];
  const loading = loadCatalog(new AbortController().signal, (value) => snapshots.push(value));
  expect(fixtures.request).toHaveBeenCalledTimes(3);
  pending.shift()!();
  await vi.waitFor(() => expect(snapshots).toHaveLength(1));
  expect(snapshots[0].satellites).toHaveLength(1);
  while (pending.length) {
    pending.shift()!();
    await Promise.resolve();
    await Promise.resolve();
  }
  const catalog = await loading;
  expect(maxActive).toBe(3);
  expect(catalog.satellites).toHaveLength(4);
  expect(snapshots[0].satellites).toHaveLength(1);
});

it('keeps cached satellites on a partial failure without mutating prior snapshots', async () => {
  storage.set(
    'satapp_catalog_v2',
    JSON.stringify([{ key: 'weather', savedAt: now - 10 * day, records: [record('23456')] }]),
  );
  let rejectWeather: (error: Error) => void = () => {};
  fixtures.request.mockImplementation((url: string) =>
    url.includes('GROUP=weather')
      ? new Promise((_resolve, reject) => {
          rejectWeather = reject;
        })
      : Promise.resolve(text(url.includes('GROUP=stations') ? '25544' : '12345')),
  );
  const snapshots: Catalog[] = [];
  const loading = loadCatalog(new AbortController().signal, (value) => snapshots.push(value));
  await vi.waitFor(() => expect(snapshots.length).toBeGreaterThan(0));
  const first = snapshots[0];
  rejectWeather(new Error('offline'));
  const result = await loading;
  expect(result.unavailable).toEqual(['Weather']);
  expect(result.stale).toBe(true);
  expect(result.satellites.some((s) => s.noradId === '23456')).toBe(true);
  expect(first.unavailable).toEqual([]);
});

it('fetches only missing fleet catalog IDs and restores canonical fleet names', async () => {
  fixtures.categories.push({
    key: 'fltsatcom',
    label: 'FLTSATCOM',
    color: '#fff',
    url: 'active',
    include: (name) => name.includes('FLTSATCOM'),
  });
  fixtures.request.mockImplementation(async (url: string) =>
    url.includes('CATNR=11353')
      ? text('11353', 'Unknown name')
      : url.includes('GROUP=active')
        ? text('10669', 'Unknown name')
        : text(url.includes('GROUP=stations') ? '25544' : '12345'),
  );
  const result = await loadCatalog(new AbortController().signal, () => {});
  const targets = fixtures.request.mock.calls
    .map((call) => call[0])
    .filter((url) => url.includes('CATNR='));
  expect(targets).toEqual(['/api/celestrak/elements?CATNR=11353&FORMAT=tle']);
  expect(result.satellites.find((s) => s.noradId === '11353')?.name).toBe('OPS 6392 (FLTSATCOM 2)');
});

it('reuses successful feeds for seven days even when explicitly loaded again', async () => {
  fixtures.request.mockImplementation(async (url: string) =>
    text(url.includes('GROUP=stations') ? '25544' : '12345'),
  );
  await loadCatalog(new AbortController().signal, () => {});
  expect(fixtures.request).toHaveBeenCalledTimes(4);
  vi.mocked(Date.now).mockReturnValue(now + 6 * day);
  await loadCatalog(new AbortController().signal, () => {});
  expect(fixtures.request).toHaveBeenCalledTimes(4);
  vi.mocked(Date.now).mockReturnValue(now + 7 * day);
  await loadCatalog(new AbortController().signal, () => {});
  expect(fixtures.request).toHaveBeenCalledTimes(8);
  for (const [, options] of fixtures.request.mock.calls) expect(options.attempts).toBe(1);
});

it('retains server cache timestamps and failure deadlines across browser reloads', async () => {
  fixtures.request.mockImplementation(
    async (url: string, options: { onResponse: (response: Response) => void }) => {
      options.onResponse(
        new Response('', {
          headers: {
            'X-Celestrak-Updated-At': new Date(now - 30 * day).toISOString(),
            'X-Celestrak-Next-Refresh-At': new Date(now + 7 * day).toISOString(),
            'X-Celestrak-Blocked-Until': new Date(now + 7 * day).toISOString(),
            'X-Celestrak-Warning': 'CelesTrak returned HTTP 403; using retained data.',
          },
        }),
      );
      return text(url.includes('GROUP=stations') ? '25544' : '12345');
    },
  );
  const first = await loadCatalog(new AbortController().signal, () => {});
  expect(first.refreshedAt).toBe(now - 30 * day);
  expect(first.blockedUntil).toBe(now + 7 * day);
  expect(first.issues[0].reason).toContain('HTTP 403');
  expect(first.satellites.length).toBeGreaterThan(0);
  const count = fixtures.request.mock.calls.length;
  await loadCatalog(new AbortController().signal, () => {});
  expect(fixtures.request).toHaveBeenCalledTimes(count);
  expect(readCatalog().issues[0].reason).toContain('HTTP 403');
  expect(readCatalog().refreshedAt).toBe(first.refreshedAt);
});

it('uses SatNOGS only when no retained ISS orbit is available and proxy is blocked', async () => {
  fixtures.request.mockImplementation(
    async (url: string, options: { onResponse?: (response: Response) => void }) => {
      if (url.includes('db.satnogs.org')) {
        const iss = record('25544');
        return [{ tle0: iss.name, tle1: iss.line1, tle2: iss.line2 }];
      }
      options.onResponse?.(
        new Response('', {
          status: 503,
          headers: {
            'X-Celestrak-Blocked-Until': new Date(now + 7 * day).toISOString(),
            'X-Celestrak-Next-Refresh-At': new Date(now + 7 * day).toISOString(),
            'X-Celestrak-Warning': 'CelesTrak returned HTTP 403',
          },
        }),
      );
      throw new HttpError(503);
    },
  );
  const result = await loadCatalog(new AbortController().signal, () => {});
  expect(result.satellites.map((sat) => sat.noradId)).toEqual(['25544']);
  expect(result.unavailable).not.toContain('ISS');
  expect(result.blockedUntil).toBe(now + 7 * day);
  const count = fixtures.request.mock.calls.length;
  await loadCatalog(new AbortController().signal, () => {});
  expect(fixtures.request).toHaveBeenCalledTimes(count);
});

it('never discards a retained ISS orbit when refresh and fallback are unavailable', async () => {
  storage.set(
    'satapp_catalog_v2',
    JSON.stringify([{ key: 'iss', savedAt: now - 100 * day, records: [record('25544')] }]),
  );
  fixtures.request.mockRejectedValue(new TypeError('offline'));
  const result = await loadCatalog(new AbortController().signal, () => {});
  expect(result.satellites.map((sat) => sat.noradId)).toEqual(['25544']);
  expect(result.refreshedAt).toBe(now - 100 * day);
  expect(fixtures.request.mock.calls.some((call) => call[0].includes('db.satnogs'))).toBe(false);
});

it('distinguishes old orbital epochs from old cache timestamps and unavailable feeds', () => {
  vi.mocked(Date.now).mockReturnValue(now + 8 * day);
  storage.set(
    'satapp_catalog_v2',
    JSON.stringify([
      { key: 'iss', savedAt: now + 8 * day, records: [record('25544')] },
      { key: 'weather', savedAt: now, records: [record('23456')] },
    ]),
  );
  const result = readCatalog();
  expect(result.outdatedCount).toBe(2);
  expect(result.staleGroups).toEqual(['Weather']);
  expect(result.unavailable).toEqual([]);
  expect(result.issues).toEqual([]);
  expect(result.stale).toBe(true);
});

it('reports timeout, empty-feed and network failures distinctly', async () => {
  fixtures.request.mockImplementation(async (url: string) => {
    if (url.includes('GROUP=stations')) return text('25544');
    if (url.includes('GROUP=amateur')) throw new DOMException('Deadline', 'TimeoutError');
    if (url.includes('GROUP=weather')) return 'No GP data found';
    throw new TypeError('Failed to fetch');
  });
  const result = await loadCatalog(new AbortController().signal, () => {});
  expect(result.issues).toEqual(
    expect.arrayContaining([
      { category: 'Amateur', reason: 'Request timed out' },
      { category: 'Weather', reason: 'No valid orbital elements returned' },
      { category: 'Other', reason: 'Network request failed' },
    ]),
  );
  expect(result.outdatedCount).toBe(0);
  expect(result.staleGroups).toEqual([]);
});

it('honors cancellation before using cache or a persisted pause', async () => {
  storage.set('satapp_celestrak_blocked_until', JSON.stringify(now + 60000));
  const controller = new AbortController();
  controller.abort();
  const progress = vi.fn();
  await expect(loadCatalog(controller.signal, progress)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(fixtures.request).not.toHaveBeenCalled();
  expect(progress).not.toHaveBeenCalled();
});

it('preserves old fleet members when a fresh active group cannot refresh individual targets', async () => {
  fixtures.categories.push({
    key: 'fltsatcom',
    label: 'FLTSATCOM',
    color: '#fff',
    url: 'active',
    include: (name) => name.includes('FLTSATCOM'),
  });
  storage.set(
    'satapp_catalog_v2',
    JSON.stringify([
      {
        key: 'fltsatcom',
        savedAt: now - 30 * day,
        records: [record('11353', 'OPS 6392 (FLTSATCOM 2)')],
      },
    ]),
  );
  fixtures.request.mockImplementation(async (url: string) => {
    if (url.includes('CATNR=11353')) throw new HttpError(503);
    return text(
      url.includes('GROUP=active') ? '10669' : url.includes('GROUP=stations') ? '25544' : '12345',
      url.includes('GROUP=active') ? 'OPS 6391 (FLTSATCOM 1)' : undefined,
    );
  });
  const result = await loadCatalog(new AbortController().signal, () => {});
  expect(result.satellites.find((sat) => sat.noradId === '11353')?.category).toBe('fltsatcom');
  const saved = JSON.parse(storage.get('satapp_catalog_v2')!);
  expect(saved.find((group: { key: string }) => group.key === 'fltsatcom').savedAt).toBe(
    now - 30 * day,
  );
});

it('retries the proxy after a short offline interruption instead of blocking the browser for a week', async () => {
  fixtures.request.mockRejectedValue(new TypeError('offline'));
  await loadCatalog(new AbortController().signal, () => {});
  vi.mocked(Date.now).mockReturnValue(now + 61000);
  fixtures.request.mockImplementation(async (url: string) =>
    text(url.includes('GROUP=stations') ? '25544' : '12345'),
  );
  const result = await loadCatalog(new AbortController().signal, () => {});
  expect(result.satellites.length).toBeGreaterThan(0);
  expect(result.unavailable).toEqual([]);
});

it('can reload server data if the large browser catalog was evicted after a successful response', async () => {
  fixtures.request.mockImplementation(async (url: string) =>
    text(url.includes('GROUP=stations') ? '25544' : '12345'),
  );
  await loadCatalog(new AbortController().signal, () => {});
  storage.delete('satapp_catalog_v2');
  const count = fixtures.request.mock.calls.length;
  const result = await loadCatalog(new AbortController().signal, () => {});
  expect(result.satellites.length).toBeGreaterThan(0);
  expect(fixtures.request.mock.calls.length).toBeGreaterThan(count);
});
