import { expect, it } from 'vitest';
import { orientationCamera } from '../src/domain/deviceOrientation';
import { projectSky, skyCamera, skyGround, skyPath } from '../src/domain/skyProjection';
it('places the rear viewing direction in the center for upright and tilted phones', () => {
  for (const [alpha, beta, azimuth, elevation] of [
    [0, 90, 0, 0],
    [270, 120, 90, 30],
    [180, 135, 180, 45],
  ]) {
    const camera = orientationCamera({ alpha, beta, gamma: 0, absolute: true })!;
    const target = projectSky(camera, azimuth, elevation);
    expect(target.visible).toBe(true);
    expect(target.x).toBeCloseTo(200);
    expect(target.y).toBeCloseTo(230);
  }
});
it('moves the horizon lower when looking up and excludes targets behind the observer', () => {
  expect(projectSky(skyCamera(0, 30), 0, 0).y).toBeGreaterThan(230);
  expect(projectSky(skyCamera(0, 0), 180, 0).visible).toBe(false);
  expect(skyGround(skyCamera(0, 0))).toContain('230');
  expect(
    skyPath(skyCamera(0, 0), [
      { azimuth: 0, elevation: 0 },
      null,
      { azimuth: 5, elevation: 10 },
    ]).match(/M/g),
  ).toHaveLength(2);
});
it('preserves viewing direction under screen rotation and rejects relative yaw', () => {
  const reading = { alpha: 270, beta: 120, gamma: 0, absolute: true };
  expect(orientationCamera(reading, 90)!.forward).toEqual(orientationCamera(reading, 0)!.forward);
  expect(orientationCamera({ ...reading, absolute: false })).toBeNull();
});
