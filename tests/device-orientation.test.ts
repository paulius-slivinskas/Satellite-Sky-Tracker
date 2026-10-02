import { describe, expect, it } from 'vitest';
import { normalizeHeading, orientationAngles } from '../src/domain/deviceOrientation';
const reading = { alpha: 90, beta: 0, gamma: 0 };
describe('north-referenced phone orientation', () => {
  it('never presents relative yaw as north', () => {
    expect(orientationAngles(reading).heading).toBeNull();
  });
  it('converts absolute alpha and compensates screen rotation', () => {
    expect(orientationAngles({ ...reading, absolute: true }).heading).toBeCloseTo(270);
    expect(orientationAngles({ ...reading, alpha: 0, absolute: true }, 90).heading).toBeCloseTo(
      270,
    );
  });
  it('uses iOS compass and rejects invalid compass calibration', () => {
    expect(orientationAngles({ ...reading, webkitCompassHeading: 350 }, 90).heading).toBe(260);
    expect(
      orientationAngles({ ...reading, webkitCompassHeading: 45, webkitCompassAccuracy: -1 })
        .heading,
    ).toBeNull();
  });
  it('does not assign heading to a vertical screen top', () => {
    expect(orientationAngles({ ...reading, beta: 90, absolute: true }).heading).toBeNull();
  });
  it('reports rear camera tilt and normalizes negative angles', () => {
    expect(orientationAngles(reading).elevation).toBeCloseTo(-90);
    expect(orientationAngles({ ...reading, beta: 90 }).elevation).toBeCloseTo(0);
    expect(normalizeHeading(-10)).toBe(350);
  });
});
