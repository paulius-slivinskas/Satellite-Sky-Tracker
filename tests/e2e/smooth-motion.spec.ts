import * as satellite from 'satellite.js';
import { test, expect, prepare, openSidebar, encoded, LINE1, LINE2 } from './fixtures';

type Draw = { x: number; y: number; at: number };
declare global {
  interface Window {
    __satelliteMotion: { samples: Draw[]; last: Draw | null; recording: boolean };
  }
}
const anchor = Date.parse('2024-02-29T12:30:00Z');
const zoom = 6;
const satrec = satellite.twoline2satrec(LINE1, LINE2);
function positionAt(time: number) {
  const date = new Date(time);
  const result = satellite.propagate(satrec, date);
  if (!result.position || typeof result.position === 'boolean')
    throw new Error('Invalid ISS fixture');
  const position = satellite.eciToGeodetic(result.position, satellite.gstime(date));
  return {
    lat: satellite.degreesLat(position.latitude),
    lon: satellite.degreesLong(position.longitude),
  };
}
function projectedAt(time: number) {
  const { lat, lon } = positionAt(time);
  const scale = 256 * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}
const distance = (a: Draw | { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

test('ISS canvas motion exceeds propagation frequency, retains subpixels, pauses and snaps on seek', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await prepare(page);
  await page.addInitScript(() => {
    const probe = { samples: [] as Draw[], last: null as Draw | null, recording: false };
    window.__satelliteMotion = probe;
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function (x, y, radius, start, end, counterclockwise) {
      // Other canvases and selection/observer/pass circles must not affect the measurement.
      if (radius === 3 && this.canvas.closest('.leaflet-overlay-pane')) {
        const draw = { x, y, at: performance.now() };
        probe.last = draw;
        if (probe.recording && probe.samples.length < 2000) probe.samples.push(draw);
      }
      return arc.call(this, x, y, radius, start, end, counterclockwise);
    };
  });
  const center = positionAt(anchor);
  await page.goto(
    `/?view=${encoded({
      version: 2,
      tab: 'time',
      categories: ['iss'],
      selectedNorad: null,
      searchNorad: null,
      passWatchlist: [],
      observer: null,
      allLosEnabled: false,
      showPassesOnMap: false,
      playing: true,
      speed: 1,
      simulatedTimeMs: anchor,
      map: { ...center, zoom },
    })}`,
  );
  await openSidebar(page);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__satelliteMotion.last !== null)).toBe(true);
  const started = await page.evaluate(() => {
    window.__satelliteMotion.samples = [];
    window.__satelliteMotion.recording = true;
    return performance.now();
  });
  // Measure a real render window: a 4 Hz propagation-only implementation cannot pass.
  await page.waitForTimeout(1200);
  const moving = await page.evaluate(() => ({
    draws: window.__satelliteMotion.samples,
    ended: performance.now(),
  }));
  const elapsed = (moving.ended - started) / 1000;
  const positions = new Set(moving.draws.map(({ x, y }) => `${x.toFixed(6)}:${y.toFixed(6)}`));
  expect(positions.size / elapsed, 'distinct rendered ISS positions per second').toBeGreaterThan(
    4.5,
  );
  expect(
    moving.draws.filter(
      ({ x, y }) => Math.abs(x - Math.round(x)) > 0.001 || Math.abs(y - Math.round(y)) > 0.001,
    ).length,
    'most rendered centers should retain fractional pixels',
  ).toBeGreaterThan(moving.draws.length * 0.9);

  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  // Let the single final pause redraw and debounced state persistence settle.
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2') || '{}').playing),
    )
    .toBe(false);
  const paused = await page.evaluate(() => {
    window.__satelliteMotion.samples = [];
    return {
      draw: window.__satelliteMotion.last!,
      time: JSON.parse(localStorage.getItem('satapp_view_v2')!).simulatedTimeMs as number,
    };
  });
  await page.waitForTimeout(450);
  const held = await page.evaluate(() => ({
    last: window.__satelliteMotion.last!,
    draws: window.__satelliteMotion.samples,
  }));
  expect(distance(held.last, paused.draw), 'paused marker must remain stationary').toBeLessThan(
    0.000001,
  );
  expect(held.draws.every((draw) => distance(draw, paused.draw) < 0.000001)).toBe(true);

  const from = projectedAt(paused.time);
  const target = projectedAt(paused.time - 60000);
  const expected = { x: paused.draw.x + target.x - from.x, y: paused.draw.y + target.y - from.y };
  await page.evaluate(() => {
    window.__satelliteMotion.samples = [];
  });
  await page.getByRole('slider', { name: 'Time jog control' }).press('ArrowLeft');
  await expect
    .poll(() =>
      page.evaluate(
        (pausedDraw) =>
          window.__satelliteMotion.samples.some(
            (draw) => Math.hypot(draw.x - pausedDraw.x, draw.y - pausedDraw.y) > 1,
          ),
        paused.draw,
      ),
    )
    .toBe(true);
  const afterSeek = await page.evaluate(() => window.__satelliteMotion.samples);
  const firstMoved = afterSeek.find((draw) => distance(draw, paused.draw) > 1);
  expect(firstMoved, 'seek must draw the new marker location').toBeDefined();
  expect(
    distance(firstMoved!, expected),
    'first moved draw must snap to the sought orbit position',
  ).toBeLessThan(0.5);
  expect(distance(firstMoved!, paused.draw)).toBeGreaterThan(20);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
