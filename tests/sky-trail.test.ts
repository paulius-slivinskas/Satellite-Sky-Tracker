import { expect, it, vi } from 'vitest';
import type { Satellite, Pass } from '../src/domain/types';
import { skyTrail, passSkyTrail } from '../src/domain/skyTrail';
vi.mock('../src/domain/orbits', () => ({
  lookAngles: (_sat: Satellite, time: number) => ({
    azimuth: time / 1000,
    elevation: Math.sin(time / 10000) * 40,
  }),
}));
const sat = {} as Satellite;
const observer = { lat: 54, lon: 25, alt: 0, name: 'Test' };
it('connects the current time to rise even when rise is more than 90 seconds away', () => {
  const points = skyTrail(sat, observer, 1234, 600000);
  expect(points[0].time).toBe(1234);
  expect(points.at(-1)!.time).toBe(600000);
  expect(points.length).toBeGreaterThan(30);
  for (const point of points) expect(point.look!.azimuth).toBe(point.time / 1000);
});
it('uses actual horizon times rather than different footprint boundaries', () => {
  const points = passSkyTrail(sat, observer, {
    start: 100000,
    end: 700000,
    losStart: 80000,
    losEnd: 720000,
  } as Pass);
  expect(points[0].time).toBe(100000);
  expect(points.at(-1)!.time).toBe(700000);
});
it('bounds long predictions and rejects invalid ranges', () => {
  expect(skyTrail(sat, observer, 0, 7 * 86400000)).toHaveLength(4097);
  expect(skyTrail(sat, observer, 100, 99)).toEqual([]);
  expect(skyTrail(sat, observer, NaN, 999)).toEqual([]);
});
