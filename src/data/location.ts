import type { Observer } from '../domain/types';
import { request } from './http';
interface Feature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; city?: string; county?: string; state?: string; country?: string };
}
export async function searchLocations(query: string, signal: AbortSignal): Promise<Observer[]> {
  if (query.trim().length < 2) return [];
  const payload = await request<{ features: Feature[] }>(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8`,
    { signal, attempts: 1 },
  );
  const seen = new Set<string>();
  return payload.features.flatMap((feature) => {
    const [lon, lat] = feature.geometry.coordinates;
    const p = feature.properties;
    const name = [...new Set([p.name, p.city, p.state, p.country].filter(Boolean))].join(', ');
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || seen.has(key)) return [];
    seen.add(key);
    return [{ lat, lon, alt: 0, name }];
  });
}
export async function elevation(lat: number, lon: number, signal: AbortSignal): Promise<number> {
  const result = await request<{ elevation: number[] }>(
    `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`,
    { signal, attempts: 1 },
  );
  const value = result.elevation?.[0];
  if (!Number.isFinite(value)) throw new Error('Elevation unavailable');
  return value;
}
export function browserLocation(): Promise<Observer> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          alt: position.coords.altitude ?? 0,
          name: 'Current location',
        }),
      reject,
      { timeout: 10000, maximumAge: 300000 },
    );
  });
}
