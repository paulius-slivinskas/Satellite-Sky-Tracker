import { test, expect, prepare, openSidebar, encoded } from './fixtures';

test('search modal browses categories without selection controls and opens a satellite on the map', async ({
  page,
}, testInfo) => {
  await prepare(page);
  await page.goto(
    `/?view=${encoded({ version: 2, categories: ['weather'], playing: false, simulatedTimeMs: Date.parse('2024-02-29T12:30:00Z'), passWatchlist: ['33591'] })}`,
  );
  await openSidebar(page);
  const trigger = page.getByRole('button', { name: 'Search', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Search satellites', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await expect(dialog.getByRole('region', { name: 'Selected satellites' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Select all', exact: true })).toHaveCount(0);
  const input = dialog.getByRole('textbox', { name: 'Search satellites', exact: true });
  await expect(input).toHaveAttribute('placeholder', 'Satellite name or NORAD ID');
  await expect(input).toBeFocused();
  if (testInfo.project.use.hasTouch) await expect(input).toHaveCSS('font-size', '16px');
  const strip = dialog.getByRole('group', { name: 'Satellite categories' });
  const stripBox = (await strip.boundingBox())!;
  if (!testInfo.project.use.hasTouch) {
    await page.mouse.move(stripBox.x + stripBox.width - 20, stripBox.y + stripBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(stripBox.x + 40, stripBox.y + stripBox.height / 2, { steps: 10 });
    await page.mouse.up();
    expect(await strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await expect(
      dialog.getByRole('button', { name: 'All satellites', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  } else {
    const touch = await page.context().newCDPSession(page);
    const y = stripBox.y + stripBox.height / 2;
    const x = stripBox.x + stripBox.width - 20;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++)
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x - step * 20, y }],
      });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await touch.detach();
  }
  await strip.evaluate((el) => {
    el.scrollLeft = 0;
  });

  await dialog.getByRole('button', { name: 'Amateur Radio', exact: true }).click();
  await input.fill('ISS');
  await expect(dialog.locator('.satellite-search-row')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'All satellites', exact: true }).click();
  const row = dialog.getByRole('button', { name: 'Show ISS (25544) on map', exact: true });
  await expect(row).toBeVisible();
  await expect(row.locator('svg path')).toHaveAttribute('d', 'm9 6 6 6-6 6');
  await input.fill('25544');
  await expect(dialog.locator('.satellite-search-row')).toHaveCount(1);
  await page.screenshot({ path: `/tmp/satellite-search-${testInfo.project.name}.png` });
  await row.focus();
  await row.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#map')).toHaveAttribute('data-selected-norad', '25544');
  await expect(page.getByRole('complementary', { name: 'ISS satellite details' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2') || '{}').passWatchlist),
    )
    .toEqual(['33591']);
  await page.getByRole('button', { name: 'Close satellite details', exact: true }).click();
  await openSidebar(page);
  await trigger.click();
  await dialog.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#map')).toHaveAttribute('data-selected-norad', '');
});
