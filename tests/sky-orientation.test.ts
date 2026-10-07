import { expect, it } from 'vitest';
import { SkyOrientationTracker } from '../src/domain/skyOrientation';
import {
  orientationCamera,
  relativeOrientationCamera,
  type OrientationReading,
} from '../src/domain/deviceOrientation';
import { projectSky, type SkyCamera } from '../src/domain/skyProjection';

const ios: OrientationReading = {
  alpha: 30,
  beta: 0,
  gamma: 0,
  absolute: false,
  webkitCompassHeading: 350,
  webkitCompassAccuracy: 5,
};
const closeCamera = (actual: SkyCamera, expected: SkyCamera) => {
  for (const axis of ['right', 'up', 'forward'] as const)
    for (const coordinate of ['x', 'y', 'z'] as const)
      expect(actual[axis][coordinate]).toBeCloseTo(expected[axis][coordinate], 8);
};
function align(reading = ios, screenAngle = 0) {
  const tracker = new SkyOrientationTracker();
  for (let time = 0; time <= 640; time += 16) tracker.read(reading, screenAngle, time);
  expect(tracker.calibration).toBeNull();
  return tracker;
}
it('tracks upright movement immediately while waiting for a stable north reference', () => {
  const tracker = new SkyOrientationTracker();
  const upright = { ...ios, beta: 90 };
  closeCamera(tracker.read(upright, 0, 0)!, relativeOrientationCamera(upright)!);
  expect(tracker.calibration).toBe('hold-flat');
  const turned = { ...upright, alpha: 10, beta: 120 };
  closeCamera(tracker.read(turned, 0, 8)!, relativeOrientationCamera(turned)!);
  expect(tracker.read(ios, 0, 16)).not.toBeNull();
  expect(tracker.calibration).toBe('hold-still');
  for (let time = 32; time < 616; time += 16) {
    expect(tracker.read(ios, 0, time)).not.toBeNull();
    expect(tracker.calibration).toBe('hold-still');
  }
  expect(tracker.read(ios, 0, 624)).not.toBeNull();
  const raised = tracker.read({ ...ios, beta: 110 }, 0, 640)!;
  expect(projectSky(raised, 350, 20).x).toBeCloseTo(200);
  expect(projectSky(raised, 350, 20).y).toBeCloseTo(230);
});
it('does not pan a stationary sky for sustained compass swings or bad magnetic readings', () => {
  const tracker = align();
  const still = tracker.read({ ...ios, beta: 110 }, 0, 656)!;
  for (let time = 672; time < 12000; time += 16) {
    const camera = tracker.read(
      {
        ...ios,
        beta: 110,
        webkitCompassHeading: (350 + 25 * Math.sin(time / 800) + 360) % 360,
        webkitCompassAccuracy: time > 6000 ? -1 : 10,
      },
      0,
      time,
    )!;
    closeCamera(camera, still);
  }
  for (const webkitCompassHeading of [undefined, NaN, -1]) {
    closeCamera(tracker.read({ ...ios, beta: 110, webkitCompassHeading }, 0, 12016)!, still);
  }
});
it('follows actual turns and roll even when the compass heading arrives late', () => {
  const tracker = align();
  // Turning right decreases intrinsic alpha. The independently sampled compass
  // still has the old heading, but must not hold back or reverse the camera.
  for (const degrees of [0, 1, 10, 60]) {
    const camera = tracker.read({ ...ios, alpha: 30 - degrees, beta: 110 }, 0, 700 + degrees)!;
    expect(projectSky(camera, (350 + degrees) % 360, 20).x).toBeCloseTo(200);
    if (degrees > 0) expect(projectSky(camera, 350, 20).x).toBeLessThan(200);
  }
});
it('preserves equivalent Euler representations at the upright singularity', () => {
  const tracker = align();
  const first = tracker.read({ ...ios, alpha: 30, beta: 90, gamma: 20 }, 0, 700)!;
  // At beta=90, alpha and gamma trade off without any physical rotation.
  const equivalent = tracker.read({ ...ios, alpha: 50, beta: 90, gamma: 0 }, 0, 716)!;
  closeCamera(equivalent, first);
});
it('calibrates the physical device top independently of screen rotation', () => {
  const portrait = align();
  const landscape = align(ios, 90);
  const reading = { ...ios, beta: 120, gamma: 25 };
  closeCamera(landscape.read(reading, 0, 700)!, portrait.read(reading, 0, 700)!);
  const normal = portrait.read(reading, 0, 716)!;
  const rotated = landscape.read(reading, 90, 716)!;
  expect(rotated.forward).toEqual(normal.forward);
  for (const axis of ['x', 'y', 'z'] as const)
    expect(rotated.right[axis]).toBeCloseTo(normal.up[axis]);
});
it('averages calibration across the north seam and rejects unstable or inaccurate heading', () => {
  const tracker = new SkyOrientationTracker();
  for (let time = 0; time < 2000; time += 16) {
    expect(
      tracker.read({ ...ios, webkitCompassHeading: time % 32 ? 330 : 10 }, 0, time),
    ).not.toBeNull();
    expect(tracker.calibration).toBe('hold-still');
  }
  for (const accuracy of [-1, NaN, 50]) {
    const reading = { ...ios, beta: 110, webkitCompassAccuracy: accuracy };
    closeCamera(tracker.read(reading, 0, 2016)!, relativeOrientationCamera(reading)!);
    expect(tracker.calibration).toBe('poor-accuracy');
  }
  for (let time = 2032; time <= 2800; time += 16) {
    tracker.read({ ...ios, alpha: 180, webkitCompassHeading: time % 32 ? 359.5 : 0.5 }, 0, time);
  }
  const camera = tracker.read({ ...ios, alpha: 180, beta: 110 }, 0, 2816)!;
  expect(Math.abs((Math.atan2(camera.forward.x, camera.forward.y) * 180) / Math.PI)).toBeLessThan(
    0.1,
  );
});
it('keeps absolute devices working immediately and never fabricates missing relative attitude', () => {
  const tracker = new SkyOrientationTracker();
  const absolute = { alpha: 270, beta: 110, gamma: 20, absolute: true };
  closeCamera(tracker.read(absolute, 90, 0)!, orientationCamera(absolute, 90)!);
  expect(tracker.read({ ...ios, alpha: null }, 0, 16)).toBeNull();
  expect(tracker.read({ ...ios, beta: NaN }, 0, 32)).toBeNull();
  const invalidHeading = new SkyOrientationTracker();
  expect(invalidHeading.read({ ...ios, webkitCompassHeading: -1 }, 0, 0)).not.toBeNull();
  expect(invalidHeading.calibration).toBe('poor-accuracy');
});
it('keeps motion alive while the compass temporarily omits its heading before alignment', () => {
  const tracker = new SkyOrientationTracker();
  tracker.read({ ...ios, beta: 110 }, 0, 0);
  const reading = { alpha: 10, beta: 120, gamma: 15, absolute: false };
  closeCamera(tracker.read(reading, 90, 16)!, relativeOrientationCamera(reading, 90)!);
  expect(tracker.calibration).toBe('poor-accuracy');
});
