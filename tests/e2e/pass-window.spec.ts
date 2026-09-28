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
  await expect(row('Max Elevation')).toHaveText('5.4°');
  const start = Number(await cards.getAttribute('data-pass-start'));
  expect(anchor + 3 * 3600000 - start).toBeGreaterThan(8000);
  expect(anchor + 3 * 3600000 - start).toBeLessThan(10000);
  await expect(page.locator('#map')).toHaveAttribute('data-pass-count', '1');
});
