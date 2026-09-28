import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Satellite } from '../src/domain/types';
vi.mock('../src/domain/orbits', () => ({ lookAngles: vi.fn(), footprintDelta: vi.fn() }));
import { lookAngles, footprintDelta } from '../src/domain/orbits';
import { predictPasses, predictWatchlistPasses } from '../src/domain/passes';
const sat = {} as Satellite;
const observer = { lat: 0, lon: 0, alt: 0, name: '' };
const start = new Date(2024, 1, 29).getTime();
const end = start + 86400000;
beforeEach(() => {
  vi.mocked(lookAngles).mockReset();
  // Unknown footprint deliberately falls back to the elevation boundary.
  vi.mocked(footprintDelta).mockReturnValue(NaN);
});
describe('pass threshold and failure boundaries', () => {
  it.each([
    ['3h', 3],
    ['5h', 5],
    ['12h', 12],
  ] as const)(
    'uses a rolling %s window and excludes events starting at its end',
    (range, hours) => {
      const from = start + 18 * 3600000;
      const until = from + hours * 3600000;
      const satellite = { ...sat, noradId: '25544', name: 'ISS', color: '#f00' };
      vi.mocked(lookAngles).mockReturnValue({ elevation: 25, azimuth: 180 });
      expect(predictPasses(satellite, observer, from, range)[0]).toMatchObject({
        start: from,
        end: until,
      });
      expect(predictWatchlistPasses([satellite], observer, from, range)[0]).toMatchObject({
        startClipped: true,
        endClipped: true,
      });
      vi.mocked(lookAngles).mockImplementation((_sat, time) => ({
        elevation: time >= until ? 0 : -1,
        azimuth: 0,
      }));
      expect(predictWatchlistPasses([satellite], observer, from, range)).toEqual([]);
    },
  );
  it('interpolates horizon crossings between samples and retains a boundary exactly at zero', () => {
    vi.mocked(lookAngles).mockImplementation((_sat, time) => ({
      elevation: 1 - Math.abs((time - start - 15000) / 10000),
      azimuth: 0,
    }));
    const passes = predictPasses(sat, observer, start, '1');
    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({
      start: start + 5000,
      end: start + 25000,
      maxAt: start + 15000,
      maxElevation: 1,
    });
  });
  it('does not include a pass that starts exactly at the exclusive day-range end', () => {
    vi.mocked(lookAngles).mockImplementation((_sat, time) => ({
      elevation: time >= end ? 0 : -1,
      azimuth: 0,
    }));
    expect(predictPasses(sat, observer, start, '1')).toEqual([]);
  });
  it('clips an ongoing pass at the end of the requested window', () => {
    vi.mocked(lookAngles).mockReturnValue({ elevation: 25, azimuth: 180 });
    expect(predictPasses(sat, observer, start, '1')).toEqual([
      {
        start,
        end,
        maxAt: start,
        maxElevation: 25,
        losStart: start,
        losEnd: end,
        riseAz: 180,
        setAz: 180,
        maxAz: 180,
      },
    ]);
  });
  it('does not bridge a propagation failure into a fabricated continuous pass', () => {
    vi.mocked(lookAngles).mockImplementation((_sat, time) =>
      time === start + 10000 ? null : { elevation: time < start + 20000 ? 1 : -1, azimuth: 0 },
    );
    const passes = predictPasses(sat, observer, start, '1');
    expect(passes).toHaveLength(1);
    expect(passes[0].start).toBe(start + 15000);
    expect(passes[0].end).toBe(start + 17500);
  });
  it('returns no passes when propagation fails for every sample', () => {
    vi.mocked(lookAngles).mockReturnValue(null);
    expect(predictPasses(sat, observer, start, '1')).toEqual([]);
  });
});

describe('watchlist physical pass edges', () => {
  const satellite = { ...sat, noradId: '25544', name: 'ISS', color: '#f00' };
  const windowEnd = start + 3 * 3600000;

  function triangularPass(rise: number, peak: number, set: number, elevation = 60) {
    return (time: number) =>
      time <= peak
        ? (elevation * (time - rise)) / (peak - rise)
        : (elevation * (set - time)) / (set - peak);
  }

  it('completes a pass rising nine seconds before the window ends, including its later peak', () => {
    const rise = windowEnd - 9000;
    const peak = windowEnd + 330000;
    const set = windowEnd + 660000;
    const elevation = triangularPass(rise, peak, set);
    // A later event outside the original range must not be appended by the edge search.
    const later = triangularPass(windowEnd + 1800000, windowEnd + 2100000, windowEnd + 2400000);
    vi.mocked(lookAngles).mockImplementation((_sat, time) => ({
      elevation: Math.max(elevation(time), later(time)),
      azimuth: time >= peak ? 240 : 120,
    }));
    const passes = predictWatchlistPasses([satellite], observer, start, '3h');
    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({
      start: rise,
      end: set,
      maxAt: peak,
      maxElevation: 60,
      losStart: rise,
      losEnd: set,
      riseAz: 120,
      setAz: 240,
    });
    expect(passes[0]).not.toHaveProperty('startClipped');
    expect(passes[0]).not.toHaveProperty('endClipped');
    expect(passes[0].end - passes[0].start).toBe(669000);
    // The legacy API deliberately retains the requested window boundary.
    expect(predictPasses(satellite, observer, start, '3h')[0].end).toBe(windowEnd);
  });

  it('does not discover an additional pass whose rise is exactly at the exclusive range end', () => {
    const elevation = triangularPass(windowEnd, windowEnd + 300000, windowEnd + 600000);
    vi.mocked(lookAngles).mockImplementation((_sat, time) => ({
      elevation: elevation(time),
      azimuth: 0,
    }));
    expect(predictWatchlistPasses([satellite], observer, start, '3h')).toEqual([]);
  });

  it('recovers the full rise and an earlier peak for a pass already setting at the anchor', () => {
    const rise = start - 600000;
    const peak = start - 300000;
    const set = start + 60000;
    const elevation = triangularPass(rise, peak, set, 75);
    vi.mocked(lookAngles).mockImplementation((_sat, time) => ({
      elevation: elevation(time),
      azimuth: 180,
    }));
    const [pass] = predictWatchlistPasses([satellite], observer, start, '3h');
    expect(pass).toMatchObject({ start: rise, end: set, maxAt: peak, maxElevation: 75 });
    expect(pass).not.toHaveProperty('startClipped');
    expect(pass).not.toHaveProperty('endClipped');
  });

  it.each(['start', 'end'] as const)(
    'retains the unresolved %s flag when propagation fails outside the window',
    (edge) => {
      const rise = edge === 'start' ? start - 300000 : windowEnd - 9000;
      const peak = edge === 'start' ? start - 60000 : windowEnd + 300000;
      const set = edge === 'start' ? start + 300000 : windowEnd + 600000;
      const elevation = triangularPass(rise, peak, set);
      vi.mocked(lookAngles).mockImplementation((_sat, time) => {
        if (edge === 'start' ? time < start : time > windowEnd) return null;
        return { elevation: elevation(time), azimuth: 180 };
      });
      const passes = predictWatchlistPasses([satellite], observer, start, '3h');
      expect(passes).toHaveLength(1);
      expect(passes[0]).toHaveProperty(`${edge}Clipped`, true);
      expect(passes[0][edge]).toBe(edge === 'start' ? start : windowEnd);
      expect(passes[0]).not.toHaveProperty(edge === 'start' ? 'endClipped' : 'startClipped');
    },
  );

  it('bounds continuously visible searches without inventing physical crossings', () => {
    vi.mocked(lookAngles).mockReturnValue({ elevation: 25, azimuth: 180 });
    const passes = predictWatchlistPasses([satellite], observer, start, '3h');
    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({ startClipped: true, endClipped: true, maxElevation: 25 });
    const probes = vi.mocked(lookAngles).mock.calls.map(([, time]) => time);
    // Missing satrec uses the documented two-hour fallback in each direction.
    expect(Math.min(...probes)).toBeGreaterThanOrEqual(start - 2 * 3600000);
    expect(Math.max(...probes)).toBeLessThanOrEqual(windowEnd + 2 * 3600000);
    expect(probes.some((time) => time < start)).toBe(true);
    expect(probes.some((time) => time > windowEnd)).toBe(true);
    expect(probes.length).toBeLessThan(6000);
  });

  it.each([
    [10, 30],
    [95, 95],
    [48 * 60, 24 * 60],
  ])(
    'bounds an orbit of %i minutes to a %i-minute edge search',
    (periodMinutes, extensionMinutes) => {
      const orbit = {
        ...satellite,
        satrec: { no: (2 * Math.PI) / periodMinutes },
      } as Satellite;
      vi.mocked(lookAngles).mockReturnValue({ elevation: 25, azimuth: 180 });
      const [pass] = predictWatchlistPasses([orbit], observer, start, '3h');
      const extension = extensionMinutes * 60000;
      expect(pass).toMatchObject({ startClipped: true, endClipped: true });
      // Five-second samples stop inside the bound; floating-point mean motion
      // may place a nominal period fractionally before the final sample.
      expect(pass.start).toBeGreaterThanOrEqual(start - extension);
      expect(pass.start).toBeLessThanOrEqual(start - extension + 5000);
      expect(pass.end).toBeLessThanOrEqual(windowEnd + extension);
      expect(pass.end).toBeGreaterThanOrEqual(windowEnd + extension - 5000);
      const probes = vi.mocked(lookAngles).mock.calls.map(([, time]) => time);
      expect(Math.min(...probes)).toBe(pass.start);
      expect(Math.max(...probes)).toBe(pass.end);
    },
  );
});
