import { beforeEach, describe, expect, it, vi } from 'vitest';
const mockPosition = vi.hoisted(() => vi.fn());
vi.mock('../src/domain/orbits', () => ({ positionAt: mockPosition }));
import { distanceAtTime, timedTrackSegments, trackChunkRange } from '../src/domain/timedTrack';
import type { Satellite } from '../src/domain/types';
const sat = {} as Satellite;
beforeEach(() => mockPosition.mockReset());
const at = (lat: number, lon: number) => ({ lat, lon, altKm: 400, elevation: null });

describe('fixed timed trajectory chunks', () => {
  it('keeps exact endpoints and the original grid, including a partial final interval', () => {
    mockPosition.mockImplementation((_sat: Satellite, time: number) => at(time / 100, 20));
    expect(timedTrackSegments(sat, 100, 1250, 500)[0].map((point) => point.time)).toEqual([
      100, 600, 1100, 1250,
    ]);
    expect(mockPosition.mock.calls.map((call) => call[1])).toEqual([100, 600, 1100, 1250]);
  });
  it.each([1, -1])(
    'interpolates matching seam coordinates/time without a cross-world segment (direction %s)',
    (direction) => {
      mockPosition.mockImplementation((_sat: Satellite, time: number) =>
        time === 0 ? at(10, direction * 179) : at(14, -direction * 179),
      );
      const segments = timedTrackSegments(sat, 0, 1000, 1000);
      expect(segments).toEqual([
        [
          { time: 0, lat: 10, lon: direction * 179 },
          { time: 500, lat: 12, lon: direction * 180 },
        ],
        [
          { time: 500, lat: 12, lon: -direction * 180 },
          { time: 1000, lat: 14, lon: -direction * 179 },
        ],
      ]);
      for (const segment of segments)
        expect(Math.abs(segment[1].lon - segment[0].lon)).toBeLessThan(180);
    },
  );
  it('preserves seam samples at exact boundaries without duplicate zero-time points', () => {
    mockPosition.mockImplementation((_sat: Satellite, time: number) =>
      at(10, time === 0 ? 179 : time === 1000 ? -180 : -179),
    );
    expect(timedTrackSegments(sat, 0, 2000, 1000)).toEqual([
      [
        { time: 0, lat: 10, lon: 179 },
        { time: 1000, lat: 10, lon: 180 },
      ],
      [
        { time: 1000, lat: 10, lon: -180 },
        { time: 2000, lat: 10, lon: -179 },
      ],
    ]);
  });
  it('splits invalid propagation and discards isolated samples instead of bridging gaps', () => {
    mockPosition.mockImplementation((_sat: Satellite, time: number) =>
      time === 2000 || time === 4000 ? null : at(10, time / 1000),
    );
    const segments = timedTrackSegments(sat, 0, 6000, 1000);
    expect(segments.map((segment) => segment.map((point) => point.time))).toEqual([
      [0, 1000],
      [5000, 6000],
    ]);
  });
  it('limits work to 128 intervals without silently changing the requested grid', () => {
    mockPosition.mockReturnValue(at(0, 0));
    expect(timedTrackSegments(sat, 0, 128000, 1000)[0]).toHaveLength(129);
    mockPosition.mockClear();
    for (const args of [
      [0, 129000, 1000],
      [1, 1, 1000],
      [2, 1, 1000],
      [0, 1, 0],
      [0, Infinity, 1],
      [NaN, 1, 1],
    ]) {
      expect(timedTrackSegments(sat, args[0], args[1], args[2])).toEqual([]);
    }
    expect(mockPosition).not.toHaveBeenCalled();
  });
});

describe('screen distance lookup', () => {
  it('interpolates nonuniform screen lengths and clamps times outside the path', () => {
    const times = [100, 200, 400, 800],
      cumulative = [0, 10, 50, 70];
    expect(distanceAtTime(times, cumulative, 150)).toBe(5);
    expect(distanceAtTime(times, cumulative, 300)).toBe(30);
    expect(distanceAtTime(times, cumulative, 600)).toBe(60);
    expect(distanceAtTime(times, cumulative, -Infinity)).toBe(0);
    expect(distanceAtTime(times, cumulative, Infinity)).toBe(70);
  });
  it('handles stationary path spans and rejects unusable arrays', () => {
    expect(distanceAtTime([0, 10, 20], [0, 0, 5], 5)).toBe(0);
    expect(distanceAtTime([10], [5], 20)).toBe(5);
    expect(distanceAtTime([], [], 0)).toBe(0);
    expect(distanceAtTime([0, 10], [0], 5)).toBe(0);
    expect(distanceAtTime([0, 10], [0, NaN], 5)).toBe(0);
    expect(distanceAtTime([0, 10], [0, 1], NaN)).toBe(0);
  });
});

describe('fixed chunk index ranges', () => {
  it('covers the nonempty interval with an exclusive end, including negative times', () => {
    expect(trackChunkRange(0, 3000, 1000)).toEqual([0, 1, 2]);
    expect(trackChunkRange(500, 3001, 1000)).toEqual([0, 1, 2, 3]);
    expect(trackChunkRange(-2500, -1000, 1000)).toEqual([-3, -2]);
    expect(trackChunkRange(-1, 1, 1000)).toEqual([-1, 0]);
    expect(trackChunkRange(1000, 1001, 1000)).toEqual([1]);
  });
  it('rejects reversed, empty, unbounded or impractically large ranges', () => {
    for (const args of [
      [0, 0, 1000],
      [10, 0, 1000],
      [0, 1, 0],
      [0, Infinity, 1000],
      [0, 1000000, 1],
      [0, 10, NaN],
    ]) {
      expect(trackChunkRange(args[0], args[1], args[2])).toEqual([]);
    }
  });
});

it('keeps fractional 128-interval chunks valid at epoch-sized anchors and excludes their exact end chunk', () => {
  mockPosition.mockReturnValue(at(0, 0));
  const step = 86164722.631 / 1200;
  const duration = step * 128;
  for (let index = 195000; index < 195020; index++) {
    const from = index * duration;
    const to = from + duration;
    const points = timedTrackSegments(sat, from, to, step)[0];
    expect(points).toHaveLength(129);
    expect(points[0].time).toBe(from);
    expect(points.at(-1)!.time).toBe(to);
    expect(trackChunkRange(from, to, duration)).toEqual([index]);
  }
});
