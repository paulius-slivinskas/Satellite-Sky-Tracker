import { test, expect, prepare, encoded } from './fixtures';
test('sky finder uses live clock, manual fallback and supports closing on a phone', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  const state = {
    version: 2,
    selectedNorad: '25544',
    observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' },
    simulatedTimeMs: Date.parse('2024-03-01T10:00:00Z'),
    playing: false,
  };
  await page.goto(`/?view=${encoded(state)}`);
  const launch = page.getByRole('button', { name: 'Find in the sky' });
  await expect(launch).toBeInViewport({ ratio: 1 });
  expect(await page.locator('.sat-info-panel').evaluate((el) => el.scrollTop)).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath('mobile-finder-launch.png'),
    animations: 'disabled',
  });
  await launch.click();
  const dialog = page.getByRole('dialog', { name: 'Satellite sky finder' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/LIVE SKY/)).toContainText('12:30');
  await expect(dialog.getByLabel('Manual compass heading')).toBeVisible();
  await dialog.getByLabel('Manual compass heading').fill('359');
  await expect(dialog.getByText('Manual heading from true north: 359°')).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Pass progress' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close sky finder' }).click();
  await expect(dialog).toHaveCount(0);
});

test('missing observer is actionable and denied sensors keep manual fallback', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'DeviceOrientationEvent', {
      configurable: true,
      value: Object.assign(function DeviceOrientationEvent() {}, {
        requestPermission: async () => 'denied',
      }),
    });
  });
  await page.goto(`/?view=${encoded({ version: 2, selectedNorad: '25544', observer: null })}`);
  await page.getByRole('button', { name: 'Find in the sky' }).click();
  const dialog = page.getByRole('dialog', { name: 'Satellite sky finder' });
  await expect(dialog.getByText(/Set an observer location/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Enable compass' }).click();
  await expect(dialog.getByText(/denied/i)).toBeVisible();
  await expect(dialog.getByLabel('Manual compass heading')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
