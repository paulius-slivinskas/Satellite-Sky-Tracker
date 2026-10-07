import { expect, it } from 'vitest';
import { orientationCamera } from '../src/domain/deviceOrientation';
import {
  projectSky,
  skyCamera,
  skyGround,
  skyPath,
  skyGuide,
  skyViewport,
} from '../src/domain/skyProjection';
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

it('guides diagonally, handles targets behind the phone and follows screen roll', () => {
  const camera = skyCamera(0, 0);
  expect(skyGuide(camera, 90, 0).angle).toBeCloseTo(90);
  expect(skyGuide(camera, 0, 45).angle).toBeCloseTo(0);
  expect(skyGuide(camera, 45, 30).angle).toBeGreaterThan(0);
  expect(skyGuide(camera, 45, 30).angle).toBeLessThan(90);
  expect(skyGuide(camera, 180, 0).distance).toBeCloseTo(180);
  expect(Number.isFinite(skyGuide(camera, 180, 0).angle)).toBe(true);
  const rolled = {
    forward: camera.forward,
    right: camera.up,
    up: { x: -camera.right.x, y: -camera.right.y, z: -camera.right.z },
  };
  expect(skyGuide(rolled, 90, 0).angle).toBeCloseTo(180);
  expect(skyGuide(camera, 0, 0).distance).toBeCloseTo(0);
});

it('keeps iOS sky orientation continuous across the upright position', () => {
  const bearing = (beta: number, heading: number) => {
    const camera = orientationCamera({ alpha: 17, beta, gamma: 0, webkitCompassHeading: heading })!;
    return ((Math.atan2(camera.forward.x, camera.forward.y) * 180) / Math.PI + 360) % 360;
  };
  for (const beta of [89, 90, 91, 120]) expect(bearing(beta, 40)).toBeCloseTo(40);
  expect(bearing(120, 70)).toBeCloseTo(70);
});
it('moves a fixed satellite left when the phone turns right, on iOS and absolute sensors', () => {
  for (const ios of [false, true]) {
    const camera = (heading: number) =>
      orientationCamera({
        alpha: 360 - heading,
        beta: 110,
        gamma: 0,
        ...(ios ? { webkitCompassHeading: heading } : { absolute: true }),
      })!;
    expect(projectSky(camera(30), 30, 20).x).toBeCloseTo(200);
    expect(projectSky(camera(40), 30, 20).x).toBeLessThan(200);
    expect(projectSky(camera(20), 30, 20).x).toBeGreaterThan(200);
  }
});

it('fits portrait and landscape viewports with guidance orbiting the central reticle', () => {
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    const viewport = skyViewport(width, height);
    const target = projectSky(skyCamera(50, 20), 50, 20, viewport);
    expect(target.x).toBeCloseTo(width / 2);
    expect(target.y).toBeCloseTo(height / 2);
    const guide = skyGuide(skyCamera(0, 0), 60, 30, viewport);
    expect(Math.hypot(guide.x - width / 2, guide.y - height / 2)).toBeCloseTo(48);
  }
});

it('keeps the turn cue stable when sensor noise straddles directly behind the phone', () => {
  for (const azimuth of [179, 180, 181])
    expect(skyGuide(skyCamera(0, 0), azimuth, 0).angle).toBeCloseTo(90);
});
