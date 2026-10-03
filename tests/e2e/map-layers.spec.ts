import { test, expect, prepare, openSidebar, encoded } from './fixtures';
const shared = {
  version: 2,
  tab: 'settings',
  categories: ['iss'],
  playing: false,
  simulatedTimeMs: Date.parse('2024-02-29T12:30:00Z'),
  map: { lat: 54.6, lon: 25.2, zoom: 4 },
};
test('settings layer and appearance changes update the map and persist', async ({ page }) => {
  await prepare(page);
  await page.goto(`/?view=${encoded(shared)}`);
  await openSidebar(page);
  await expect(page.getByRole('button', { name: 'Choose map layer', exact: true })).toHaveCount(0);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2')!).map);
  for (const layer of ['Atlas', 'Blueprint', 'Satellite']) {
    await page.getByRole('button', { name: /Map layer/ }).click();
    const imagery =
      layer === 'Satellite'
        ? page.waitForResponse(
            (r) =>
              r.url().startsWith('https://tiles.maps.eox.at/') &&
              /\.jpg(?:\?|$)/.test(r.url()) &&
              r.ok(),
          )
        : null;
    await page.getByRole('option', { name: layer, exact: true }).click();
    if (imagery) await imagery;
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('satapp_map_layer')))
      .toBe(layer.toLowerCase());
  }
  await page.getByRole('button', { name: /Appearance/ }).click();
  await page.getByRole('option', { name: 'Light mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2')!).map),
  ).toEqual(before);
  await page.reload();
  await openSidebar(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: /Map layer/ })).toContainText('Satellite');
});
test('mobile settings use half the screen and other sheets fit their content', async ({
  page,
}, info) => {
  test.skip(!info.project.use.hasTouch);
  await prepare(page);
  await page.goto(`/?view=${encoded(shared)}`);
  await openSidebar(page);
  const sheet = page.locator('.sidebar-stack');
  const height = page.viewportSize()!.height;
  await expect.poll(async () => (await sheet.boundingBox())!.height).toBeCloseTo(height / 2, 0);
  const close = page.getByRole('button', { name: 'Close sidebar', exact: true });
  const box = (await close.boundingBox())!;
  expect(box.y).toBeGreaterThan(height / 2);
  await page.getByRole('tab', { name: 'Time', exact: true }).last().click();
  await expect.poll(async () => (await sheet.boundingBox())!.height).toBeLessThan(height * 0.85);
  await page.getByRole('button', { name: 'Expand sheet', exact: true }).click();
  await expect.poll(async () => (await sheet.boundingBox())!.height).toBeCloseTo(height, 0);
  await page.screenshot({ path: '/tmp/mobile-time-content-sheet.png' });
  await page.getByRole('tab', { name: 'Settings', exact: true }).last().click();
  await expect.poll(async () => (await sheet.boundingBox())!.height).toBeCloseTo(height / 2, 0);
  await page.screenshot({ path: '/tmp/mobile-settings-half-sheet.png' });
});
