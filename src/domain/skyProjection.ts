export type Vector = { x: number; y: number; z: number };
export type SkyCamera = { right: Vector; up: Vector; forward: Vector };
const rad = Math.PI / 180;
export function skyVector(azimuth: number, elevation: number): Vector {
  const az = azimuth * rad,
    el = elevation * rad;
  return { x: Math.sin(az) * Math.cos(el), y: Math.cos(az) * Math.cos(el), z: Math.sin(el) };
}
export function skyCamera(azimuth: number, elevation: number): SkyCamera {
  const az = azimuth * rad,
    el = elevation * rad;
  return {
    forward: skyVector(azimuth, elevation),
    right: { x: Math.cos(az), y: -Math.sin(az), z: 0 },
    up: { x: -Math.sin(az) * Math.sin(el), y: -Math.cos(az) * Math.sin(el), z: Math.cos(el) },
  };
}
const dot = (a: Vector, b: Vector) => a.x * b.x + a.y * b.y + a.z * b.z;
export const SKY_WIDTH = 400,
  SKY_HEIGHT = 460;
export const SKY_FOCAL = SKY_HEIGHT / (2 * Math.tan((75 * rad) / 2));
export type SkyViewport = { width: number; height: number; focal: number };
export const skyViewport = (width: number, height: number): SkyViewport => ({
  width,
  height,
  focal: height / (2 * Math.tan((75 * rad) / 2)),
});
const defaultViewport = skyViewport(SKY_WIDTH, SKY_HEIGHT);
export function projectSky(
  camera: SkyCamera,
  azimuth: number,
  elevation: number,
  viewport = defaultViewport,
) {
  const vector = skyVector(azimuth, elevation);
  const right = dot(vector, camera.right),
    up = dot(vector, camera.up),
    depth = dot(vector, camera.forward);
  const x = viewport.width / 2 + (viewport.focal * right) / Math.max(depth, 0.02);
  const y = viewport.height / 2 - (viewport.focal * up) / Math.max(depth, 0.02);
  return {
    x,
    y,
    depth,
    visible: depth > 0.02 && x >= 0 && x <= viewport.width && y >= 0 && y <= viewport.height,
  };
}
export function skyPath(
  camera: SkyCamera,
  points: Array<{ azimuth: number; elevation: number } | null>,
  viewport = defaultViewport,
) {
  let connected = false;
  return points
    .map((point) => {
      if (!point) {
        connected = false;
        return '';
      }
      const projected = projectSky(camera, point.azimuth, point.elevation, viewport);
      if (projected.depth <= 0.05) {
        connected = false;
        return '';
      }
      const command = connected ? 'L' : 'M';
      connected = true;
      return `${command}${projected.x.toFixed(2)},${projected.y.toFixed(2)}`;
    })
    .join(' ');
}
/** Clip the viewport against the real ground half-plane, including device roll. */
export function skyGround(camera: SkyCamera, viewport = defaultViewport) {
  const level = (p: { x: number; y: number }) =>
    camera.forward.z +
    (camera.right.z * (p.x - viewport.width / 2)) / viewport.focal -
    (camera.up.z * (p.y - viewport.height / 2)) / viewport.focal;
  const corners = [
    { x: 0, y: 0 },
    { x: viewport.width, y: 0 },
    { x: viewport.width, y: viewport.height },
    { x: 0, y: viewport.height },
  ];
  const points: Array<{ x: number; y: number }> = [];
  corners.forEach((end, i) => {
    const start = corners[(i + 3) % 4],
      a = level(start),
      b = level(end);
    if (a < 0 !== b < 0) {
      const t = a / (a - b);
      points.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t });
    }
    if (b < 0) points.push(end);
  });
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

/** Screen-space guidance stays valid even when the satellite is behind the phone. */
export function skyGuide(
  camera: SkyCamera,
  azimuth: number,
  elevation: number,
  viewport = defaultViewport,
) {
  const vector = skyVector(azimuth, elevation);
  let right = dot(vector, camera.right),
    up = dot(vector, camera.up);
  const depth = dot(vector, camera.forward);
  const distance = Math.acos(Math.max(-1, Math.min(1, depth))) / rad;
  // At the antipode either turn works. Choose screen-right rather than letting
  // tiny sensor noise spin the guidance arrow between opposite directions.
  if (depth < -0.985 || Math.hypot(right, up) < 0.00001) {
    right = 1;
    up = 0;
  }
  const length = Math.hypot(right, up);
  const dx = right / length,
    dy = -up / length;
  const radius = 48;
  return {
    x: viewport.width / 2 + dx * radius,
    y: viewport.height / 2 + dy * radius,
    angle: Math.atan2(right, up) / rad,
    distance,
  };
}
