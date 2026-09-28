import * as sgp4 from 'satellite.js';
import type { Observer, Position, Satellite, TleRecord } from './types';
export type Point = [number, number];
export const EARTH_RADIUS_KM = 6378.137;
export const WORLD_SHIFTS = [-360, 0, 360];
const radiansToDegrees = (radians: number) => radians * (180 / Math.PI);
export function parseTLE(text: string): TleRecord[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const records: TleRecord[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].startsWith('1 ') || !lines[i + 1].startsWith('2 ')) continue;
    if (lines[i].slice(2, 7) !== lines[i + 1].slice(2, 7)) continue;
    const name =
      i > 0 && !/^[12] /.test(lines[i - 1])
        ? lines[i - 1].replace(/^0 /, '')
        : `NORAD ${lines[i].slice(2, 7).trim()}`;
    records.push({ name, line1: lines[i], line2: lines[i + 1] });
    i++;
  }
  return records;
}
export function observerGd(observer: Observer) {
  return {
    latitude: sgp4.degreesToRadians(observer.lat),
    longitude: sgp4.degreesToRadians(observer.lon),
    height: observer.alt / 1000,
  };
}
export function positionAt(
  sat: Satellite,
  timeMs: number,
  observer: Observer | null = null,
): Position | null {
  try {
    const date = new Date(timeMs);
    const result = sgp4.propagate(sat.satrec, date);
    if (!result.position || typeof result.position === 'boolean') return null;
    const gmst = sgp4.gstime(date);
    const geo = sgp4.eciToGeodetic(result.position, gmst);
    const position = {
      lat: sgp4.degreesLat(geo.latitude),
      lon: sgp4.degreesLong(geo.longitude),
      altKm: geo.height,
      elevation: observer
        ? radiansToDegrees(
            sgp4.ecfToLookAngles(observerGd(observer), sgp4.eciToEcf(result.position, gmst))
              .elevation,
          )
        : null,
    };
    return [position.lat, position.lon, position.altKm].every(Number.isFinite) &&
      position.altKm > 0 &&
      (position.elevation === null || Number.isFinite(position.elevation))
      ? position
      : null;
  } catch {
    return null;
  }
}
export function lookAngles(sat: Satellite, timeMs: number, observer: Observer) {
  try {
    const date = new Date(timeMs);
    const result = sgp4.propagate(sat.satrec, date);
    if (!result.position || typeof result.position === 'boolean') return null;
    const look = sgp4.ecfToLookAngles(
      observerGd(observer),
      sgp4.eciToEcf(result.position, sgp4.gstime(date)),
    );
    return Number.isFinite(look.elevation) && Number.isFinite(look.azimuth)
      ? {
          elevation: radiansToDegrees(look.elevation),
          azimuth: (radiansToDegrees(look.azimuth) + 360) % 360,
        }
      : null;
  } catch {
    return null;
  }
}
export function losRadiusMeters(altKm: number, observerAltMeters = 0): number {
  if (!Number.isFinite(altKm) || altKm <= 0) return 0;
  const obsKm = Number.isFinite(observerAltMeters) ? Math.max(0, observerAltMeters / 1000) : 0;
  return (
    EARTH_RADIUS_KM *
    (Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm)) +
      Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + obsKm))) *
    1000
  );
}
export function distanceKm(a: Point, b: Point) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b[0] - a[0]) * r) / 2) ** 2 +
    Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
export function footprintDelta(sat: Satellite, observer: Observer, time: number) {
  const pos = positionAt(sat, time);
  return pos
    ? losRadiusMeters(pos.altKm, observer.alt) / 1000 -
        distanceKm([observer.lat, observer.lon], [pos.lat, pos.lon])
    : NaN;
}
export function splitTrack(points: Point[]): Point[][] {
  const segments: Point[][] = [];
  let current: Point[] = [];
  for (const point of points) {
    if (current.length && Math.abs(point[1] - current[current.length - 1][1]) > 180) {
      if (current.length > 1) segments.push(current);
      current = [];
    }
    current.push(point);
  }
  if (current.length > 1) segments.push(current);
  return segments;
}
export function trackPoints(sat: Satellite, from: number, to: number, step = 5000): Point[] {
  const points: Point[] = [];
  if (![from, to, step].every(Number.isFinite) || to < from || step <= 0) return points;
  // Bound work for slow geosynchronous orbits without changing the sampling of LEO passes.
  const interval = Math.max(step, (to - from) / 2400);
  for (let time = from; time < to; time += interval) {
    const pos = positionAt(sat, time);
    if (pos) points.push([pos.lat, pos.lon]);
  }
  const end = positionAt(sat, to);
  if (end) points.push([end.lat, end.lon]);
  return points;
}
export function orbitalParams(sat: Satellite) {
  const periodMin = (2 * Math.PI) / sat.satrec.no;
  const semiMajorKm = Math.cbrt(398600.4418 * ((periodMin * 60) / (2 * Math.PI)) ** 2);
  return {
    periodMin,
    semiMajorKm,
    perigeeKm: semiMajorKm * (1 - sat.satrec.ecco) - EARTH_RADIUS_KM,
    apogeeKm: semiMajorKm * (1 + sat.satrec.ecco) - EARTH_RADIUS_KM,
    inclDeg: radiansToDegrees(sat.satrec.inclo),
  };
}
export function cardinal(az: number | null) {
  return az === null || !Number.isFinite(az)
    ? 'N/A'
    : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][((Math.round(az / 45) % 8) + 8) % 8];
}
