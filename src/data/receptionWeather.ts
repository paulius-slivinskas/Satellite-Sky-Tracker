import type { Observer } from '../domain/types';
import { request } from './http';
export interface ReceptionWeather {
  sampledAt: number;
  temperatureC: number | null;
  windKmh: number | null;
  cloudPercent: number | null;
  precipitationMm: number | null;
  description: string;
  source: 'Open-Meteo';
}
function description(code: unknown): string {
  if (typeof code !== 'number' || !Number.isInteger(code)) return 'Conditions unavailable';
  const codes: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow',
    73: 'Moderate snow',
    75: 'Heavy snow',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail',
  };
  return codes[code] ?? 'Conditions unavailable';
}
/** Hourly model estimate near the recording time; not a local weather observation. */
export async function loadReceptionWeather(
  observer: Observer,
  startedAt: number,
  signal?: AbortSignal,
): Promise<ReceptionWeather> {
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(new Date(startedAt).getTime()) ||
    !Number.isFinite(observer.lat) ||
    Math.abs(observer.lat) > 90 ||
    !Number.isFinite(observer.lon) ||
    Math.abs(observer.lon) > 180
  )
    throw new Error('Invalid weather location or recording time.');
  const day = new Date(startedAt).toISOString().slice(0, 10);
  const endpoint =
    startedAt >= Date.now() - 5 * 86400000
      ? 'https://api.open-meteo.com/v1/forecast'
      : 'https://archive-api.open-meteo.com/v1/archive';
  const query = new URLSearchParams({
    latitude: String(observer.lat),
    longitude: String(observer.lon),
    start_date: day,
    end_date: day,
    hourly: 'temperature_2m,weather_code,wind_speed_10m,cloud_cover,precipitation',
    timezone: 'UTC',
    timeformat: 'unixtime',
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
  });
  const payload = await request<unknown>(`${endpoint}?${query}`, {
    signal,
    attempts: 1,
    timeoutMs: 9000,
  });
  if (!payload || typeof payload !== 'object') throw new Error('Weather data unavailable.');
  const hourly = (payload as { hourly?: unknown }).hourly;
  if (!hourly || typeof hourly !== 'object') throw new Error('Weather data unavailable.');
  const rows = hourly as Record<string, unknown>;
  if (!Array.isArray(rows.time)) throw new Error('Weather times unavailable.');
  let selected = -1,
    distance = Infinity;
  rows.time.forEach((time: unknown, index: number) => {
    if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0) return;
    const delta = Math.abs(time * 1000 - startedAt);
    if (delta < distance) {
      distance = delta;
      selected = index;
    }
  });
  if (selected < 0 || distance > 3600000)
    throw new Error('Weather data unavailable near the recording time.');
  const value = (key: string, min = -Infinity, max = Infinity): number | null => {
    const values = rows[key];
    const result = Array.isArray(values) ? values[selected] : null;
    return typeof result === 'number' && Number.isFinite(result) && result >= min && result <= max
      ? result
      : null;
  };
  const result: ReceptionWeather = {
    sampledAt: (rows.time[selected] as number) * 1000,
    temperatureC: value('temperature_2m', -100, 100),
    windKmh: value('wind_speed_10m', 0),
    cloudPercent: value('cloud_cover', 0, 100),
    precipitationMm: value('precipitation', 0),
    description: description(value('weather_code')),
    source: 'Open-Meteo',
  };
  if (
    [result.temperatureC, result.windKmh, result.cloudPercent, result.precipitationMm].every(
      (v) => v === null,
    ) &&
    result.description === 'Conditions unavailable'
  )
    throw new Error('Weather values unavailable.');
  return result;
}
