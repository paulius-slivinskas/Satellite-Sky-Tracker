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
  const card = page.locator('.pass-item').first();
  await expect(card.locator('.pass-summary-grid .pass-row')).toHaveCount(3);
  const actions = await card.locator('.pass-actions button').all();
  expect(actions).toHaveLength(2);
  const left = (await actions[0].boundingBox())!;
  const right = (await actions[1].boundingBox())!;
  expect(Math.abs(left.y - right.y)).toBeLessThan(2);
  expect(left.x + left.width).toBeLessThan(right.x);
  const label = (await card.locator('summary span').boundingBox())!;
  const chevron = (await card.locator('summary svg').boundingBox())!;
  expect(chevron.x - label.x - label.width).toBeLessThan(8);
  expect(Math.abs(label.y + label.height / 2 - chevron.y - chevron.height / 2)).toBeLessThan(2);
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
