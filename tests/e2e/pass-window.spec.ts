import { test, expect, prepare, openSidebar, encoded } from './fixtures';

test('a pass starting nine seconds before the range ends retains its full duration and peak', async ({
  page,
}) => {
  await prepare(page);
  const anchor = Date.parse('2024-02-29T15:22:51Z');
  await page.goto(
    `/?view=${encoded({
      version: 2,
      tab: 'passes',
      categories: ['iss'],
      playing: false,
      simulatedTimeMs: anchor,
      passRange: '3h',
      passWatchlist: ['25544'],
      observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' },
    })}`,
  );
  await openSidebar(page);
  const cards = page.locator('.pass-item');
  await expect(cards).toHaveCount(1);
  const row = (label: string) =>
    cards
      .locator('.pass-row')
      .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
      .locator('dd');
  await expect(row('Pass Start')).toHaveText('18:22:42');
  await expect(row('Pass End')).toHaveText('18:29:40');
  await expect(cards.locator('.pass-peak')).toHaveText('5.4°');
  const start = Number(await cards.getAttribute('data-pass-start'));
  expect(anchor + 3 * 3600000 - start).toBeGreaterThan(8000);
  expect(anchor + 3 * 3600000 - start).toBeLessThan(10000);
  await expect(page.locator('#map')).toHaveAttribute('data-pass-count', '1');
});

test('selecting a pass keeps its highlight and opens the mobile map without theme overlap', async ({
  page,
}, testInfo) => {
  await prepare(page);
  await page.goto(
    `/?view=${encoded({ version: 2, tab: 'passes', categories: ['iss'], playing: false, simulatedTimeMs: Date.parse('2024-02-29T12:30:00Z'), passRange: '24h', passWatchlist: ['25544'], observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' } })}`,
  );
  await openSidebar(page);
  const mobile = !!testInfo.project.use.hasTouch;
  if (mobile) await expect(page.locator('.theme-control')).toBeHidden();
  const card = page.locator('.pass-item').nth(1);
  await expect(card).toBeVisible();
  if (mobile) await card.tap();
  else await card.click();
  if (mobile) {
    await expect(page.getByRole('button', { name: 'Open sidebar', exact: true })).toBeVisible();
    await expect(page.locator('.theme-control')).toBeVisible();
    await openSidebar(page);
  }
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await expect(card).toHaveCSS('border-color', 'rgb(34, 197, 94)');
  await expect(page.locator('#map')).not.toHaveAttribute('data-pass-count', '0');
});

test('compact pass summary keeps predictions fixed while current position follows map time', async ({
  page,
}) => {
  await prepare(page);
  await page.clock.install();
  await page.goto(
    `/?view=${encoded({ version: 2, tab: 'passes', categories: ['iss'], playing: true, speed: 1, simulatedTimeMs: Date.parse('2024-02-29T12:30:00Z'), passRange: '24h', passWatchlist: ['25544'], observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' } })}`,
  );
  await openSidebar(page);
  const card = page.locator('.pass-item').first();
  await expect(card.locator('.pass-summary-grid .pass-row')).toHaveCount(2);
  const start = await card.locator('.pass-summary-grid dd').first().innerText();
  await card.locator('summary').click();
  const elevation = card
    .locator('.pass-row')
    .filter({ has: page.locator('dt', { hasText: /^Current Elevation$/ }) })
    .locator('dd');
  const before = await elevation.innerText();
  expect(before).not.toBe('N/A');
  await page.clock.fastForward(60000);
  await expect(elevation).not.toHaveText(before);
  await expect(card.locator('.pass-summary-grid dd').first()).toHaveText(start);
});
