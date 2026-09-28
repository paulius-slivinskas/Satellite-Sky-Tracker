import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { HttpError, request } from '../src/data/http';
import { readStored, writeStored } from '../src/data/storage';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('HTTP requests', () => {
  it('does not retry a permanent 404 response', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 404 }));
    await expect(request('/missing')).rejects.toMatchObject({ status: 404 });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('does not start an already aborted request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const controller = new AbortController();
    controller.abort();
    await expect(request('/cancelled', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('cancels a retry delay when the caller aborts', async () => {
    const controller = new AbortController();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 503 }));
    const pending = request('/retry', { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('keeps the timeout active while consuming the response body', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.write('{"unfinished":');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');
    try {
      await expect(
        request(`http://127.0.0.1:${address.port}`, { timeoutMs: 50, attempts: 1 }),
      ).rejects.toMatchObject({ name: expect.stringMatching(/AbortError|TimeoutError/) });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('browser storage', () => {
  it('tolerates corrupt values and quota restrictions', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => '{broken',
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(readStored('settings')).toBeNull();
    expect(() => writeStored('settings', { version: 2 })).not.toThrow();
  });
});
