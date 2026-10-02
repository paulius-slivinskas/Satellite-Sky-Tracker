import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadReceptionWeather } from '../src/data/receptionWeather';
const observer = { lat: 54.6, lon: 25.2, alt: 0, name: 'Vilnius' };
const startedAt = Date.parse('2026-10-02T12:40:00Z');
function response(hourly: unknown) {
  return new Response(JSON.stringify({ hourly }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
afterEach(() => {
  vi.restoreAllMocks();
});
describe('reception weather snapshot', () => {
  it('requests UTC hourly recent data and chooses nearest sample', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(startedAt);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        time: [startedAt / 1000 - 2400, startedAt / 1000 + 1200],
        temperature_2m: [10, 12],
        weather_code: [0, 3],
        wind_speed_10m: [5, 7],
        cloud_cover: [0, 100],
        precipitation: [0, 0.4],
      }),
    );
    expect(await loadReceptionWeather(observer, startedAt)).toEqual({
      sampledAt: startedAt + 1200000,
      temperatureC: 12,
      windKmh: 7,
      cloudPercent: 100,
      precipitationMm: 0.4,
      description: 'Overcast',
      source: 'Open-Meteo',
    });
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.hostname).toBe('api.open-meteo.com');
    expect(url.searchParams.get('timezone')).toBe('UTC');
    expect(url.searchParams.get('start_date')).toBe('2026-10-02');
    expect(url.searchParams.get('timeformat')).toBe('unixtime');
  });
  it('uses archive for older recordings and preserves missing fields as null', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(startedAt + 10 * 86400000);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        time: [startedAt / 1000],
        temperature_2m: [null],
        wind_speed_10m: ['5'],
        cloud_cover: [null],
        precipitation: [0],
        weather_code: [null],
      }),
    );
    const weather = await loadReceptionWeather(observer, startedAt);
    expect(weather.temperatureC).toBeNull();
    expect(weather.windKmh).toBeNull();
    expect(weather.cloudPercent).toBeNull();
    expect(weather.precipitationMm).toBe(0);
    expect(String(fetch.mock.calls[0][0])).toContain('archive-api.open-meteo.com');
  });
  it.each([
    { time: [startedAt / 1000 - 7200] },
    { time: ['2026-10-02T12:00'] },
    { time: [startedAt / 1000], temperature_2m: [null] },
    null,
  ])('rejects absent, invalid or unrelated hourly data %j', async (hourly) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(hourly));
    await expect(loadReceptionWeather(observer, startedAt)).rejects.toThrow(/Weather/);
  });
  it('rejects invalid location before network and honors already-aborted requests', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(loadReceptionWeather({ ...observer, lat: 91 }, startedAt)).rejects.toThrow(
      /Invalid/,
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      loadReceptionWeather(observer, startedAt, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
