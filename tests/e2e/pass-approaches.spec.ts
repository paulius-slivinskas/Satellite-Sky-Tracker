import { test, expect, prepare, openSidebar, encoded } from './fixtures';
import type { Page } from '@playwright/test';

type ObservedPass = { noradId: string; losStart: number; losEnd: number; maxAt: number };
type Observation = { time: number; passes: ObservedPass[] };
const anchor = Date.parse('2024-02-29T12:30:00Z');
const shared = {
  version: 2,
  tab: 'passes',
  categories: ['iss', 'amateur'],
  observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' },
  passWatchlist: ['25544', '43017'],
  passRange: 'upcoming5',
  playing: false,
  simulatedTimeMs: anchor,
  showPassesOnMap: true,
};
async function setup(page: Page) {
  await prepare(page);
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  );
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ body: '' }));
  await page.addInitScript(() => {
    const scope = window as typeof window & { __approachObservation?: Observation };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      anchor: number | undefined;
      range?: string;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', (event) => {
          if (
            this.range === 'upcoming5' &&
            typeof this.anchor === 'number' &&
            Array.isArray(event.data?.passes)
          ) {
            scope.__approachObservation = { time: this.anchor, passes: event.data.passes };
          }
        });
      }
      postMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
        if (
          message &&
          typeof message === 'object' &&
          'time' in message &&
          typeof message.time === 'number'
        ) {
          this.anchor = message.time;
          this.range = 'range' in message ? String(message.range) : undefined;
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
}
async function loadAt(page: Page, time: number) {
  await page.goto(`/?view=${encoded({ ...shared, simulatedTimeMs: time })}`);
  await expect(page.locator('.status')).toHaveCount(0, { timeout: 20000 });
  await expect(page.locator('.pass-item')).toHaveCount(5, { timeout: 20000 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __approachObservation?: Observation }).__approachObservation
            ?.passes.length,
      ),
    )
    .toBe(5);
  const result = await page.evaluate(
    () => (window as typeof window & { __approachObservation: Observation }).__approachObservation,
  );
  expect(result.time).toBe(time);
  await expect(page.locator('#map')).toHaveAttribute('data-pass-count', '5');
  // Wait for Leaflet's effects to commit the solid overlay before asserting
  // that a particular dashed route is absent.
  await expect.poll(() => page.locator('#map .pass-label-content').count()).toBeGreaterThan(0);
  return result.passes;
}
const paths = (page: Page) => page.locator('#map .pass-approach-path');
async function endpoints(page: Page) {
  return paths(page).evaluateAll((elements) =>
    elements.map((element) => ({
      id: element.getAttribute('data-norad'),
      from: Number(element.getAttribute('data-from')),
      to: Number(element.getAttribute('data-to')),
      dash: element.getAttribute('stroke-dasharray'),
      path: element.getAttribute('d'),
    })),
  );
}

test('dashed approaches end only at the nearest future LOS entry for each satellite', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setup(page);
  const passes = await loadAt(page, anchor);
  await expect
    .poll(async () => [...new Set((await endpoints(page)).map((path) => path.id))].sort())
    .toEqual(['25544', '43017']);
  const rendered = await endpoints(page);
  for (const id of shared.passWatchlist) {
    const futureStarts = passes
      .filter((pass) => pass.noradId === id && pass.losStart > anchor)
      .map((pass) => pass.losStart);
    expect(futureStarts.length).toBeGreaterThan(1);
    const expected = Math.min(...futureStarts);
    // A track can split at the date line and is repeated across wrapped worlds.
    // All those SVG segments must still lead to one and the same nearest pass.
    expect([...new Set(rendered.filter((path) => path.id === id).map((path) => path.to))]).toEqual([
      expected,
    ]);
  }
  expect(rendered.every((path) => path.from === anchor && path.to > anchor)).toBe(true);
  expect(rendered.every((path) => !!path.dash && !!path.path)).toBe(true);
  expect(errors).toEqual([]);
});

test('ongoing LOS suppresses the incoming route and seeking beyond its end promotes the next pass', async ({
  page,
}) => {
  await setup(page);
  const initialPasses = await loadAt(page, anchor);
  const first = initialPasses
    .filter((pass) => pass.noradId === '25544')
    .sort((a, b) => a.losStart - b.losStart)[0];
  const during = first.maxAt;
  const active = await loadAt(page, during);
  expect(
    active.some(
      (pass) => pass.noradId === '25544' && pass.losStart <= during && during < pass.losEnd,
    ),
  ).toBe(true);
  await expect(page.locator('#map .pass-approach-path[data-norad="25544"]')).toHaveCount(0);
  const after = first.losEnd + 5000;
  const remaining = await loadAt(page, after);
  const next = Math.min(
    ...remaining
      .filter((pass) => pass.noradId === '25544' && pass.losStart > after)
      .map((pass) => pass.losStart),
  );
  expect(next).toBeGreaterThan(first.losEnd);
  await expect
    .poll(async () => [
      ...new Set(
        (await endpoints(page)).filter((path) => path.id === '25544').map((path) => path.to),
      ),
    ])
    .toEqual([next]);
  expect(
    (await endpoints(page))
      .filter((path) => path.id === '25544')
      .every((path) => path.from === after),
  ).toBe(true);
});

test('hiding pass overlays removes dashed incoming routes and showing them restores the nearest routes', async ({
  page,
}) => {
  await setup(page);
  await loadAt(page, anchor);
  await expect.poll(() => paths(page).count()).toBeGreaterThan(0);
  const before = [
    ...new Set((await endpoints(page)).map((path) => `${path.id}:${path.to}`)),
  ].sort();
  await openSidebar(page);
  const toggle = page.getByRole('switch', { name: 'Show Passes on Map', exact: true });
  await expect(toggle).toBeChecked();
  await toggle.focus();
  await toggle.press('Space');
  await expect(toggle).not.toBeChecked();
  await expect(paths(page)).toHaveCount(0);
  await toggle.press('Space');
  await expect(toggle).toBeChecked();
  await expect
    .poll(async () =>
      [...new Set((await endpoints(page)).map((path) => `${path.id}:${path.to}`))].sort(),
    )
    .toEqual(before);
});
