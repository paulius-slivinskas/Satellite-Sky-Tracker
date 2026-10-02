export interface OrientationReading {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute?: boolean;
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}
export const normalizeHeading = (value: number) => ((value % 360) + 360) % 360;
export function orientationAngles(reading: OrientationReading, screenAngle = 0) {
  const { alpha, beta, gamma } = reading;
  const radians = Math.PI / 180;
  let heading: number | null = null;
  let elevation: number | null = null;
  if (
    Number.isFinite(reading.webkitCompassHeading) &&
    (reading.webkitCompassAccuracy === undefined || reading.webkitCompassAccuracy >= 0)
  ) {
    heading = normalizeHeading(reading.webkitCompassHeading! - screenAngle);
  }
  if (beta !== null && gamma !== null && Number.isFinite(beta) && Number.isFinite(gamma)) {
    const b = beta * radians,
      g = gamma * radians;
    // Rear camera points along device -z; its vertical projection is -cos(beta)cos(gamma).
    elevation = Math.asin(Math.max(-1, Math.min(1, -Math.cos(b) * Math.cos(g)))) / radians;
    if (heading === null && reading.absolute && alpha !== null && Number.isFinite(alpha)) {
      const a = alpha * radians,
        s = screenAngle * radians;
      const x = -Math.sin(s),
        y = Math.cos(s);
      const east =
        (Math.cos(a) * Math.cos(g) - Math.sin(a) * Math.sin(b) * Math.sin(g)) * x -
        Math.sin(a) * Math.cos(b) * y;
      const north =
        (Math.sin(a) * Math.cos(g) + Math.cos(a) * Math.sin(b) * Math.sin(g)) * x +
        Math.cos(a) * Math.cos(b) * y;
      if (Math.hypot(east, north) > 0.01)
        heading = normalizeHeading(Math.atan2(east, north) / radians);
    }
  }
  return { heading, elevation };
}
