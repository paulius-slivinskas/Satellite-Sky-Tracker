import { test, expect, prepare, openSidebar, encoded } from './fixtures';

const shared = {
  version: 2,
  categories: ['iss'],
  playing: false,
  simulatedTimeMs: Date.parse('2024-02-29T12:30:00Z'),
  map: { lat: 54.6, lon: 25.2, zoom: 4 },
};

test('map layers switch, fetch satellite imagery, survive a theme change and persist', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await prepare(page);
  await page.goto(`/?view=${encoded(shared)}`);
  const picker = page.getByRole('button', { name: 'Choose map layer', exact: true });
  await expect(picker).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2') || '{}').map))
    .toBeTruthy();
  const beforeMap = await page.evaluate(
    () => JSON.parse(localStorage.getItem('satapp_view_v2')!).map,
  );
  await picker.click();
  await expect(page.getByRole('button', { name: 'Minimal', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Atlas', exact: true })).not.toBeVisible();

  for (const layer of ['Atlas', 'Blueprint', 'Satellite']) {
    await picker.click();
    const imagery =
      layer === 'Satellite'
        ? page.waitForResponse(
            (response) =>
              response.url().startsWith('https://tiles.maps.eox.at/') &&
              /\.jpg(?:\?|$)/.test(response.url()) &&
              response.ok(),
            { timeout: 20000 },
          )
        : null;
    await page.getByRole('button', { name: layer, exact: true }).click();
    if (imagery) expect(await (await imagery).finished()).toBeNull();
    await expect(page.getByRole('button', { name: layer, exact: true })).not.toBeVisible();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('satapp_map_layer')))
      .toBe(layer.toLowerCase());
    await picker.click();
    await expect(page.getByRole('button', { name: layer, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => localStorage.getItem('satapp_map_layer'))).toBe('satellite');
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2')!).map),
  ).toEqual(beforeMap);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await picker.click();
  await expect(page.getByRole('button', { name: 'Satellite', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2') || '{}').map))
    .toEqual(beforeMap);
  await page.getByRole('button', { name: 'Minimal', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('satapp_map_layer')))
    .toBe('minimal');
  expect(errors).toEqual([]);
});

test('map picker stays above zoom controls and clear of the satellite details panel', async ({
  page,
}) => {
  await prepare(page);
  await page.goto(`/?view=${encoded(shared)}`);
  const picker = page.getByRole('button', { name: 'Choose map layer', exact: true });
  const zoom = page.getByRole('button', { name: 'Zoom in', exact: true });
  await expect(picker).toBeVisible();
  await expect(zoom).toBeVisible();
  const controls = [
    page.getByRole('button', { name: 'Switch to light mode', exact: true }),
    picker,
    page.getByRole('button', { name: 'Enable phone heading', exact: true }),
    zoom,
    page.getByRole('button', { name: 'Zoom out', exact: true }),
  ];
  const boxes = await Promise.all(controls.map((control) => control.boundingBox()));
  for (let i = 0; i < boxes.length; i++) {
    expect(boxes[i]!.width).toBe(44);
    expect(boxes[i]!.height).toBe(44);
    expect(boxes[i]!.x).toBe(boxes[0]!.x);
    if (i) expect(boxes[i]!.y - boxes[i - 1]!.y - boxes[i - 1]!.height).toBe(8);
  }
  const before = (await picker.boundingBox())!;
  const zoomBefore = (await zoom.boundingBox())!;
  expect(before.y + before.height).toBeLessThanOrEqual(zoomBefore.y);
  await openSidebar(page);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search satellites', exact: true }).fill('25544');
  await page.getByRole('button', { name: /Show ISS/ }).click();
  const panel = page.getByRole('complementary', { name: 'ISS satellite details' });
  await expect(panel).toBeVisible();
  const viewport = page.viewportSize()!;
  const panelBounds = (await panel.boundingBox())!;
  if (viewport.width <= 1100) {
    await expect(picker).toBeHidden();
    await expect(zoom).toBeHidden();
    await page.getByRole('button', { name: 'Close satellite details', exact: true }).click();
    await expect(panel).toHaveCount(0);
  }
  await expect(picker).toBeVisible();
  await expect(zoom).toBeVisible();
  const bounds = (await picker.boundingBox())!;
  const zoomBounds = (await zoom.boundingBox())!;
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(zoomBounds.y);
  const overlapWidth =
    Math.min(bounds.x + bounds.width, panelBounds.x + panelBounds.width) -
    Math.max(bounds.x, panelBounds.x);
  const overlapHeight =
    Math.min(bounds.y + bounds.height, panelBounds.y + panelBounds.height) -
    Math.max(bounds.y, panelBounds.y);
  if (viewport.width > 1100) expect(overlapWidth <= 0 || overlapHeight <= 0).toBe(true);
  expect(
    await picker.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
      );
    }),
  ).toBe(true);
  await picker.click();
  const options = page.getByRole('button', { name: 'Satellite', exact: true });
  await expect(options).toBeVisible();
  const optionBounds = (await options.boundingBox())!;
  expect(optionBounds.x).toBeGreaterThanOrEqual(0);
  expect(optionBounds.y).toBeGreaterThanOrEqual(0);
  expect(optionBounds.x + optionBounds.width).toBeLessThanOrEqual(viewport.width);
  expect(optionBounds.y + optionBounds.height).toBeLessThanOrEqual(viewport.height);
});
