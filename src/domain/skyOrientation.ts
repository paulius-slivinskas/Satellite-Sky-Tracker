import {
  compassHeading,
  normalizeHeading,
  orientationCamera,
  relativeOrientationCamera,
  type OrientationReading,
} from './deviceOrientation';
import type { SkyCamera, Vector } from './skyProjection';

export type SkyCalibration = 'hold-flat' | 'hold-still' | 'poor-accuracy' | null;
const signedAngle = (value: number) => normalizeHeading(value + 180) - 180;
const dot = (a: Vector, b: Vector) => a.x * b.x + a.y * b.y + a.z * b.z;
const separation = (a: SkyCamera, b: SkyCamera) =>
  (Math.acos(
    Math.max(
      -1,
      Math.min(1, (dot(a.right, b.right) + dot(a.up, b.up) + dot(a.forward, b.forward) - 1) / 2),
    ),
  ) *
    180) /
  Math.PI;

/**
 * Safari delivers relative Core Motion attitude and a separate magnetic heading.
 * Align the entire attitude to north while flat; retain that alignment while
 * tracking so magnetic heading noise cannot masquerade as phone rotation.
 * Motion is available during alignment, but is not a north reference yet.
 */
export class SkyOrientationTracker {
  calibration: SkyCalibration = null;
  private northOffset: number | null = null;
  private magneticFrame = false;
  private needsAlignment = true;
  private candidate: {
    offset: number;
    sum: number;
    count: number;
    start: number;
    last: number;
    pose: SkyCamera;
  } | null = null;

  recalibrate() {
    this.needsAlignment = true;
    this.candidate = null;
    this.calibration = 'hold-flat';
  }

  read(reading: OrientationReading, screenAngle: number, now: number): SkyCamera | null {
    this.calibration = null;
    if ('webkitCompassHeading' in reading) this.magneticFrame = true;
    if (!this.magneticFrame) {
      return orientationCamera(reading, screenAngle);
    }
    const relative = relativeOrientationCamera(reading);
    if (!relative) return null;
    if (this.needsAlignment) this.align(reading, relative, now);
    const camera = relativeOrientationCamera(reading, screenAngle)!;
    const angle = ((this.northOffset ?? 0) * Math.PI) / 180;
    const rotate = ({ x, y, z }: Vector): Vector => ({
      x: Math.cos(angle) * x - Math.sin(angle) * y,
      y: Math.sin(angle) * x + Math.cos(angle) * y,
      z,
    });
    return { right: rotate(camera.right), up: rotate(camera.up), forward: rotate(camera.forward) };
  }

  private align(reading: OrientationReading, relative: SkyCamera, now: number) {
    const heading = compassHeading(reading);
    if (heading === null || (reading.webkitCompassAccuracy ?? 0) > 20) {
      this.candidate = null;
      this.calibration = 'poor-accuracy';
      return;
    }
    // Face up within about 30 degrees: the physical top edge then has a
    // well-defined horizontal bearing. Do not calibrate from a vertical edge.
    if (-relative.forward.z < 0.85) {
      this.candidate = null;
      this.calibration = 'hold-flat';
      return;
    }
    const relativeHeading = (Math.atan2(relative.up.x, relative.up.y) * 180) / Math.PI;
    const offset = signedAngle(relativeHeading - heading);
    const previous = this.candidate;
    if (
      !previous ||
      now - previous.last > 250 ||
      Math.abs(signedAngle(offset - previous.offset)) > 3 ||
      separation(relative, previous.pose) > 2
    ) {
      this.candidate = { offset, sum: offset, count: 1, start: now, last: now, pose: relative };
    } else {
      previous.sum += previous.offset + signedAngle(offset - previous.offset);
      previous.count++;
      previous.last = now;
    }
    const candidate = this.candidate!;
    this.calibration = 'hold-still';
    if (now - candidate.start < 600 || candidate.count < 8) return;
    this.northOffset = candidate.sum / candidate.count;
    this.candidate = null;
    this.needsAlignment = false;
    this.calibration = null;
  }
}
