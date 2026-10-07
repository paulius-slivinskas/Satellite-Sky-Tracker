export interface OrientationReading {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute?: boolean;
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}
export const normalizeHeading = (value: number) => ((value % 360) + 360) % 360;
export function compassHeading(reading: OrientationReading): number | null {
  return Number.isFinite(reading.webkitCompassHeading) &&
    reading.webkitCompassHeading! >= 0 &&
    (reading.webkitCompassAccuracy === undefined ||
      (Number.isFinite(reading.webkitCompassAccuracy) && reading.webkitCompassAccuracy >= 0))
    ? normalizeHeading(reading.webkitCompassHeading!)
    : null;
}
export function orientationAngles(reading: OrientationReading, screenAngle = 0) {
  const { alpha, beta, gamma } = reading;
  const radians = Math.PI / 180;
  let heading: number | null = null;
  let elevation: number | null = null;
  const compass = compassHeading(reading);
  if (compass !== null) heading = normalizeHeading(compass - screenAngle);
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
  if (heading === null) {
    const camera = orientationCamera(reading, screenAngle);
    if (camera && Math.hypot(camera.forward.x, camera.forward.y) > 0.01)
      heading = normalizeHeading(Math.atan2(camera.forward.x, camera.forward.y) / radians);
  }
  return { heading, elevation };
}

/** Only absolute Euler readings can directly locate the sky relative to north. */
export function orientationCamera(
  reading: OrientationReading,
  screenAngle = 0,
): import('./skyProjection').SkyCamera | null {
  return reading.absolute ? relativeOrientationCamera(reading, screenAngle) : null;
}

/** Complete W3C Z-X-Y attitude, in the sensor's reference frame (not necessarily north). */
export function relativeOrientationCamera(
  reading: OrientationReading,
  screenAngle = 0,
): import('./skyProjection').SkyCamera | null {
  if (
    reading.alpha === null ||
    !Number.isFinite(reading.alpha) ||
    reading.beta === null ||
    reading.gamma === null ||
    !Number.isFinite(reading.beta) ||
    !Number.isFinite(reading.gamma)
  )
    return null;
  const r = Math.PI / 180;
  const b = reading.beta * r,
    g = reading.gamma * r,
    s = screenAngle * r;
  // Keep alpha/beta/gamma together: their individual values can change sharply
  // around upright poses while their combined rotation remains continuous.
  const a = reading.alpha * r;
  const ca = Math.cos(a),
    sa = Math.sin(a),
    cb = Math.cos(b),
    sb = Math.sin(b),
    cg = Math.cos(g),
    sg = Math.sin(g);
  const x = { x: ca * cg - sa * sb * sg, y: sa * cg + ca * sb * sg, z: -cb * sg };
  const y = { x: -sa * cb, y: ca * cb, z: sb };
  const rotate = (first: typeof x, second: typeof x, c: number, d: number) => ({
    x: first.x * c + second.x * d,
    y: first.y * c + second.y * d,
    z: first.z * c + second.z * d,
  });
  return {
    right: rotate(x, y, Math.cos(s), Math.sin(s)),
    up: rotate(x, y, -Math.sin(s), Math.cos(s)),
    forward: { x: -ca * sg - sa * sb * cg, y: -sa * sg + ca * sb * cg, z: -cb * cg },
  };
}
