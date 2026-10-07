import type { SkyCamera } from './skyProjection';
type Quaternion = [number, number, number, number];
const dot = (a: Quaternion, b: Quaternion) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const distance = (a: Quaternion, b: Quaternion) =>
  (2 * Math.acos(Math.min(1, Math.abs(dot(a, b)))) * 180) / Math.PI;
function quaternion(camera: SkyCamera): Quaternion {
  // Matrix columns are screen right, screen up and the screen's outward normal.
  const { right: r, up: u, forward: f } = camera;
  const m00 = r.x,
    m01 = u.x,
    m02 = -f.x;
  const m10 = r.y,
    m11 = u.y,
    m12 = -f.y;
  const m20 = r.z,
    m21 = u.z,
    m22 = -f.z;
  let q: Quaternion;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 2 * Math.sqrt(trace + 1);
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4];
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s];
  }
  const length = Math.hypot(...q);
  return q.map((value) => value / length) as Quaternion;
}
function camera([x, y, z, w]: Quaternion): SkyCamera {
  return {
    right: { x: 1 - 2 * (y * y + z * z), y: 2 * (x * y + z * w), z: 2 * (x * z - y * w) },
    up: { x: 2 * (x * y - z * w), y: 1 - 2 * (x * x + z * z), z: 2 * (y * z + x * w) },
    forward: { x: -2 * (x * z + y * w), y: -2 * (y * z - x * w), z: -(1 - 2 * (x * x + y * y)) },
  };
}
/** Shortest-arc interpolation avoids Euler wrap and upright/zenith singularities. */
export class CameraStabilizer {
  private target: Quaternion | null = null;
  private current: Quaternion | null = null;
  private suspect: { value: Quaternion; since: number } | null = null;
  private lastAccepted = 0;
  private lastFrame = 0;
  ingest(value: SkyCamera, now: number) {
    const next = quaternion(value);
    // Compare with the accepted target, not the previous raw sample: tiny
    // jitter stays still but a deliberate slow turn accumulates and breaks out.
    if (this.target && distance(this.target, next) < 0.3) {
      this.suspect = null;
      this.lastAccepted = now;
      return true;
    }
    if (this.target && now - this.lastAccepted < 250 && distance(this.target, next) > 65) {
      if (!this.suspect || distance(this.suspect.value, next) > 20)
        this.suspect = { value: next, since: now };
      if (now - this.suspect.since < 90) return false;
    }
    this.suspect = null;
    this.target = next;
    this.lastAccepted = now;
    if (!this.current) {
      this.current = next;
      this.lastFrame = now;
    }
    return true;
  }
  advance(now: number): SkyCamera | null {
    if (!this.target || !this.current) return null;
    const angle = distance(this.current, this.target);
    const elapsed = Math.max(0, Math.min(100, now - this.lastFrame));
    this.lastFrame = now;
    // Quiet while held still; catch up promptly during an intentional turn.
    const factor = angle < 0.025 ? 1 : 1 - Math.exp(-elapsed / (angle > 12 ? 65 : 160));
    const sign = dot(this.current, this.target) < 0 ? -1 : 1;
    const blended = this.current.map(
      (value, i) => value + factor * (this.target![i] * sign - value),
    ) as Quaternion;
    const length = Math.hypot(...blended);
    this.current = blended.map((value) => value / length) as Quaternion;
    return camera(this.current);
  }
  get settled() {
    return !this.current || !this.target || distance(this.current, this.target) < 0.025;
  }
}
