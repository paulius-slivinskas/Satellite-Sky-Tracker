import { describe, expect, it } from 'vitest';
import {
  finderTrajectory,
  nextHorizonPreview,
  pointingInstruction,
  shortestTurn,
} from '../src/domain/finder';
import { vi } from 'vitest';
import type { Observer, Satellite } from '../src/domain/types';
vi.mock('../src/domain/orbits', () => ({
  lookAngles: (_sat: unknown, time: number) =>
    time < 0 ? null : { azimuth: 359, elevation: time / 1000 - 45 },
}));
const satellite = {} as Satellite;
const observer = {} as Observer;
describe('sky finder', () => {
  it('takes the shortest turn across north and chooses a deterministic half turn', () => {
    expect(shortestTurn(359, 1)).toBe(2);
    expect(shortestTurn(1, 359)).toBe(-2);
    expect(shortestTurn(0, 180)).toBe(-180);
    expect(pointingInstruction(-30)).toBe('Turn left 30°');
  });
  it('previews a real-time minute including the present', () => {
    expect(finderTrajectory(satellite, observer, 0).map((p) => p.seconds)).toEqual([
      0, 15, 30, 45, 60,
    ]);
    expect(finderTrajectory(satellite, observer, 0)[4].elevation).toBe(15);
  });
  it('refines an upcoming horizon crossing and handles unavailable propagation', () => {
    expect(nextHorizonPreview(satellite, observer, 0)?.at).toBeCloseTo(45000, 0);
    expect(nextHorizonPreview(satellite, observer, 60000)).toBeNull();
    expect(nextHorizonPreview(satellite, observer, -1000)).toBeNull();
  });
});
