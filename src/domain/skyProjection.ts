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
export function projectSky(camera: SkyCamera, azimuth: number, elevation: number) {
  const vector = skyVector(azimuth, elevation);
  const right = dot(vector, camera.right),
    up = dot(vector, camera.up),
    depth = dot(vector, camera.forward);
  const x = SKY_WIDTH / 2 + (SKY_FOCAL * right) / Math.max(depth, 0.02);
  const y = SKY_HEIGHT / 2 - (SKY_FOCAL * up) / Math.max(depth, 0.02);
  return {
    x,
    y,
    depth,
    visible: depth > 0.02 && x >= 0 && x <= SKY_WIDTH && y >= 0 && y <= SKY_HEIGHT,
  };
}
export function skyPath(
  camera: SkyCamera,
  points: Array<{ azimuth: number; elevation: number } | null>,
) {
  let connected = false;
  return points
    .map((point) => {
      if (!point) {
        connected = false;
        return '';
      }
      const projected = projectSky(camera, point.azimuth, point.elevation);
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
export function skyGround(camera: SkyCamera) {
  const level = (p: { x: number; y: number }) =>
    camera.forward.z +
    (camera.right.z * (p.x - SKY_WIDTH / 2)) / SKY_FOCAL -
    (camera.up.z * (p.y - SKY_HEIGHT / 2)) / SKY_FOCAL;
  const corners = [
    { x: 0, y: 0 },
    { x: SKY_WIDTH, y: 0 },
    { x: SKY_WIDTH, y: SKY_HEIGHT },
    { x: 0, y: SKY_HEIGHT },
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
