import { test, expect, prepare, encoded } from './fixtures';
const view = {
  version: 2,
  categories: [],
  playing: false,
  observer: { lat: 54.6, lon: 25.2, alt: 0, name: 'Test observer' },
  map: { lat: 54.6, lon: 25.2, zoom: 5 },
};
test('permission gesture enables north-up observer heading, relative readings are rejected and stale arrow clears', async ({
  page,
}) => {
  await prepare(page);
  await page.addInitScript(() => {
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
      configurable: true,
      value: async () => 'granted',
    });
  });
  await page.goto(`/?view=${encoded(view)}`);
  const enable = page.getByRole('button', { name: 'Enable phone heading', exact: true });
  await enable.click();
  await page.evaluate(() =>
    window.dispatchEvent(
      new DeviceOrientationEvent('deviceorientation', {
        alpha: 90,
        beta: 0,
        gamma: 0,
        absolute: false,
      }),
    ),
  );
  await expect(page.locator('.observer-heading')).toHaveCount(0);
  await expect(page.locator('.heading-status')).toHaveCount(0);
  await expect(page.locator('.heading-notification')).toContainText('North-referenced');
  await page.getByRole('button', { name: 'Dismiss Phone heading paused', exact: true }).click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2')!).map);
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
  await expect(page.locator('.observer-heading').first().locator('svg')).toHaveAttribute(
    'style',
    'transform:rotate(90deg)',
  );
  await expect(
    page.getByRole('button', { name: 'Disable phone heading', exact: true }),
  ).toContainText('90°');
  await expect(page.locator('.heading-tick')).toHaveAttribute('style', 'transform: rotate(90deg);');
  await expect(page.locator('.heading-status')).toHaveCount(0);
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2')!).map),
  ).toEqual(before);
  await page.clock.install();
  await page.clock.fastForward(5000);
  await expect(page.locator('.observer-heading')).toHaveCount(0);
  await expect(page.locator('.heading-status')).toHaveCount(0);
  await expect(page.locator('.heading-notification')).toHaveCount(0);
  await expect(enable.locator('svg')).toHaveAttribute('data-inactive', 'true');
  await enable.click();
  await expect(page.locator('.heading-notification')).toContainText('Compass signal paused');
  await page.clock.fastForward(6500);
  await expect(page.locator('.heading-notification')).toHaveCount(0);
});
test('denied iOS permission gives actionable state without heading marker', async ({ page }) => {
  await prepare(page);
  await page.addInitScript(() =>
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
      configurable: true,
      value: async () => 'denied',
    }),
  );
  await page.goto(`/?view=${encoded(view)}`);
  await page.getByRole('button', { name: 'Enable phone heading', exact: true }).click();
  await expect(page.locator('.heading-status')).toHaveCount(0);
  await expect(page.locator('.heading-notification')).toContainText('Motion permission was denied');
  await page.getByRole('button', { name: 'Dismiss Phone heading paused', exact: true }).click();
  await expect(page.locator('.heading-notification')).toHaveCount(0);
  await expect(page.locator('.observer-heading')).toHaveCount(0);
});

test('phone heading is visible before location setup and opens the location form', async ({
  page,
}, testInfo) => {
  await prepare(page);
  await page.goto(
    `/?view=${encoded({ version: 2, observer: null, categories: [], playing: false })}`,
  );
  const enable = page.getByRole('button', { name: 'Enable phone heading', exact: true });
  await expect(enable).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.heading-label')).toHaveCount(0);
  await enable.click();
  await expect(
    page.getByText('Set your observer location to show your phone direction on the map.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Set observer location', exact: true }).click();
  const search = page.getByRole('combobox', { name: 'Location', exact: true });
  await expect(search).toBeVisible();
  await search.fill('Vilnius');
  await page.getByRole('option', { name: 'Vilnius, Lithuania', exact: true }).click();
  await page.keyboard.press('Escape');
  const closeSidebar = page.getByRole('button', { name: 'Close sidebar', exact: true });
  if (await closeSidebar.isVisible()) await closeSidebar.click();
  await expect(enable).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: testInfo.outputPath('visible-phone-heading.png'),
    animations: 'disabled',
  });
});
