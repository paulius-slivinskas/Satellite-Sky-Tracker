import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { createApp } = require('../server.js');
const { RadioService, SatnogsError } = require('../services/radioService.js');
const { MemoryCache, RedisCache, createCache } = require('../lib/cache.js');
const { normalizeTransmitter, parseMhzFieldRange } = require('../lib/radioNormalization.js');
const actualFetch = globalThis.fetch;

afterEach(() => vi.restoreAllMocks());

function service(cache = new MemoryCache()) {
  const instance = new RadioService(cache);
  instance.amsatMap = {};
  instance.amsatCsvByNorad = new Map();
  return instance;
}
function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('radio normalization', () => {
  it.each([null, undefined, '', '  ', 0])(
    'preserves valid ranges when a single frequency is %s',
    (missing) => {
      const tx = normalizeTransmitter({
        downlink_low: 145800000,
        downlink_high: 145900000,
        downlink: missing,
      });
      expect(tx.downlink).toEqual({ low: 145800000, high: 145900000, unit: 'Hz' });
    },
  );
  it('keeps missing channels missing, including CSV zero placeholders', () => {
    expect(normalizeTransmitter({ uplink: null }).uplink.low).toBeNull();
    expect(parseMhzFieldRange('')).toEqual({ low: null, high: null, unit: 'Hz' });
    expect(parseMhzFieldRange('0').low).toBeNull();
    expect(parseMhzFieldRange('145.800-145.900')).toEqual({
      low: 145800000,
      high: 145900000,
      unit: 'Hz',
    });
  });
});

describe('RadioService resilience', () => {
  it('uses CSV radio data when SatNOGS is down', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const radio = service();
    radio.amsatCsvByNorad.set('12345', [
      { norad: '12345', name: 'Test satellite', downlinkRaw: '145.8', mode: 'FM' },
    ]);
    const payload = await radio.getUnifiedRadioByNorad('12345');
    expect(payload.source).toMatchObject({ satnogs: false, amsatCsv: true });
    expect(payload.transmitters[0].downlink.low).toBe(145800000);
    expect(payload.norad).toBe(12345);
    expect(payload.status.provider).toBe('none');
  });
  it('deduplicates concurrent requests and releases failed requests for retry', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const radio = service();
    const first = radio.getUnifiedRadioByNorad('12345');
    expect(radio.getUnifiedRadioByNorad('12345')).toBe(first);
    await expect(first).rejects.toBeInstanceOf(SatnogsError);
    await expect(radio.getUnifiedRadioByNorad('12345')).rejects.toBeInstanceOf(SatnogsError);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
  it('returns network results despite cache read and write failures', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse([{ name: 'Test', transmitters: [{ downlink: 145800000 }] }]));
    const radio = service({
      get: async () => {
        throw new Error('cache down');
      },
      set: async () => {
        throw new Error('cache down');
      },
    });
    const [first, second] = await Promise.all([
      radio.getUnifiedRadioByNorad('12345'),
      radio.getUnifiedRadioByNorad('12345'),
    ]);
    expect(first).toBe(second);
    expect(first.transmitters[0].downlink.low).toBe(145800000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('cache availability', () => {
  it('expires memory entries', async () => {
    const cache = new MemoryCache();
    await cache.set('key', 42, -1);
    expect(await cache.get('key')).toBeNull();
  });
  it('bounds unavailable Redis startup and disables reconnection', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = {
      isOpen: true,
      on: vi.fn(),
      connect: () => new Promise(() => {}),
      disconnect: vi.fn(async () => {}),
    };
    const factory = vi.fn(() => client);
    const result = await createCache({
      redisUrl: 'redis://invalid',
      createClient: factory,
      timeoutMs: 10,
    });
    expect(result.provider).toBe('memory');
    expect(factory.mock.calls[0][0]).toMatchObject({
      disableOfflineQueue: true,
      socket: { reconnectStrategy: false },
    });
    expect(client.disconnect).toHaveBeenCalledOnce();
    await result.cache.set('key', 42, 1000);
    expect(await result.cache.get('key')).toBe(42);
  });
  it('falls back to its local copy on a stalled Redis command', async () => {
    const client = {
      isOpen: true,
      get: vi.fn(() => new Promise(() => {})),
      setEx: vi.fn(async () => {}),
      disconnect: vi.fn(async () => {}),
    };
    const cache = new RedisCache(client, { timeoutMs: 10 });
    await cache.set('key', { count: 1 }, 1000);
    expect(await cache.get('key')).toEqual({ count: 1 });
    expect(await cache.get('key')).toEqual({ count: 1 });
    expect(client.get).toHaveBeenCalledOnce();
    expect(client.disconnect).toHaveBeenCalledOnce();
  });
});

describe('HTTP boundary', () => {
  it('serves published assets only and validates catalog IDs', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'satellite-server-'));
    await mkdir(path.join(dir, 'dist'));
    await mkdir(path.join(dir, 'public'));
    await writeFile(path.join(dir, 'dist', 'index.html'), '<html>Built app</html>');
    await writeFile(path.join(dir, 'public', 'asset.txt'), 'public asset');
    const getUnifiedRadioByNorad = vi.fn(async (norad: string) => ({
      norad: Number(norad),
      transmitters: [],
    }));
    const app = createApp({
      radioService: { getUnifiedRadioByNorad },
      distDir: path.join(dir, 'dist'),
      publicDir: path.join(dir, 'public'),
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      expect(await (await actualFetch(base)).text()).toContain('Built app');
      expect(await (await actualFetch(`${base}/asset.txt`)).text()).toBe('public asset');
      for (const resource of [
        '/server.js',
        '/lib/cache.js',
        '/package.json',
        '/.env',
        '/api/unknown',
      ]) {
        expect((await actualFetch(`${base}${resource}`)).status).toBe(404);
      }
      for (const norad of ['0', '-1', '123a', '9007199254740992', '1.5']) {
        expect((await actualFetch(`${base}/api/sat/${norad}/radio`)).status).toBe(400);
      }
      expect(getUnifiedRadioByNorad).not.toHaveBeenCalled();
      expect((await actualFetch(`${base}/api/sat/025544/radio`)).status).toBe(200);
      expect(getUnifiedRadioByNorad).toHaveBeenCalledWith('25544');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  });
});
