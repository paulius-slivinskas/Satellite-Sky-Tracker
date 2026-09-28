import { describe, expect, it } from 'vitest';
import * as sgp4 from 'satellite.js';
import {
  cardinal,
  distanceKm,
  EARTH_RADIUS_KM,
  footprintDelta,
  lookAngles,
  losRadiusMeters,
  observerGd,
  orbitalParams,
  parseTLE,
  positionAt,
  splitTrack,
  trackPoints,
} from '../src/domain/orbits';
import { predictPasses, predictWatchlistPasses } from '../src/domain/passes';
import type { Satellite } from '../src/domain/types';

// Fixed historical fixture: tests exercise deterministic behavior, not live-orbit accuracy.
const line1 = '1 25544U 98067A   24060.51835648  .00016717  00000+0  30172-3 0  9993';
const line2 = '2 25544  51.6416  70.5262 0005235  60.8206  44.0617 15.49815374441373';
const fixture = (): Satellite => ({
  name: 'ISS',
  line1,
  line2,
  id: 'NORAD-25544',
  noradId: '25544',
  category: 'iss',
  color: '#f60',
  satrec: sgp4.twoline2satrec(line1, line2),
});
const now = Date.parse('2024-02-29T12:30:00Z');
const observer = { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' };

describe('pure orbital domain', () => {
  it('accepts named and unnamed TLE pairs and rejects mismatched catalogs', () => {
    expect(parseTLE(`0 ISS\r\n${line1}\r\n${line2}`)).toEqual([{ name: 'ISS', line1, line2 }]);
    expect(parseTLE(`${line1}\n${line2}`)[0].name).toBe('NORAD 25544');
    expect(parseTLE(`${line1}\n${line2.replace('25544', '12345')}`)).toEqual([]);
  });
  it('matches satellite.js coordinate and look-angle transforms, with meters converted to km', () => {
    const sat = fixture();
    const date = new Date(now);
    const raw = sgp4.propagate(sat.satrec, date).position as sgp4.EciVec3<number>;
    const gmst = sgp4.gstime(date);
    const geo = sgp4.eciToGeodetic(raw, gmst);
    const gd = {
      latitude: (observer.lat * Math.PI) / 180,
      longitude: (observer.lon * Math.PI) / 180,
      height: 0.12,
    };
    const look = sgp4.ecfToLookAngles(gd, sgp4.eciToEcf(raw, gmst));
    expect(observerGd(observer).height).toBe(0.12);
    expect(observerGd(observer).latitude).toBeCloseTo(gd.latitude, 14);
    expect(observerGd(observer).longitude).toBeCloseTo(gd.longitude, 14);
    expect(positionAt(sat, now, observer)).toMatchObject({
      lat: sgp4.degreesLat(geo.latitude),
      lon: sgp4.degreesLong(geo.longitude),
      altKm: geo.height,
    });
    expect(positionAt(sat, now, observer)!.elevation).toBeCloseTo(
      sgp4.radiansToDegrees(look.elevation),
      10,
    );
    expect(lookAngles(sat, now, observer)?.azimuth).toBeCloseTo(
      sgp4.radiansToDegrees(look.azimuth),
      10,
    );
    expect(orbitalParams(sat).periodMin).toBeGreaterThan(90);
    expect(orbitalParams(sat).periodMin).toBeLessThan(95);
  });
  it('rejects invalid dates and propagation failures rather than leaking NaN positions', () => {
    expect(positionAt(fixture(), NaN)).toBeNull();
    expect(lookAngles(fixture(), Infinity, observer)).toBeNull();
    const invalid = fixture();
    invalid.satrec.ecco = 2;
    expect(positionAt(invalid, now)).toBeNull();
    expect(lookAngles(invalid, now, observer)).toBeNull();
    expect(Number.isNaN(footprintDelta(invalid, observer, now))).toBe(true);
    expect(positionAt(fixture(), now, { ...observer, lat: NaN })).toBeNull();
  });
  it('uses explicit observer altitude for LOS and clamps invalid or negative altitude safely', () => {
    const seaLevel = EARTH_RADIUS_KM * Math.acos(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + 400)) * 1000;
    expect(losRadiusMeters(400, 0)).toBeCloseTo(seaLevel, 8);
    expect(losRadiusMeters(400, 1000)).toBeGreaterThan(seaLevel);
    expect(losRadiusMeters(400, -100)).toBe(seaLevel);
    expect(losRadiusMeters(400, NaN)).toBe(seaLevel);
    expect(losRadiusMeters(-1, 0)).toBe(0);
    expect(losRadiusMeters(NaN, 0)).toBe(0);
  });
  it('handles the date line and antipodes without connecting across the map', () => {
    expect(distanceKm([0, 179], [0, -179])).toBeCloseTo((EARTH_RADIUS_KM * 2 * Math.PI) / 180, 8);
    expect(distanceKm([0, 0], [0, 180])).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 8);
    expect(
      splitTrack([
        [0, 178],
        [1, 179],
        [2, -179],
        [3, -178],
      ]),
    ).toEqual([
      [
        [0, 178],
        [1, 179],
      ],
      [
        [2, -179],
        [3, -178],
      ],
    ]);
    expect(splitTrack([])).toEqual([]);
  });
  it('bounds track work, includes exact endpoints, and rejects unsafe ranges', () => {
    const sat = fixture();
    const points = trackPoints(sat, now, now + 11000, 5000);
    const end = positionAt(sat, now + 11000)!;
    expect(points).toHaveLength(4);
    expect(points.at(-1)).toEqual([end.lat, end.lon]);
    expect(trackPoints(sat, now, now - 1)).toEqual([]);
    expect(trackPoints(sat, now, now + 10000, 0)).toEqual([]);
    expect(trackPoints(sat, now, Infinity)).toEqual([]);
    expect(trackPoints(sat, now, now + 86400000)).toHaveLength(2401);
  });
  it('normalizes cardinal directions and rejects invalid angles', () => {
    expect(cardinal(360)).toBe('N');
    expect(cardinal(-90)).toBe('W');
    expect(cardinal(NaN)).toBe('N/A');
    expect(cardinal(null)).toBe('N/A');
  });
});

describe('pass prediction regression', () => {
  it('retains the original app.js five-second pass search on a frozen historical fixture', () => {
    // Captured by running original computeNextPasses with these exact TLEs and observer.
    // Date objects in the original truncate fractional milliseconds; allow under 1 ms.
    const original = [
      [
        '2024-02-29T18:22:42.297Z',
        '2024-02-29T18:29:40.237Z',
        '2024-02-29T18:26:10Z',
        5.40037934846832,
      ],
      [
        '2024-02-29T19:56:56.268Z',
        '2024-02-29T20:07:00.760Z',
        '2024-02-29T20:02:00Z',
        22.564941949213367,
      ],
      [
        '2024-02-29T21:32:55.912Z',
        '2024-02-29T21:43:38.360Z',
        '2024-02-29T21:38:15Z',
        46.64807991376173,
      ],
    ] as const;
    const passes = predictPasses(fixture(), observer, now, 'upcoming3');
    for (const [index, [start, end, maxAt, elevation]] of original.entries()) {
      expect(Math.abs(passes[index].start - Date.parse(start))).toBeLessThan(1);
      expect(Math.abs(passes[index].end - Date.parse(end))).toBeLessThan(1);
      expect(passes[index].maxAt).toBe(Date.parse(maxAt));
      expect(passes[index].maxElevation).toBeCloseTo(elevation, 10);
    }
  });
  it('finds the next three/five passes with interpolated horizon and footprint boundaries', () => {
    const sat = fixture();
    const three = predictPasses(sat, observer, now, 'upcoming3');
    const five = predictPasses(sat, observer, now, 'upcoming5');
    expect(three).toHaveLength(3);
    expect(five).toHaveLength(5);
    expect(five.slice(0, 3)).toEqual(three);
    for (const pass of five) {
      expect(pass.start).toBeGreaterThanOrEqual(now);
      expect(pass.start).toBeLessThan(pass.maxAt);
      expect(pass.maxAt).toBeLessThan(pass.end);
      expect(pass.maxElevation).toBeGreaterThan(0);
      expect(pass.maxElevation).toBeLessThanOrEqual(90);
      expect(Math.abs(lookAngles(sat, pass.start, observer)!.elevation)).toBeLessThan(0.002);
      expect(Math.abs(lookAngles(sat, pass.end, observer)!.elevation)).toBeLessThan(0.002);
      expect(Math.abs(footprintDelta(sat, observer, pass.losStart))).toBeLessThan(0.02);
      expect(Math.abs(footprintDelta(sat, observer, pass.losEnd))).toBeLessThan(0.02);
      expect(pass.losStart).toBeLessThan(pass.maxAt);
      expect(pass.losEnd).toBeGreaterThan(pass.maxAt);
      expect(pass.riseAz).toBeGreaterThanOrEqual(0);
      expect(pass.setAz).toBeLessThan(360);
    }
  });
  it('includes an ongoing pass at the window start and uses local midnight for day ranges', () => {
    const sat = fixture();
    const first = predictPasses(sat, observer, now, 'upcoming3')[0];
    const ongoing = predictPasses(sat, observer, first.maxAt, 'upcoming3')[0];
    expect(ongoing.start).toBe(first.maxAt);
    expect(ongoing.end).toBeCloseTo(first.end, 0);
    expect(ongoing.losStart).toBeLessThan(ongoing.start);
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const day = predictPasses(sat, observer, now, '1');
    expect(day.length).toBeGreaterThan(0);
    expect(day).toEqual(predictPasses(sat, observer, midnight.getTime(), '1'));
    for (const pass of day) {
      expect(pass.start).toBeGreaterThanOrEqual(midnight.getTime());
      expect(pass.start).toBeLessThan(midnight.getTime() + 86400000);
      expect(pass.end).toBeLessThanOrEqual(midnight.getTime() + 86400000);
    }
  });
  it('returns no results for invalid time or unrecognized ranges', () => {
    expect(predictPasses(fixture(), observer, NaN, '1')).toEqual([]);
    expect(predictPasses(fixture(), observer, now, 3 as never)).toEqual([]);
  });
});

describe('watchlist pass prediction', () => {
  function secondFixture(): Satellite {
    const sat = fixture();
    sat.noradId = '43017';
    sat.id = 'NORAD-43017';
    sat.name = 'Second historical orbit fixture';
    sat.color = '#0f0';
    sat.satrec.mo += 1;
    return sat;
  }
  it('returns the global next three/five with stable identity and chronological order', () => {
    const first = fixture(),
      second = secondFixture();
    const expected = [first, second]
      .flatMap((sat) =>
        predictPasses(sat, observer, now, 'upcoming5').map((pass) => ({
          ...pass,
          noradId: sat.noradId,
          satelliteName: sat.name,
          color: sat.color,
        })),
      )
      .sort((a, b) => a.start - b.start || Number(a.noradId) - Number(b.noradId));
    const five = predictWatchlistPasses([second, first], observer, now, 'upcoming5');
    expect(five).toEqual(expected.slice(0, 5));
    expect(predictWatchlistPasses([first, second], observer, now, 'upcoming3')).toEqual(
      five.slice(0, 3),
    );
    expect(new Set(five.map((pass) => pass.noradId)).size).toBe(2);
  });
  it('uses rolling day windows and excludes finished passes', () => {
    const anchor = now + 8 * 3600000;
    for (const range of ['1', '2', '3'] as const) {
      const result = predictWatchlistPasses([fixture(), secondFixture()], observer, anchor, range);
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((pass) => pass.start > anchor + (Number(range) - 1) * 86400000)).toBe(
        true,
      );
      for (const pass of result) {
        expect(pass.start).toBeLessThan(anchor + Number(range) * 86400000);
        expect(pass.end).toBeGreaterThan(anchor);
      }
    }
  });
  it('recovers ongoing physical starts while preserving independent LOS boundaries', () => {
    const first = predictPasses(fixture(), observer, now, 'upcoming3')[0];
    const ongoing = predictWatchlistPasses([fixture()], observer, first.maxAt, '1')[0];
    expect(ongoing.start).toBeCloseTo(first.start, 0);
    expect(ongoing.end).toBeCloseTo(first.end, 0);
    expect(ongoing.maxAt).toBe(first.maxAt);
    expect(ongoing.maxElevation).toBeCloseTo(first.maxElevation, 10);
    expect(ongoing.losStart).toBeLessThan(ongoing.start);
    expect(ongoing.losEnd).toBeGreaterThan(ongoing.end);
    expect(ongoing).not.toHaveProperty('startClipped');
    expect(ongoing).not.toHaveProperty('endClipped');
  });
  it('finishes a historical pass whose rise falls nine seconds before the rolling window end', () => {
    const sat = fixture();
    const complete = predictPasses(sat, observer, now, 'upcoming3')[2];
    const windowEnd = complete.start + 9000;
    const result = predictWatchlistPasses([sat], observer, windowEnd - 3 * 3600000, '3h');
    const last = result.at(-1)!;
    expect(Math.abs(last.start - complete.start)).toBeLessThan(50);
    expect(Math.abs(last.end - complete.end)).toBeLessThan(50);
    expect(last.end - windowEnd).toBeGreaterThan(10 * 60000);
    expect(last.maxAt).toBeGreaterThan(windowEnd);
    expect(Math.abs(last.maxAt - complete.maxAt)).toBeLessThanOrEqual(5000);
    expect(last.maxElevation).toBeCloseTo(complete.maxElevation, 1);
    expect(Math.abs(lookAngles(sat, last.end, observer)!.elevation)).toBeLessThan(0.002);
    expect(Math.abs(footprintDelta(sat, observer, last.losEnd))).toBeLessThan(0.02);
    expect(last).not.toHaveProperty('endClipped');
  });
  it('deduplicates watchlist IDs and sorts simultaneous passes independently of input order', () => {
    const first = fixture();
    const sameOrbit = { ...fixture(), noradId: '999', name: 'Simultaneous fixture' };
    const result = predictWatchlistPasses([first, sameOrbit, first], observer, now, 'upcoming3');
    expect(result.map((pass) => pass.noradId)).toEqual(['999', '25544', '999']);
    expect(predictWatchlistPasses([sameOrbit, first], observer, now, 'upcoming3')).toEqual(result);
  });
  it('returns no results for empty watchlists, invalid time or unsupported ranges', () => {
    expect(predictWatchlistPasses([], observer, now, '1')).toEqual([]);
    expect(predictWatchlistPasses([fixture()], observer, NaN, '1')).toEqual([]);
    expect(predictWatchlistPasses([fixture()], observer, now, 3 as never)).toEqual([]);
  });
});
