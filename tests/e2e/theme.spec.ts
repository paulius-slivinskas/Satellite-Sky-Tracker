import { test, expect, setAppearance, prepare, openSidebar, encoded } from './fixtures';

const shared = {
  version: 2,
  tab: 'filters',
  categories: ['iss'],
  playing: false,
  simulatedTimeMs: Date.parse('2024-02-29T12:30:00Z'),
  map: { lat: 54.6, lon: 25.2, zoom: 4 },
};

test('theme changes the visible panel, persists on reload, and keeps the map view', async ({
  page,
}) => {
  await prepare(page);
  const pageErrors: string[] = [];
  const mapErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /worker|maplibre|openfreemap|\.pbf|\.js/i.test(message.text())
    ) {
      mapErrors.push(message.text());
    }
  });
  // Vector tile fetching happens in MapLibre's real worker. Watching the canvas or
  // theme alone misses a broken production worker bundle that paints only background.
  const vectorTileLoaded = () =>
    page.waitForResponse(
      (response) =>
        /^https:\/\/tiles\.openfreemap\.org\/test\/.*\.pbf$/.test(response.url()) && response.ok(),
      { timeout: 20000 },
    );
  const firstTile = vectorTileLoaded();
  await Promise.all([page.goto(`/?view=${encoded(shared)}`), firstTile]);
  expect(await (await firstTile).finished()).toBeNull();
  expect(pageErrors).toEqual([]);
  expect(mapErrors).toEqual([]);
  await openSidebar(page);
  const root = page.locator('html');
  await expect(root).toHaveClass(/\bdark\b/);
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2') || '{}').map))
    .toBeTruthy();
  const beforeMap = await page.evaluate(
    () => JSON.parse(localStorage.getItem('satapp_view_v2')!).map,
  );
  // Mobile panels are transparent over sidebar-stack; inspect the first painted background.
  const panelBackground = () =>
    page.locator('.sidebar-main').evaluate((element) => {
      for (let current: Element | null = element; current; current = current.parentElement) {
        const color = getComputedStyle(current).backgroundColor;
        if (color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') return color;
      }
      return 'transparent';
    });
  const darkBackground = await panelBackground();
  await setAppearance(page, 'light');
  await expect(root).toHaveClass(/\blight\b/);
  await expect(root).not.toHaveClass(/\bdark\b/);
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect.poll(panelBackground).not.toBe(darkBackground);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('satapp_theme'))).toBe('light');

  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2')!).map),
  ).toEqual(beforeMap);

  const reloadedTile = vectorTileLoaded();
  await Promise.all([page.reload(), reloadedTile]);
  expect(await (await reloadedTile).finished()).toBeNull();
  await openSidebar(page);
  await expect(root).toHaveClass(/\blight\b/);
  await expect(root).toHaveAttribute('data-theme', 'light');

  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2') || '{}').map))
    .toEqual(beforeMap);
  await setAppearance(page, 'dark');
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect.poll(panelBackground).toBe(darkBackground);
  expect(pageErrors).toEqual([]);
  expect(mapErrors).toEqual([]);
});
