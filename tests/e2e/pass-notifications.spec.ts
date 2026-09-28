import { test, expect, prepare, openSidebar, encoded } from './fixtures';
import type { Page } from '@playwright/test';

async function setup(page: Page, denied = false, audioAvailable = true) {
  await prepare(page, new Date('2024-02-29T18:22:35Z'));
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  );
  await page.addInitScript(
    ({ denied, audioAvailable }) => {
      const scope = window as typeof window & {
        __notices: string[];
        __tones: number;
        __frequencies: number[];
        __permissionRequests: number;
      };
      scope.__notices = [];
      scope.__tones = 0;
      scope.__frequencies = [];
      scope.__permissionRequests = 0;
      class TestNotification {
        static permission: NotificationPermission = denied ? 'denied' : 'default';
        static async requestPermission() {
          scope.__permissionRequests++;
          this.permission = 'granted';
          return this.permission;
        }
        onclose: (() => void) | null = null;
        constructor(title: string) {
          scope.__notices.push(title);
        }
        close() {
          this.onclose?.();
        }
      }
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        anchor?: number;
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          this.addEventListener('message', (event) => {
            if (this.anchor === Date.parse('2024-02-29T12:30:00Z') && event.data?.passes)
              (
                window as typeof window & { __displayedPasses: { maxAt: number }[] }
              ).__displayedPasses = event.data.passes;
          });
        }
        postMessage(message: any, options?: Transferable[] | StructuredSerializeOptions) {
          this.anchor = message.time;
          if (Array.isArray(options)) super.postMessage(message, options);
          else super.postMessage(message, options);
        }
      };
      window.Notification = TestNotification as unknown as typeof Notification;
      const NativeAudioContext = window.AudioContext;
      window.AudioContext = audioAvailable
        ? class extends NativeAudioContext {
            createOscillator() {
              scope.__tones++;
              const oscillator = super.createOscillator();
              const start = oscillator.start.bind(oscillator);
              oscillator.start = (when) => {
                scope.__frequencies.push(oscillator.frequency.value);
                start(when);
              };
              return oscillator;
            }
          }
        : (undefined as unknown as typeof AudioContext);
    },
    { denied, audioAvailable },
  );
  await page.goto(
    `/?view=${encoded({ version: 2, tab: 'passes', categories: ['iss'], passWatchlist: ['25544'], observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' }, playing: false, simulatedTimeMs: Date.parse('2024-02-29T12:30:00Z') })}`,
  );
  await openSidebar(page);
  await expect(page.locator('.pass-item').first()).toBeVisible();
}
const delivered = (page: Page) =>
  page.evaluate(() => {
    const scope = window as typeof window & {
      __notices: string[];
      __tones: number;
      __frequencies: number[];
      __permissionRequests: number;
    };
    return { notices: scope.__notices, tones: scope.__tones, requests: scope.__permissionRequests };
  });

test('distinct chimes announce entry and the displayed peak once while simulation is paused', async ({
  page,
}, testInfo) => {
  await setup(page);
  expect((await delivered(page)).requests).toBe(0);
  await page.getByRole('button', { name: 'Test entering', exact: true }).click();
  const stack = page.locator('.pass-notification-stack');
  await expect(stack).toContainText('Test: entering visibility');
  await expect
    .poll(() => delivered(page))
    .toEqual({ notices: ['Test: entering visibility'], tones: 2, requests: 1 });
  await page.screenshot({ path: testInfo.outputPath('test-notification.png') });
  await stack.getByRole('button', { name: 'Dismiss Test: entering visibility' }).click();
  // Let the first real-time horizon sample settle before moving wall time forward.
  await page.waitForTimeout(1100);
  await page.clock.setFixedTime(new Date('2024-02-29T18:22:46Z'));
  await expect(stack).toContainText('Entering visibility');
  await expect(stack).toContainText('ISS is rising above your horizon');
  await expect
    .poll(() => delivered(page))
    .toEqual({
      notices: ['Test: entering visibility', 'Entering visibility'],
      tones: 4,
      requests: 1,
    });
  await page.clock.setFixedTime(new Date('2024-02-29T18:22:55Z'));
  await page.waitForTimeout(1100);
  expect((await delivered(page)).notices).toHaveLength(2);
  const maxAt = await page.evaluate(
    () =>
      (window as typeof window & { __displayedPasses: { maxAt: number }[] }).__displayedPasses[0]
        .maxAt,
  );
  expect(maxAt).toBeGreaterThan(Date.parse('2024-02-29T18:22:55Z'));
  // A large seek first establishes the pre-peak baseline; the actual crossing is one second.
  await page.clock.setFixedTime(new Date(maxAt - 1000));
  await page.waitForTimeout(1100);
  expect((await delivered(page)).notices).toHaveLength(2);
  await page.clock.setFixedTime(new Date(maxAt));
  await expect(stack).toContainText('Pass peak');
  await expect(stack).toContainText('at maximum elevation');
  await expect
    .poll(() => delivered(page))
    .toEqual({
      notices: ['Test: entering visibility', 'Entering visibility', 'Pass peak'],
      tones: 7,
      requests: 1,
    });
  const frequencies = await page.evaluate(
    () => (window as typeof window & { __frequencies: number[] }).__frequencies,
  );
  expect(frequencies.slice(0, 4)).toEqual([740, 988, 740, 988]);
  expect(frequencies.slice(4, 6)).toEqual([988, 740]);
  expect(frequencies[6]).toBeCloseTo(1174.66, 2);
  await page.screenshot({ path: testInfo.outputPath('peak-notification.png') });
  await page.clock.setFixedTime(new Date(maxAt + 10000));
  await page.waitForTimeout(1100);
  expect((await delivered(page)).notices).toHaveLength(3);
  await page.getByRole('button', { name: 'Test peak', exact: true }).click();
  await expect(stack).toContainText('Test: pass peak');
  await expect.poll(async () => (await delivered(page)).tones).toBe(10);
});

test('denied desktop permission retains in-page alerts and sound, and the toggle persists', async ({
  page,
}) => {
  await setup(page, true);
  await page.getByRole('button', { name: 'Test entering', exact: true }).click();
  await expect(page.locator('.pass-notification-stack')).toContainText('Test: entering visibility');
  await expect.poll(() => delivered(page)).toEqual({ notices: [], tones: 2, requests: 0 });
  await expect(page.getByText('Desktop notifications blocked;', { exact: false })).toBeVisible();
  await page
    .getByRole('switch', { name: 'Pass notifications', exact: true })
    .locator('xpath=ancestor::label')
    .click();
  await page.clock.setFixedTime(new Date('2024-02-29T18:22:46Z'));
  await page.waitForTimeout(1100);
  await expect(page.locator('.pass-notification-stack')).not.toContainText('Entering visibility');
  await page.reload();
  await openSidebar(page);
  await expect(
    page.getByRole('switch', { name: 'Pass notifications', exact: true }),
  ).not.toBeChecked();
});

test('unsupported audio does not suppress the visible test notification', async ({ page }) => {
  await setup(page, true, false);
  await page.getByRole('button', { name: 'Test entering', exact: true }).click();
  await expect(page.locator('.pass-notification-stack')).toContainText('Test: entering visibility');
  await expect(page.getByRole('button', { name: 'Test entering', exact: true })).toBeEnabled();
  expect((await delivered(page)).tones).toBe(0);
  await expect(page.getByText('Sound unavailable or blocked.', { exact: false })).toBeVisible();
});
