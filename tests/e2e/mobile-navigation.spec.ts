import { test, expect, prepare, encoded } from './fixtures';

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
    const title = page.locator('.mobile-sheet-header h2');
    await expect(title).toHaveText(name === 'Filters' ? 'Filter' : name);
    const titleBox = (await title.boundingBox())!;
    expect(titleBox.x + titleBox.width / 2).toBeCloseTo(viewport.width / 2, 0);
    if (name === 'Filters') {
      const search = page.getByRole('button', { name: 'Search', exact: true });
      await expect(search).toContainText('Satellite name or NORAD ID');
      const field = (await search.boundingBox())!;
      expect(field.y).toBeGreaterThan(close.y + close.height);
      await expect(page.getByText('Search', { exact: true })).toBeVisible();
    }
  }
  await page.getByRole('button', { name: 'Expand sheet', exact: true }).tap();
  expect((await page.locator('.sidebar-stack').boundingBox())!.y).toBe(0);
  await page.getByRole('button', { name: 'Collapse sheet', exact: true }).tap();
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

test('satellite details share the mobile sheet surface, header and expansion gesture', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch);
  await page.setViewportSize({ width: 390, height: 600 });
  await prepare(page);
  await page.goto(`/?view=${encoded({ version: 2, selectedNorad: '25544' })}`);
  const panel = page.getByRole('complementary', { name: 'ISS satellite details' });
  await expect(panel).toBeVisible();
  const viewport = page.viewportSize()!;
  const box = (await panel.boundingBox())!;
  expect(box.y).toBeCloseTo(viewport.height * 0.15, 0);
  expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
  await expect(panel).toHaveCSS('background-color', 'rgb(12, 12, 12)');
  await expect(page.getByRole('button', { name: 'Copy share link', exact: true })).toHaveCount(0);
  const title = (await panel.locator('.sat-info-head h2').boundingBox())!;
  const star = (await panel
    .getByRole('button', { name: 'Add to Tracked', exact: true })
    .boundingBox())!;
  const close = (await page
    .getByRole('button', { name: 'Close satellite details', exact: true })
    .boundingBox())!;
  expect(title.x + title.width / 2).toBeCloseTo(viewport.width / 2, 0);
  expect(Math.abs(star.x - 12)).toBeLessThanOrEqual(2);
  expect(close.x + close.width).toBeCloseTo(viewport.width - 12, 0);
  await panel.getByRole('button', { name: 'Add to Tracked', exact: true }).tap();
  await expect(
    panel.getByRole('button', { name: 'Remove from Tracked', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const handle = (await panel
    .getByRole('button', { name: 'Expand sheet', exact: true })
    .boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, 5, { steps: 5 });
  await page.mouse.up();
  expect((await panel.boundingBox())!.y).toBe(0);
  await panel.getByRole('button', { name: 'Collapse sheet', exact: true }).tap();
  await page.screenshot({ path: testInfo.outputPath('mobile-satellite-sheet.png') });
  await panel.locator('.sat-info-content').evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await panel.locator('.sat-info-content').evaluate((el) => el.scrollTop)).toBeGreaterThan(
    0,
  );
});
