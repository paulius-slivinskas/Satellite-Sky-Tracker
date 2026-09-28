import { afterEach, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/data/http', () => ({ request: mocked.request }));
import { loadSatelliteInfo } from '../src/data/radio';
afterEach(() => mocked.request.mockReset());

it('preserves catalog details on radio failure and allows the next selection to retry', async () => {
  mocked.request.mockImplementation((url: string) =>
    url.endsWith('/radio')
      ? Promise.reject(new Error('offline'))
      : Promise.resolve([{ OBJECT_NAME: 'Example' }]),
  );
  const first = await loadSatelliteInfo('123456', new AbortController().signal);
  expect(first.radio).toBeNull();
  expect(first.satcat?.OBJECT_NAME).toBe('Example');
  expect(first.warning).toContain('Radio data');
  await loadSatelliteInfo('123456', new AbortController().signal);
  expect(mocked.request).toHaveBeenCalledTimes(4);
});

it('reuses a successful response while still honoring caller cancellation', async () => {
  mocked.request.mockImplementation((url: string) =>
    Promise.resolve(
      url.endsWith('/radio') ? { norad: 654321, transmitters: [] } : [{ OBJECT_NAME: 'Example' }],
    ),
  );
  const first = await loadSatelliteInfo('654321', new AbortController().signal);
  expect(await loadSatelliteInfo('654321', new AbortController().signal)).toBe(first);
  expect(mocked.request).toHaveBeenCalledTimes(2);
  const controller = new AbortController();
  controller.abort();
  await expect(loadSatelliteInfo('654321', controller.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});
