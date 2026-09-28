import { describe, expect, it } from 'vitest';
import { nextPassApproaches } from '../src/domain/passApproaches';
import type { SatellitePass } from '../src/domain/types';

const now = 10_000;
function pass(noradId: string, losStart: number, losEnd: number): SatellitePass {
  return {
    noradId,
    satelliteName: `Satellite ${noradId}`,
    color: '#22c55e',
    start: losStart + 100,
    end: losEnd - 100,
    maxAt: (losStart + losEnd) / 2,
    maxElevation: 25,
    losStart,
    losEnd,
    riseAz: null,
    setAz: null,
    maxAz: null,
  };
}

// Compare identities without prescribing presentation order across different satellites.
const ids = (result: ReturnType<typeof nextPassApproaches>) =>
  result.map(({ pass: item }) => item.noradId).sort();

describe('next LOS approach per satellite', () => {
  it('chooses only the nearest future LOS start for each NORAD, retaining original indices', () => {
    const laterIss = pass('25544', 30_000, 35_000);
    const nextAmateur = pass('43017', 15_000, 20_000);
    const nextIss = pass('25544', 12_000, 14_000);
    const laterAmateur = pass('43017', 25_000, 29_000);
    const input = [laterIss, nextAmateur, laterAmateur, nextIss];
    const result = nextPassApproaches(input, now);
    expect(result).toHaveLength(2);
    expect(ids(result)).toEqual(['25544', '43017']);
    expect(result.find((item) => item.pass.noradId === '25544')).toEqual({
      pass: nextIss,
      index: 3,
    });
    expect(result.find((item) => item.pass.noradId === '43017')).toEqual({
      pass: nextAmateur,
      index: 1,
    });
    expect(result.find((item) => item.pass.noradId === '25544')!.pass).toBe(nextIss);
    expect(result.some((item) => item.pass === laterIss || item.pass === laterAmateur)).toBe(false);
  });

  it('uses LOS ordering rather than elevation-pass ordering', () => {
    const earlyLos = { ...pass('25544', 12_000, 24_000), start: 18_000, maxAt: 20_000 };
    const earlyElevation = pass('25544', 15_000, 17_000);
    expect(nextPassApproaches([earlyElevation, earlyLos], now)).toEqual([
      { pass: earlyLos, index: 1 },
    ]);
  });

  it('is independent of input order while preserving the index in each supplied list', () => {
    const first = pass('25544', 12_000, 14_000);
    const later = pass('25544', 25_000, 29_000);
    const other = pass('43017', 15_000, 20_000);
    for (const input of [
      [later, other, first],
      [first, later, other],
      [other, first, later],
    ]) {
      const result = nextPassApproaches(input, now);
      expect(result).toHaveLength(2);
      for (const chosen of [first, other]) {
        const found = result.find((item) => item.pass.noradId === chosen.noradId)!;
        expect(found.pass).toBe(chosen);
        expect(found.index).toBe(input.indexOf(chosen));
      }
    }
  });

  it('suppresses a satellite with any ongoing LOS pass even when its future pass appears first', () => {
    const future = pass('25544', 15_000, 20_000);
    const ongoing = pass('25544', 9_000, 12_000);
    const other = pass('43017', 13_000, 17_000);
    const input = [future, other, ongoing];
    expect(nextPassApproaches(input, now)).toEqual([{ pass: other, index: 1 }]);
  });

  it('stops at the exact LOS start and promotes the next pass at the exact LOS end', () => {
    const first = pass('25544', 12_000, 14_000);
    const next = pass('25544', 20_000, 24_000);
    const input = [first, next];
    expect(nextPassApproaches(input, first.losStart - 1)).toEqual([{ pass: first, index: 0 }]);
    expect(nextPassApproaches(input, first.losStart)).toEqual([]);
    expect(nextPassApproaches(input, first.losEnd - 1)).toEqual([]);
    expect(nextPassApproaches(input, first.losEnd)).toEqual([{ pass: next, index: 1 }]);
    expect(nextPassApproaches(input, next.losStart)).toEqual([]);
    expect(nextPassApproaches(input, next.losEnd)).toEqual([]);
  });

  it('keeps the approach hidden until LOS ends even after the elevation pass has ended', () => {
    const ongoingLos = { ...pass('25544', 8_000, 12_000), end: 9_500, maxAt: 9_000 };
    const next = pass('25544', 15_000, 20_000);
    expect(nextPassApproaches([ongoingLos, next], now)).toEqual([]);
  });

  it('recomputes correctly when simulation time moves backwards', () => {
    const first = pass('25544', 12_000, 14_000);
    const next = pass('25544', 20_000, 24_000);
    const input = [next, first];
    expect(nextPassApproaches(input, 15_000)).toEqual([{ pass: next, index: 0 }]);
    expect(nextPassApproaches(input, 21_000)).toEqual([]);
    expect(nextPassApproaches(input, 13_000)).toEqual([]);
    expect(nextPassApproaches(input, now)).toEqual([{ pass: first, index: 1 }]);
  });

  it('does not mutate, sort, or clone the original pass objects', () => {
    const later = Object.freeze(pass('25544', 20_000, 24_000));
    const first = Object.freeze(pass('25544', 12_000, 14_000));
    const input = Object.freeze([later, first]) as unknown as SatellitePass[];
    const snapshot = JSON.stringify(input);
    const result = nextPassApproaches(input, now);
    expect(result).toEqual([{ pass: first, index: 1 }]);
    expect(result[0].pass).toBe(first);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('ignores fully past passes and handles an empty list', () => {
    expect(nextPassApproaches([], now)).toEqual([]);
    expect(nextPassApproaches([pass('25544', 1_000, 5_000)], now)).toEqual([]);
  });

  it.each([NaN, Infinity, -Infinity])(
    'returns no approaches for invalid simulation time %s',
    (time) => {
      expect(nextPassApproaches([pass('25544', 12_000, 14_000)], time)).toEqual([]);
    },
  );

  it.each([
    { losStart: NaN },
    { losStart: Infinity },
    { losEnd: NaN },
    { losEnd: Infinity },
    { losStart: 14_000, losEnd: 12_000 },
    { losStart: 12_000, losEnd: 12_000 },
    { start: NaN },
    { end: Infinity },
    { start: 14_000, end: 12_000 },
    { noradId: '' },
  ])('ignores an invalid pass without hiding another valid candidate: %j', (patch) => {
    const invalid = { ...pass('25544', 11_000, 14_000), ...patch };
    const valid = pass('25544', 15_000, 20_000);
    expect(nextPassApproaches([invalid, valid], now)).toEqual([{ pass: valid, index: 1 }]);
  });

  it('does not let an invalid ongoing window suppress a valid future pass', () => {
    const invalid = { ...pass('25544', 9_000, 12_000), end: NaN };
    const future = pass('25544', 15_000, 20_000);
    expect(nextPassApproaches([invalid, future], now)).toEqual([{ pass: future, index: 1 }]);
  });
});
