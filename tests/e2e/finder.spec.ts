import { test, expect, prepare, encoded } from './fixtures';
test('minimal finder uses live clock and a faint cardinal compass with centered satellite name', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await page.addInitScript(() =>
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
      configurable: true,
      value: async () => 'granted',
    }),
  );
  await page.goto(
    `/?view=${encoded({ version: 2, selectedNorad: '25544', observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' }, simulatedTimeMs: Date.parse('2024-03-01T10:00:00Z'), playing: false })}`,
  );
  const launch = page.getByRole('button', { name: 'Find in the sky' });
  await expect(launch).toBeInViewport({ ratio: 1 });
  await launch.click();
  const dialog = page.getByRole('dialog', { name: 'Satellite sky finder' });
  await expect(dialog.getByRole('heading', { name: 'ISS', exact: true })).toHaveCSS(
    'text-align',
    'center',
  );
  await expect(dialog.locator('.finder-compass-ring')).toHaveCSS('opacity', '0.25');
  expect(await dialog.locator('.finder-compass-ring text').allTextContents()).toEqual([
    'N',
    'NE',
    'E',
    'SE',
    'S',
    'SW',
    'W',
    'NW',
  ]);
  await expect(dialog.getByRole('img')).toHaveAttribute('aria-label', /Current time 12:30:00/);
  await expect(dialog.getByRole('img')).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByText('Phone top', { exact: true })).toHaveCount(0);
  await expect(
    dialog.getByText(/Live position|Azimuth from true north|Pass in progress|Live clock/),
  ).toHaveCount(0);
  await expect(dialog.getByLabel('Manual compass heading')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Enable compass', exact: true }).click();
  await page.evaluate(() =>
    window.dispatchEvent(
      new DeviceOrientationEvent('deviceorientationabsolute', {
        alpha: 270,
        beta: 0,
        gamma: 0,
        absolute: true,
      }),
    ),
  );
  await expect(dialog.getByRole('button', { name: 'Compass active', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog.locator('.finder-compass-ring line').first()).toHaveAttribute(
    'transform',
    'rotate(-90 120 120)',
  );
  const close = dialog.getByRole('button', { name: 'Close sky finder', exact: true });
  await expect(close).toHaveCSS('border-radius', '50%');
  await page.screenshot({ path: testInfo.outputPath('minimal-red-finder.png') });
  await close.click();
  await expect(dialog).toHaveCount(0);
});
test('missing observer and denied compass use compact states without extra instructions', async ({
  page,
}) => {
  await prepare(page);
  await page.addInitScript(() =>
    Object.defineProperty(window, 'DeviceOrientationEvent', {
      configurable: true,
      value: Object.assign(function DeviceOrientationEvent() {}, {
        requestPermission: async () => 'denied',
      }),
    }),
  );
  await page.goto(`/?view=${encoded({ version: 2, selectedNorad: '25544', observer: null })}`);
  await page.getByRole('button', { name: 'Find in the sky' }).click();
  const dialog = page.getByRole('dialog', { name: 'Satellite sky finder' });
  await expect(dialog.getByText('Observer location required', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Enable compass', exact: true }).click();
  await expect(dialog.getByText('Compass permission denied', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Manual compass heading')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
