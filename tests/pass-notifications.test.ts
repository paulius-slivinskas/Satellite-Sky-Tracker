import { describe, expect, it } from 'vitest';
import {
  PassStartDetector,
  PassPeakDetector,
  notificationPasses,
} from '../src/domain/passNotifications';
import type { Satellite, SatellitePass } from '../src/domain/types';

const satellite = (noradId = '25544') => ({ noradId, name: noradId }) as Satellite;
const sample = (elevation: number | null, noradId = '25544') => ({
  satellite: satellite(noradId),
  elevation,
});

describe('real-time pass notifications', () => {
  it('alerts once when rising through the horizon, not at initial load or while already above it', () => {
    const detector = new PassStartDetector();
    expect(detector.sample([sample(-1)], 0)).toEqual([]);
    expect(detector.sample([sample(0)], 1000)).toHaveLength(1);
    expect(detector.sample([sample(10)], 2000)).toEqual([]);
    expect(detector.sample([sample(-0.01)], 3000)).toEqual([]);
    expect(detector.sample([sample(0.01)], 4000)).toEqual([]);
    expect(new PassStartDetector().sample([sample(10)], 0)).toEqual([]);
  });

  it('rearms for the next pass and groups simultaneous starts', () => {
    const detector = new PassStartDetector();
    detector.sample([sample(-1), sample(-2, '43017')], 0);
    expect(detector.sample([sample(1), sample(2, '43017')], 1000)).toHaveLength(2);
    detector.sample([sample(-1)], 90 * 60000);
    expect(detector.sample([sample(0)], 90 * 60000 + 1000)).toHaveLength(1);
  });

  it('does not send stale alerts after sleep, backwards clock changes, or invalid orbital data', () => {
    const detector = new PassStartDetector();
    detector.sample([sample(-1)], 0);
    expect(detector.sample([sample(10)], 5 * 60000)).toEqual([]);
    detector.sample([sample(-1)], 6 * 60000);
    expect(detector.sample([sample(10)], 1000)).toEqual([]);
    detector.sample([sample(null)], 2000);
    expect(detector.sample([sample(10)], 3000)).toEqual([]);
  });

  it('forgets removed satellites and initializes newly selected satellites without a false start', () => {
    const detector = new PassStartDetector();
    detector.sample([sample(-1)], 0);
    detector.sample([], 1000);
    expect(detector.sample([sample(10)], 2000)).toEqual([]);
  });
});

const pass = (overrides: Partial<SatellitePass> = {}): SatellitePass => ({
  noradId: '25544',
  satelliteName: 'ISS',
  color: '#fff',
  start: 0,
  end: 600000,
  maxAt: 300000,
  maxElevation: 42,
  losStart: 0,
  losEnd: 600000,
  riseAz: 0,
  setAz: 180,
  maxAz: 90,
  ...overrides,
});

describe('pass peak notifications', () => {
  it('fires at the marked maximum even when monitoring begins mid-pass, once per pass', () => {
    const detector = new PassPeakDetector();
    const current = pass();
    expect(detector.sample([current], 299000)).toEqual([]);
    expect(detector.sample([current], 300000)).toEqual([current]);
    expect(detector.sample([current], 301000)).toEqual([]);
    // Recalculated predictions can shift the maximum by a few seconds.
    expect(detector.sample([pass({ maxAt: 305000 })], 305000)).toEqual([]);
  });

  it('does not catch up on past peaks or peaks crossed while asleep or rewinding', () => {
    const detector = new PassPeakDetector();
    expect(detector.sample([pass()], 300000)).toEqual([]);
    expect(detector.sample([pass()], 301000)).toEqual([]);
    detector.sample([pass()], 100000);
    expect(detector.sample([pass()], 301000)).toEqual([]);
    expect(detector.sample([pass()], 300000)).toEqual([]);
  });

  it('ignores clipped or invalid maxima and completed passes', () => {
    for (const current of [
      pass({ startClipped: true }),
      pass({ endClipped: true }),
      pass({ maxAt: NaN }),
      pass({ end: 300000 }),
    ]) {
      const detector = new PassPeakDetector();
      detector.sample([current], 299000);
      expect(detector.sample([current], 300000)).toEqual([]);
    }
  });

  it('groups simultaneous peaks and rearms on the next orbit', () => {
    const detector = new PassPeakDetector();
    const current = [pass(), pass({ noradId: '43017' })];
    detector.sample(current, 299000);
    expect(detector.sample(current, 300000)).toEqual(current);
    const next = pass({ start: 5400000, maxAt: 5700000, end: 6000000 });
    detector.sample([next], 5699000);
    expect(detector.sample([next], 5700000)).toEqual([next]);
  });

  it('uses the exact displayed maximum for matching passes, retaining live coverage elsewhere', () => {
    const live = pass();
    const displayed = pass({ start: 1000, end: 601000, maxAt: 301000 });
    const other = pass({ noradId: '43017' });
    expect(notificationPasses([live, other], [displayed])).toEqual([displayed, other]);
    expect(notificationPasses([live], [pass({ startClipped: true }), other])).toEqual([live]);
    expect(notificationPasses([live], [pass({ start: 5400000, end: 6000000 })])).toEqual([live]);
  });
});
