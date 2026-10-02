import { test, expect, prepare } from './fixtures';

test('mobile navigation opens bottom sheets and keeps map controls outside them', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch);
  await prepare(page);
  await page.goto('/');
  const nav = page.getByRole('tablist', { name: 'Mobile tracking sections' });
  await expect(nav).toBeVisible();
  const viewport = page.viewportSize()!;
  const bounds = (await nav.boundingBox())!;
  expect(bounds.y + bounds.height).toBeCloseTo(viewport.height - 12, 0);
  for (const name of ['Filters', 'Time', 'Passes', 'Settings']) {
    await nav.getByRole('tab', { name, exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Close sidebar', exact: true })).toBeVisible();
    await expect(page.locator('.theme-control')).toBeHidden();
    await expect(page.locator('.heading-control')).toBeHidden();
    await expect(page.locator('.sidebar-stack')).toHaveCSS('transform', 'none');
    const sheet = (await page.locator('.sidebar-stack').boundingBox())!;
    expect(sheet.y).toBeGreaterThan(0);
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(bounds.y + 1);
    const close = (await page
      .getByRole('button', { name: 'Close sidebar', exact: true })
      .boundingBox())!;
    expect(viewport.width - close.x - close.width).toBeCloseTo(12, 0);
  }
  await page.getByRole('button', { name: 'Close sidebar', exact: true }).tap();
  await expect(page.locator('.theme-control')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-map-nav.png') });
  await nav.getByRole('tab', { name: 'Filters', exact: true }).tap();
  await expect(page.locator('.sidebar-stack')).toHaveCSS('transform', 'none');
  await page.screenshot({ path: testInfo.outputPath('mobile-bottom-sheet.png') });
});
