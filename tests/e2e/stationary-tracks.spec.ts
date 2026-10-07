import { test, expect, prepare, openSidebar, encoded, LINE1, LINE2 } from './fixtures';
import * as sgp4 from 'satellite.js';
import type { Page } from '@playwright/test';

type TrackSnapshot = {
  node: SVGPathElement;
  d: string | null;
  dash: string | null;
  offset: number;
  start: number;
  end: number;
  from: string | null;
  to: string | null;
  samples: Array<{ distance: number; x: number; y: number }>;
};
type ProbeWindow = typeof window & {
  __trackSnapshots?: Record<string, TrackSnapshot[]>;
  __pendingPassWorkers?: number;
  __panProbe?: { observer: MutationObserver; writes: Map<Element, number>; interior: Element[] };
};
const anchor = Date.parse('2024-02-29T18:00:00Z');
const fixture = sgp4.twoline2satrec(LINE1, LINE2);
function viewportAt(time: number) {
  const date = new Date(time);
  const position = sgp4.propagate(fixture, date).position as sgp4.EciVec3<number>;
  const geo = sgp4.eciToGeodetic(position, sgp4.gstime(date));
  return { lat: sgp4.degreesLat(geo.latitude), lon: sgp4.degreesLong(geo.longitude), zoom: 3 };
}
const futureEnd = anchor + ((2 * Math.PI) / fixture.no) * 30000;
const base = {
  version: 2,
  tab: 'time',
  categories: ['iss'],
  simulatedTimeMs: anchor,
  speed: 60,
  playing: true,
  selectedNorad: null,
  passWatchlist: [] as string[],
  showPassesOnMap: true,
  map: viewportAt(anchor),
};
const orbitSelectors = ['#map .orbit-track-future'];
const approachSelector = '#map .pass-approach-path';
async function setup(page: Page) {
  await prepare(page);
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  );
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ body: '' }));
  await page.addInitScript(() => {
    const scope = window as ProbeWindow;
    scope.__pendingPassWorkers = 0;
    const NativeWorker = window.Worker;
    // Observe real worker completion so a one-time recalculation caused by Pause
    // finishes before checking whether the paused SVG continues changing.
    window.Worker = class extends NativeWorker {
      pendingPass = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        for (const event of ['message', 'error', 'messageerror'])
          this.addEventListener(event, () => this.finish());
      }
      finish() {
        if (this.pendingPass) {
          scope.__pendingPassWorkers!--;
          this.pendingPass = false;
        }
      }
      postMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
        if (
          message &&
          typeof message === 'object' &&
          'satellites' in message &&
          Array.isArray(message.satellites)
        ) {
          if (!this.pendingPass) scope.__pendingPassWorkers!++;
          this.pendingPass = true;
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
      terminate() {
        this.finish();
        super.terminate();
      }
    };
  });
}
async function capture(page: Page, selectors: string[]) {
  for (const selector of selectors)
    await expect.poll(() => page.locator(selector).count()).toBeGreaterThan(0);
  await expect(page.locator('#map svg mask')).toHaveCount(0);
  await page.evaluate(async (selectors) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    (window as ProbeWindow).__trackSnapshots = Object.fromEntries(
      selectors.map((selector) => [
        selector,
        [...document.querySelectorAll<SVGPathElement>(selector)]
          .filter((node) => !!node.getAttribute('d') && node.getAttribute('d') !== 'M0 0')
          .map((node) => {
            const start = Number(node.getAttribute('data-trim-start'));
            const end = Number(node.getAttribute('data-trim-end'));
            if (
              !node.hasAttribute('data-trim-start') ||
              !node.hasAttribute('data-trim-end') ||
              !Number.isFinite(start) ||
              !Number.isFinite(end)
            )
              throw new Error('Track trim diagnostics missing');
            const samples =
              end > start
                ? [0.2, 0.5, 0.8].map((fraction) => {
                    const distance = start + fraction * (end - start);
                    const point = node.getPointAtLength(distance - start);
                    return { distance, x: point.x, y: point.y };
                  })
                : [];
            return {
              node,
              d: node.getAttribute('d'),
              dash: node.getAttribute('stroke-dasharray'),
              offset: Number(node.getAttribute('stroke-dashoffset')),
              start,
              end,
              from: node.getAttribute('data-from'),
              to: node.getAttribute('data-to'),
              samples,
            };
          }),
      ]),
    );
  }, selectors);
}
async function changes(page: Page) {
  return page.evaluate(() =>
    Object.entries((window as ProbeWindow).__trackSnapshots ?? {}).map(([selector, before]) => {
      const common = before.filter(
        (item) => item.node.isConnected && item.node.getAttribute('d') !== 'M0 0',
      );
      const currentStart = (item: TrackSnapshot) =>
        Number(item.node.getAttribute('data-trim-start'));
      const currentEnd = (item: TrackSnapshot) => Number(item.node.getAttribute('data-trim-end'));
      const unchangedIntervals = common.filter(
        (item) => item.start === currentStart(item) && item.end === currentEnd(item),
      );
      const overlaps = common.flatMap((item) =>
        item.samples
          .filter(
            (sample) =>
              sample.distance > currentStart(item) + 1 && sample.distance < currentEnd(item) - 1,
          )
          .map((sample) => {
            const point = item.node.getPointAtLength(sample.distance - currentStart(item));
            return Math.hypot(point.x - sample.x, point.y - sample.y);
          }),
      );
      return {
        original: before.length,
        current: [...document.querySelectorAll(selector)].filter(
          (node) => !!node.getAttribute('d') && node.getAttribute('d') !== 'M0 0',
        ).length,
        common: common.length,
        unchangedIntervals: unchangedIntervals.length,
        interiorGeometryStable: unchangedIntervals.every(
          (item) => item.node.getAttribute('d') === item.d,
        ),
        allGeometryStable: common.every((item) => item.node.getAttribute('d') === item.d),
        dashPatternStable: common.every(
          (item) => item.node.getAttribute('stroke-dasharray') === item.dash,
        ),
        phaseCompensated: common.every(
          (item) =>
            Math.abs(Number(item.node.getAttribute('stroke-dashoffset')) - currentStart(item)) <
            1e-6,
        ),
        overlapSamples: overlaps.length,
        maxOverlapShift: Math.max(0, ...overlaps),
        rearAdvanced: common.some((item) => currentStart(item) > item.start + 1e-6),
        frontAdvanced: common.some((item) => currentEnd(item) > item.end + 1e-6),
        trimsStable: common.every(
          (item) =>
            currentStart(item) === item.start &&
            currentEnd(item) === item.end &&
            Number(item.node.getAttribute('stroke-dashoffset')) === item.offset,
        ),
        windowStable: common.every(
          (item) =>
            item.node.getAttribute('data-from') === item.from &&
            item.node.getAttribute('data-to') === item.to,
        ),
      };
    }),
  );
}
function assertFixedOverlap(track: Awaited<ReturnType<typeof changes>>[number]) {
  expect(track.common).toBeGreaterThan(0);
  expect(track.interiorGeometryStable).toBe(true);
  expect(track.dashPatternStable).toBe(true);
  expect(track.phaseCompensated).toBe(true);
  expect(track.overlapSamples).toBeGreaterThan(0);
  // SVG arc-length interpolation and serialized endpoints can round subpixels.
  expect(track.maxOverlapShift).toBeLessThan(0.1);
}

for (const boundary of ['rear', 'front'] as const) {
  test(`selected orbit advances its ${boundary} with phase compensation and fixed overlapping geometry`, async ({
    page,
  }) => {
    await setup(page);
    // On narrow viewports the endpoints can be on opposite sides of Earth.
    // Center each boundary independently so offscreen culling remains enabled.
    const map = viewportAt(boundary === 'rear' ? anchor : futureEnd);
    await page.goto(`/?view=${encoded({ ...base, map, selectedNorad: '25544' })}`);
    await expect(page.locator('.status')).toHaveCount(0, { timeout: 20000 });
    await capture(page, orbitSelectors);
    await expect
      .poll(async () =>
        (await changes(page)).every((track) =>
          boundary === 'rear' ? track.rearAdvanced : track.frontAdvanced,
        ),
      )
      .toBe(true);
    for (const track of await changes(page)) assertFixedOverlap(track);
    await expect(page.locator('#map svg mask')).toHaveCount(0);
  });
}

test('approach trims the satellite-side end with a fixed destination and stops changing when paused', async ({
  page,
}) => {
  await setup(page);
  await page.goto(
    `/?view=${encoded({ ...base, passWatchlist: ['25544'], passRange: 'upcoming3', observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' } })}`,
  );
  await expect(page.locator('.status')).toHaveCount(0, { timeout: 20000 });
  await expect
    .poll(() => page.evaluate(() => (window as ProbeWindow).__pendingPassWorkers))
    .toBe(0);
  await capture(page, [approachSelector]);
  await expect.poll(async () => (await changes(page))[0].rearAdvanced).toBe(true);
  const playing = (await changes(page))[0];
  assertFixedOverlap(playing);
  expect(playing.frontAdvanced).toBe(false);
  await openSidebar(page);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2') || '{}').playing),
    )
    .toBe(false);
  await expect
    .poll(() => page.evaluate(() => (window as ProbeWindow).__pendingPassWorkers))
    .toBe(0);
  await capture(page, [approachSelector]);
  await page.waitForTimeout(800);
  const paused = (await changes(page))[0];
  expect(paused.common).toBe(paused.original);
  expect(paused.current).toBe(paused.original);
  expect(paused.allGeometryStable).toBe(true);
  expect(paused.dashPatternStable).toBe(true);
  expect(paused.trimsStable).toBe(true);
  expect(paused.windowStable).toBe(true);
});

test('a paused selected orbit keeps geometry, trim offsets and time bounds unchanged without masks', async ({
  page,
}) => {
  await setup(page);
  await page.goto(`/?view=${encoded({ ...base, selectedNorad: '25544', playing: false })}`);
  await expect(page.locator('.status')).toHaveCount(0, { timeout: 20000 });
  await capture(page, orbitSelectors);
  await page.waitForTimeout(800);
  for (const track of await changes(page)) {
    expect(track.common).toBe(track.original);
    expect(track.current).toBe(track.original);
    expect(track.allGeometryStable).toBe(true);
    expect(track.dashPatternStable).toBe(true);
    expect(track.trimsStable).toBe(true);
    expect(track.windowStable).toBe(true);
  }
  await expect(page.locator('#map svg mask')).toHaveCount(0);
});

test('a sixty-step drag preserves interior chunks without rewriting every path on animation frames', async ({
  page,
}, testInfo) => {
  await setup(page);
  await page.goto(`/?view=${encoded({ ...base, selectedNorad: '25544', speed: 1 })}`);
  await expect(page.locator('.status')).toHaveCount(0, { timeout: 20000 });
  if (testInfo.project.use.hasTouch)
    await page.getByRole('button', { name: 'Close satellite details', exact: true }).click();
  await capture(page, orbitSelectors);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2') || '{}').map))
    .toBeTruthy();
  const beforeView = await page.evaluate(
    () => JSON.parse(localStorage.getItem('satapp_view_v2')!).map,
  );
  const interiorCount = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('#map .orbit-track-future')];
    const chunks = nodes.map((node) => Number(node.getAttribute('data-track-chunk')));
    const first = Math.min(...chunks),
      last = Math.max(...chunks);
    const interior = nodes.filter((node) => {
      const chunk = Number(node.getAttribute('data-track-chunk'));
      return chunk > first && chunk < last;
    });
    const writes = new Map(interior.map((node) => [node, 0]));
    const observer = new MutationObserver((records) => {
      for (const record of records)
        if (writes.has(record.target as Element))
          writes.set(record.target as Element, writes.get(record.target as Element)! + 1);
    });
    observer.observe(document.querySelector('#map')!, {
      subtree: true,
      attributes: true,
      attributeFilter: ['d'],
    });
    (window as ProbeWindow).__panProbe = { observer, writes, interior };
    return interior.length;
  });
  expect(interiorCount).toBeGreaterThan(0);
  const viewport = page.viewportSize()!;
  const start = { x: viewport.width / 2, y: viewport.height * 0.2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y + 40, { steps: 60 });
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2')!).map))
    .not.toEqual(beforeView);
  const measured = await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const probe = (window as ProbeWindow).__panProbe!;
    probe.observer.disconnect();
    return {
      remaining: probe.interior.filter((node) => node.isConnected).length,
      writes: [...probe.writes.values()],
    };
  });
  expect(measured.remaining).toBe(interiorCount);
  // A viewport commit may reproject at moveend; continuous per-frame rewrites of
  // every interior segment are not needed. This bound does not depend on FPS.
  expect(Math.max(...measured.writes)).toBeLessThanOrEqual(4);
  await expect(page.locator('#map svg mask')).toHaveCount(0);
});
