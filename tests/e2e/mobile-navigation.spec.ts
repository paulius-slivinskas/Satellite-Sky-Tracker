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
    expect(sheet.y + sheet.height).toBeCloseTo(viewport.height, 0);
    await expect(page.locator('.sidebar-stack')).toHaveCSS('border-top-left-radius', '36px');
    const background = await page
      .locator('.sidebar-stack')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background).not.toContain('rgba');
    const close = (await page
      .getByRole('button', { name: 'Close sidebar', exact: true })
      .boundingBox())!;
    expect(viewport.width - close.x - close.width).toBeCloseTo(12, 0);
    expect(close.width).toBe(40);
    if (name === 'Filters') {
      const search = page.getByRole('combobox', { name: 'Satellite search', exact: true });
      await expect(search).toHaveAttribute('placeholder', 'Search sat name or NORADID');
      const field = (await search.boundingBox())!;
      expect(field.x + field.width).toBeLessThan(close.x);
      expect(Math.abs(field.y + field.height / 2 - close.y - close.height / 2)).toBeLessThan(3);
    }
  }
  await page.getByRole('button', { name: 'Close sidebar', exact: true }).tap();
  await expect(page.locator('.theme-control')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-map-nav.png') });
  await nav.getByRole('tab', { name: 'Filters', exact: true }).tap();
  await expect(page.locator('.sidebar-stack')).toHaveCSS('transform', 'none');
  await page.screenshot({ path: testInfo.outputPath('mobile-bottom-sheet.png') });
});

test('mobile location cards open fullscreen and remain only in Settings after selection', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch);
  await prepare(page);
  await page.goto('/');
  const nav = page.getByRole('tablist', { name: 'Mobile tracking sections' });
  for (const name of ['Filters', 'Passes', 'Settings']) {
    await nav.getByRole('tab', { name, exact: true }).tap();
    await expect(page.getByRole('button', { name: 'Observer location', exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('button', { name: 'Set current location', exact: true }),
    ).toBeVisible();
  }
  await page.getByRole('button', { name: 'Set current location', exact: true }).tap();
  const dialog = page.getByRole('dialog', { name: 'Choose current location' });
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.y).toBe(0);
  expect(box.height).toBe(page.viewportSize()!.height);
  await dialog.getByRole('spinbutton', { name: 'Latitude', exact: true }).fill('54.6872');
  await dialog.getByRole('spinbutton', { name: 'Longitude', exact: true }).fill('25.2797');
  await dialog.getByRole('spinbutton', { name: 'Altitude (m)', exact: true }).fill('120');
  await dialog.getByRole('button', { name: 'Apply location', exact: true }).tap();
  await dialog.getByRole('button', { name: 'Close location picker', exact: true }).tap();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Change current location', exact: true }),
  ).toContainText('54.687, 25.280');
  for (const name of ['Filters', 'Passes']) {
    await nav.getByRole('tab', { name, exact: true }).tap();
    await expect(page.locator('.mobile-location-card:visible')).toHaveCount(0);
  }
  await nav.getByRole('tab', { name: 'Settings', exact: true }).tap();
  await page.getByRole('button', { name: 'Change current location', exact: true }).tap();
  await expect(dialog.getByRole('spinbutton', { name: 'Latitude', exact: true })).toHaveValue(
    '54.6872',
  );
  await page.screenshot({ path: testInfo.outputPath('mobile-fullscreen-location.png') });
});
