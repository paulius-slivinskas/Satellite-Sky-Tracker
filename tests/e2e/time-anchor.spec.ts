import { test, expect, prepare, openSidebar, encoded } from './fixtures';

test('opening Passes predicts the watchlist from the current accelerated clock', async ({
  page,
}) => {
  await prepare(page);
  await page.addInitScript(() => {
    const scope = window as typeof window & { __passWorkerTimes: number[] };
    scope.__passWorkerTimes = [];
    const NativeWorker = window.Worker;
    // Keep the actual worker, messaging, and calculation; observe only its input timestamp.
    window.Worker = class extends NativeWorker {
      postMessage(
        message: unknown,
        transferOrOptions?: Transferable[] | StructuredSerializeOptions,
      ) {
        if (
          message &&
          typeof message === 'object' &&
          'time' in message &&
          typeof message.time === 'number'
        ) {
          scope.__passWorkerTimes.push(message.time);
        }
        if (Array.isArray(transferOrOptions)) super.postMessage(message, transferOrOptions);
        else super.postMessage(message, transferOrOptions);
      }
    };
  });
  const initial = Date.parse('2024-02-29T12:30:00Z');
  await page.goto(
    `/?view=${encoded({
      version: 2,
      tab: 'time',
      categories: ['iss'],
      observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' },
      simulatedTimeMs: initial,
      speed: 900,
      playing: true,
      passRange: 'upcoming3',
      passWatchlist: ['25544'],
      selectedNorad: null,
      searchNorad: null,
    })}`,
  );
  await openSidebar(page);
  const clock = page.getByRole('slider', { name: 'Time jog control' });
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await expect
    .poll(async () => Number(await clock.getAttribute('aria-valuenow')) * 1000)
    .toBeGreaterThan(initial + 60000);
  const displayedBeforeSelection = Number(await clock.getAttribute('aria-valuenow')) * 1000;
  await page.evaluate(() => {
    (window as typeof window & { __passWorkerTimes: number[] }).__passWorkerTimes = [];
  });
  await page.getByRole('tab', { name: 'Passes', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __passWorkerTimes: number[] }).__passWorkerTimes.at(-1) ?? 0,
      ),
    )
    // The accessible slider rounds milliseconds to the nearest second.
    .toBeGreaterThanOrEqual(displayedBeforeSelection - 500);
  await expect(page.locator('.pass-item')).toHaveCount(3, { timeout: 20000 });
});
