import { test, expect, prepare, openSidebar, encoded } from './fixtures';

test('loads React/HeroUI UI, toggles filters, and pauses simulation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await prepare(page);
  await page.goto('/');
  await openSidebar(page);
  await expect(page.getByRole('heading', { name: 'Satellite Sky Tracker' })).toBeVisible();
  await expect(page.getByTestId('sat-count')).toContainText('visible from selected categories');
  await expect(page.getByRole('switch', { name: 'Starlink', exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(page.getByTestId('sat-count')).toHaveText('0 visible from selected categories');
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Starlink', exact: true })).toBeChecked();
  await page.getByRole('tab', { name: 'Time', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  const before = await page.locator('.time-readout').textContent();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.locator('.time-readout')).toHaveText(before!);
  await page.getByRole('slider', { name: 'Time jog control' }).press('ArrowRight');
  await expect(page.locator('.time-readout')).not.toHaveText(before!);
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).fontFamily)).toContain(
    'Google Sans',
  );
  expect(errors).toEqual([]);
});

test('search selects satellite, renders normalized radio and keeps tracking after reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await prepare(page);
  await page.goto('/');
  await openSidebar(page);
  const search = page.getByRole('combobox', { name: 'Smart Search' });
  await search.fill('25544');
  await page.getByRole('option', { name: /ISS/ }).click();
  const info = page.getByRole('complementary', { name: 'ISS satellite details' });
  await expect(info).toBeVisible();
  await info.getByRole('button', { name: /FM Voice/ }).click();
  await expect(info.getByText('437.800 MHz')).toBeVisible();
  await info.getByRole('button', { name: 'Add to Tracked' }).click();
  await expect(info.getByRole('button', { name: 'Remove from Tracked' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2') || '{}').tracked ?? []),
    )
    .toContain('NORAD-25544');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove from Tracked' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('restores legacy shared view and calculates passes in worker without clearing the list', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await prepare(page);
  const shared = {
    version: 1,
    tab: 'passes',
    categories: ['iss'],
    observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' },
    time: {
      simulatedTimeMs: Date.parse('2024-02-29T12:30:00Z'),
      speed: 1,
      playing: false,
      format: '24h',
    },
    passes: { range: 'upcoming3', selectedNorad: '25544' },
    selected: { norad: '25544' },
    map: { lat: 54.6, lon: 25.2, zoom: 3 },
  };
  await page.goto(`/?view=${encoded(shared)}`);
  await openSidebar(page);
  await expect(page.getByRole('tab', { name: 'Passes', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.pass-item')).toHaveCount(3, { timeout: 20000 });
  await expect(page.getByText('18:22:42', { exact: true })).toBeVisible();
  await page.locator('.pass-item').first().focus();
  await expect(page.locator('.pass-item').first()).toHaveClass(/pass-item-hover/);
  expect(errors).toEqual([]);
});

test('empty categories survive a shared URL and malformed URLs do not crash', async ({ page }) => {
  await prepare(page);
  await page.goto(`/?view=${encoded({ version: 2, categories: [], playing: false })}`);
  await openSidebar(page);
  await expect(page.getByTestId('sat-count')).toHaveText('0 visible from selected categories');
  await page.goto('/?view=not-valid-json');
  await openSidebar(page);
  await expect(page.getByRole('heading', { name: 'Satellite Sky Tracker' })).toBeVisible();
});
