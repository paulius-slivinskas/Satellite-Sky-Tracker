import { expect, it } from 'vitest';
import { CameraStabilizer } from '../src/domain/cameraStabilizer';
import { orientationCamera } from '../src/domain/deviceOrientation';
import { skyCamera, type SkyCamera } from '../src/domain/skyProjection';
const heading = (camera: SkyCamera) =>
  (Math.atan2(camera.forward.x, camera.forward.y) * 180) / Math.PI;
const expectCamera = (actual: SkyCamera, expected: SkyCamera) => {
  for (const axis of ['right', 'up', 'forward'] as const)
    for (const coordinate of ['x', 'y', 'z'] as const)
      expect(actual[axis][coordinate]).toBeCloseTo(expected[axis][coordinate], 8);
};
it('preserves the full camera including roll and portrait/landscape rotation', () => {
  for (const alpha of [0, 90, 180, 270])
    for (const beta of [0, 89, 91, 179])
      for (const angle of [0, 90, 180, 270]) {
        const original = orientationCamera({ alpha, beta, gamma: 40, absolute: true }, angle)!;
        const filter = new CameraStabilizer();
        filter.ingest(original, 0);
        expectCamera(filter.advance(0)!, original);
      }
});
it('damps stationary sensor noise without crossing the north seam the long way', () => {
  const filter = new CameraStabilizer();
  filter.ingest(skyCamera(359, 20), 0);
  filter.ingest(skyCamera(1, 20), 16);
  expect(Math.abs(heading(filter.advance(16)!))).toBeLessThan(1);
  let maxNoise = 0;
  for (let i = 2; i < 100; i++) {
    filter.ingest(skyCamera(i % 2 ? 358 : 2, 20), i * 16);
    const angle = heading(filter.advance(i * 16)!);
    if (i > 20) maxNoise = Math.max(maxNoise, Math.abs(angle));
  }
  expect(maxNoise).toBeLessThan(0.5);
});
it('rejects an isolated compass spike but follows a sustained fast turn', () => {
  const filter = new CameraStabilizer();
  filter.ingest(skyCamera(0, 20), 0);
  expect(filter.ingest(skyCamera(170, 20), 16)).toBe(false);
  expect(heading(filter.advance(16)!)).toBeCloseTo(0);
  filter.ingest(skyCamera(0, 20), 32);
  expect(filter.ingest(skyCamera(90, 20), 48)).toBe(false);
  expect(filter.ingest(skyCamera(90, 20), 160)).toBe(true);
  for (let time = 160; time < 1000; time += 16) filter.advance(time);
  expect(heading(filter.advance(1000)!)).toBeCloseTo(90, 0);
});
it('keeps an orthonormal camera during mixed yaw pitch and roll motion', () => {
  const filter = new CameraStabilizer();
  filter.ingest(skyCamera(0, 0), 0);
  const next = orientationCamera({ alpha: 210, beta: 155, gamma: 55, absolute: true }, 90)!;
  filter.ingest(next, 500);
  const view = filter.advance(516)!;
  for (const axis of [view.right, view.up, view.forward])
    expect(Math.hypot(axis.x, axis.y, axis.z)).toBeCloseTo(1, 10);
  expect(
    view.right.x * view.up.x + view.right.y * view.up.y + view.right.z * view.up.z,
  ).toBeCloseTo(0, 10);
});
it('holds sub-degree stationary jitter without freezing a deliberate slow turn', () => {
  const filter = new CameraStabilizer();
  filter.ingest(skyCamera(0, 20), 0);
  for (let time = 16; time <= 3200; time += 16) {
    filter.ingest(skyCamera(0.2 * Math.sin(time / 500), 20), time);
    expect(heading(filter.advance(time)!)).toBeCloseTo(0, 8);
  }
  for (let step = 1; step <= 200; step++) {
    const time = 3200 + step * 16;
    filter.ingest(skyCamera(step * 0.02, 20), time);
    filter.advance(time);
  }
  expect(heading(filter.advance(6416)!)).toBeGreaterThan(3.5);
});
