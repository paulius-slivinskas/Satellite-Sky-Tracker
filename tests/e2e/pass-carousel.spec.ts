import { test, expect, prepare, encoded } from './fixtures';

test('map carousel scrolls, keeps actions, and highlights hovered passes over a pinned selection', async ({
  page,
}, testInfo) => {
  await prepare(page);
  await page.goto(
    `/?view=${encoded({ version: 2, tab: 'passes', categories: ['iss'], playing: false, simulatedTimeMs: Date.parse('2024-02-29T12:30:00Z'), passRange: '3', passWatchlist: ['25544'], observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' } })}`,
  );
  const mobile = !!testInfo.project.use.hasTouch;
  const carousel = page.getByRole('region', { name: 'Upcoming passes' });
  const cards = carousel.locator('.pass-item');
  await expect(cards.first()).toBeAttached();
  if (
    mobile &&
    (await page.getByRole('button', { name: 'Close sidebar', exact: true }).isVisible())
  )
    await page.getByRole('button', { name: 'Close sidebar', exact: true }).click();
  await expect(carousel).toBeVisible();
  await expect(page.locator('.sidebar .pass-item')).toHaveCount(0);
  const bounds = await carousel.boundingBox();
  expect(bounds).not.toBeNull();
  if (mobile) {
    const nav = await page.locator('.mobile-bottom-nav').boundingBox();
    if (nav) expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(nav.y);
    const controls = await page.locator('.map-controls').boundingBox();
    if (controls) expect(controls.y + controls.height).toBeLessThan(bounds!.y);
  } else {
    expect(bounds!.x).toBeGreaterThanOrEqual(380);
  }
  expect(await carousel.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await cards.first().getByRole('button', { name: 'More', exact: true }).click();
  await expect(cards.first().getByRole('button', { name: 'Navigate', exact: true })).toBeVisible();
  await cards.first().getByRole('button', { name: 'More', exact: true }).click();
  await cards.first().locator('.pass-header').click();
  await expect(page.locator('#map')).toHaveAttribute('data-active-pass', '0');
  await page.getByRole('button', { name: 'Close satellite details', exact: true }).click();
  if (!mobile) {
    await cards.nth(1).hover();
    await expect(page.locator('#map')).toHaveAttribute('data-active-pass', '1');
    await page.locator('.sidebar-main').hover();
    await expect(page.locator('#map')).toHaveAttribute('data-active-pass', '0');
  }
  await carousel.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await expect.poll(() => carousel.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  await page.screenshot({ path: `/tmp/pass-carousel-map-${testInfo.project.name}.png` });
  await cards.last().getByRole('button', { name: 'Sat details', exact: true }).click();
  await expect(page.locator('.sat-info-panel')).toBeVisible();
  await page.screenshot({ path: `/tmp/pass-carousel-${testInfo.project.name}.png` });
});
