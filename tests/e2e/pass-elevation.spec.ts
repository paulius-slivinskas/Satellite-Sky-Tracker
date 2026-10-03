import { test, expect, prepare, openSidebar, encoded } from './fixtures';
test('minimum elevation replaces its label with an input and filters qualifying upcoming passes', async ({
  page,
}, testInfo) => {
  await prepare(page);
  await page.goto(
    `/?view=${encoded({ version: 2, tab: 'passes', categories: ['iss'], playing: false, simulatedTimeMs: Date.parse('2024-02-29T12:30:00Z'), passRange: 'upcoming3', passWatchlist: ['25544'], observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' } })}`,
  );
  await openSidebar(page);
  const toggle = page.getByRole('switch', { name: 'Minimum elevation', exact: true });
  const input = page.getByRole('spinbutton', { name: 'Minimum elevation (degrees)', exact: true });
  await expect(toggle).not.toBeChecked();
  await expect(input).toHaveCount(0);
  await expect(page.locator('.pass-elevation-label')).toHaveText('Minimum elevation');
  await expect(page.locator('.pass-item')).toHaveCount(3);
  await page.locator('.pass-elevation-filter [data-slot="switch-content"]').click();
  await expect(input).toBeVisible();
  await expect(page.locator('.pass-elevation-label')).toHaveCount(0);
  await input.fill('30');
  await input.press('Tab');
  await expect(page.locator('.pass-item')).toHaveCount(3);
  await expect
    .poll(async () =>
      (await page.locator('.pass-peak').allTextContents()).every(
        (text) => Number.parseFloat(text) >= 30,
      ),
    )
    .toBe(true);
  await expect(page.locator('#map')).toHaveAttribute('data-pass-count', '3');
  const inputBox = (await input.boundingBox())!;
  const toggleBox = (await toggle.boundingBox())!;
  expect(inputBox.x + inputBox.width).toBeLessThan(toggleBox.x);
  if (testInfo.project.use.hasTouch)
    await page.getByRole('button', { name: 'Close sidebar', exact: true }).click();
  const card = page.locator('.pass-item').first();
  await expect(card.locator('.pass-content > .pass-summary-grid .pass-row')).toHaveCount(3);
  await card.getByRole('button', { name: 'More', exact: true }).click();
  await expect(card.getByText('LOS Appears', { exact: true })).toHaveCount(0);
  await expect(card.getByText('LOS Disappears', { exact: true })).toHaveCount(0);
  await expect(card.locator('.pass-extra-details dl').first().locator('dt')).toHaveText([
    'Rise Direction',
    'Max Elevation Az',
    'Set Direction',
  ]);
  const row = card.locator('.pass-extra-details dl').last();
  const az = (await row.locator('.pass-row').nth(0).boundingBox())!;
  const el = (await row.locator('.pass-row').nth(1).boundingBox())!;
  const nav = (await row.getByRole('button', { name: 'Navigate', exact: true }).boundingBox())!;
  expect(Math.abs(az.y - el.y)).toBeLessThan(2);
  expect(nav.x).toBeGreaterThan(el.x);
  expect(nav.y).toBeLessThan(el.y + el.height);
  const more = card.getByRole('button', { name: 'Less', exact: true });
  const satellite = card.getByRole('button', { name: 'Info', exact: true });
  await expect(more).toHaveClass(/button--ghost/);
  await expect(satellite).toHaveClass(/button--ghost/);
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(card.locator('.pass-date')).toHaveCount(0);
  const left = (await more.boundingBox())!;
  const right = (await satellite.boundingBox())!;
  expect(left.x + left.width).toBeLessThan(right.x);
  expect(Math.abs(left.y - right.y)).toBeLessThan(2);
  const chevron = (await more.locator('svg').boundingBox())!;
  expect(left.x + left.width - chevron.x - chevron.width).toBeLessThan(12);
  expect(Math.abs(left.y + left.height / 2 - chevron.y - chevron.height / 2)).toBeLessThan(2);
  await expect(satellite.locator('svg').last().locator('path')).toHaveAttribute(
    'd',
    'm9 6 6 6-6 6',
  );
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('pass-minimum-elevation.png') });
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('satapp_view_v2') || '{}').passMinElevationDegrees,
      ),
    )
    .toBe(30);
  await page.evaluate(() => history.replaceState(null, '', '/'));
  await page.reload();
  await openSidebar(page);
  await expect(toggle).toBeChecked();
  await expect(input).toHaveValue('30');
  await input.fill('90');
  await expect(
    page.getByText('No passes reach 90° in the selected range.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.pass-item')).toHaveCount(0);
  await expect(page.locator('#map')).toHaveAttribute('data-pass-count', '0');
  await page.locator('.pass-elevation-filter [data-slot="switch-content"]').click();
  await expect(input).toHaveCount(0);
  await expect(page.locator('.pass-item')).toHaveCount(3);
  await expect(page.locator('.pass-peak').first()).toHaveText('5.4°');
});
