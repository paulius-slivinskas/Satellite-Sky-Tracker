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
  await expect.poll(async () => (await cards.first().boundingBox())!.x).toBeCloseTo(12, 0);
  await expect(cards.first()).toHaveCSS('border-radius', '24px');
  await expect(cards.first()).toHaveCSS('backdrop-filter', 'blur(8px)');
  await expect(cards.first()).toHaveCSS('opacity', '1');
  await expect(cards.first()).toHaveCSS('background-color', /\/\s*0\.2\)/);
  await expect(cards.first()).toHaveCSS('cursor', 'default');
  await expect(carousel).toHaveCSS('padding-bottom', '24px');
  const info = cards.first().getByRole('button', { name: 'Sat info', exact: true });
  if (mobile) {
    await expect(info).toBeVisible();
    await expect(info.locator('svg')).toHaveCount(0);
  } else await expect(info).toBeHidden();
  await expect(page.locator('.sidebar .pass-item')).toHaveCount(0);
  const bounds = await carousel.boundingBox();
  expect(bounds).not.toBeNull();
  if (mobile) {
    const nav = await page.locator('.mobile-bottom-nav').boundingBox();
    if (nav) expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(nav.y);
    const controls = await page.locator('.map-controls').boundingBox();
    if (controls) expect(controls.y + controls.height).toBeLessThan(bounds!.y);
    await expect(carousel).toHaveCSS('scroll-snap-type', 'x mandatory');
    await expect(cards.first().locator('..')).toHaveCSS('scroll-snap-stop', 'always');
    const touch = await page.context().newCDPSession(page);
    const y = bounds!.y + 36;
    const start = page.viewportSize()!.width - 30;
    const step = (await cards.first().boundingBox())!.width + 12;
    for (let index = 1; index <= 2; index++) {
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: start, y }],
      });
      for (let move = 1; move <= 5; move++) {
        await touch.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: start - ((start - 40) * move) / 5, y }],
        });
        await page.waitForTimeout(16);
      }
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect
        .poll(() => carousel.evaluate((el) => el.scrollLeft))
        .toBeCloseTo(step * index, 0);
      await expect(page.locator('.sat-info-panel')).toHaveCount(0);
    }
    await touch.detach();
    await carousel.evaluate((el) => {
      el.scrollLeft = 0;
    });
  } else {
    expect(bounds!.x).toBe(0);
    expect(bounds!.width).toBe(page.viewportSize()!.width);
    const controls = await page.locator('.map-controls').boundingBox();
    expect(controls!.y + controls!.height).toBeLessThan(bounds!.y);
    const location = await page.locator('.sidebar-location').boundingBox();
    const sidebar = await page.locator('.sidebar-main').boundingBox();
    expect(location!.y - (sidebar!.y + sidebar!.height)).toBeCloseTo(12, 0);
    expect(location!.y + location!.height).toBeLessThan(bounds!.y);
    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    const timeSidebar = await page.locator('.sidebar-main').boundingBox();
    const timeLocation = await page.locator('.sidebar-location').boundingBox();
    expect(timeLocation!.y - (timeSidebar!.y + timeSidebar!.height)).toBeCloseTo(12, 0);
    expect(timeLocation!.y + timeLocation!.height).toBeLessThan(page.viewportSize()!.height - 12);
    await page.getByRole('tab', { name: 'Passes', exact: true }).click();
    const first = await cards.first().locator('.pass-header').boundingBox();
    await page.mouse.move(first!.x + first!.width - 20, first!.y + first!.height / 2);
    await page.mouse.down();
    await page.mouse.move(first!.x + 20, first!.y + first!.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => carousel.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
    await expect(page.locator('.sat-info-panel')).toHaveCount(0);
    await carousel.evaluate((el) => {
      el.scrollLeft = 0;
    });
  }
  expect(await carousel.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await cards.first().getByRole('button', { name: 'More', exact: true }).click();
  await expect(cards.first().getByRole('button', { name: 'Navigate', exact: true })).toBeVisible();
  await expect(cards.first().getByRole('button', { name: 'Less', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await cards.first().getByRole('button', { name: 'Less', exact: true }).click();
  await cards.first().locator('.pass-header').click();
  await expect(page.locator('#map')).toHaveAttribute('data-active-pass', '0');
  if (mobile) {
    await expect(page.locator('.sat-info-panel')).toHaveCount(0);
    await expect(carousel).toBeVisible();
    await info.click();
    await expect(page.locator('.sat-info-panel')).toBeVisible();
    await expect(page.locator('#map')).toHaveAttribute('data-active-pass', '0');
  }
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
  await expect
    .poll(async () => {
      const last = (await cards.last().boundingBox())!;
      return page.viewportSize()!.width - last.x - last.width;
    })
    .toBeCloseTo(12, 0);
  await page.screenshot({ path: `/tmp/pass-carousel-map-${testInfo.project.name}.png` });
  if (mobile) await cards.last().getByRole('button', { name: 'Sat info', exact: true }).click();
  else await cards.last().locator('.pass-header').click();
  await expect(page.locator('.sat-info-panel')).toBeVisible();
  await page.screenshot({ path: `/tmp/pass-carousel-${testInfo.project.name}.png` });
});
