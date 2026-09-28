import { test, expect, prepare, encoded } from './fixtures';
import type { Page } from '@playwright/test';

async function assertCovered(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('satapp_view_v2') ?? '{}');
        if (!saved.map) return false;
        const { lat, zoom } = saved.map;
        const size = document.querySelector('#map')!.getBoundingClientRect();
        const world = 256 * 2 ** zoom;
        const radians = (lat * Math.PI) / 180;
        const y = ((1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2) * world;
        return y - size.height / 2 >= -0.5 && y + size.height / 2 <= world + 0.5;
      }),
    )
    .toBe(true);
}

test('zoom out and vertical drags keep the world covering the viewport, including resize', async ({
  page,
}) => {
  await prepare(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `/?view=${encoded({ version: 2, playing: false, categories: [], map: { lat: 80, lon: 25, zoom: 0 } })}`,
  );
  await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeAttached();
  const close = page.getByRole('button', { name: 'Close sidebar', exact: true });
  if (await close.isVisible()) await close.click();
  await assertCovered(page);
  await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeDisabled();
  for (const direction of [-1, 1]) {
    const box = (await page.locator('#map').boundingBox())!;
    const x = box.x + box.width * 0.55,
      y = box.y + box.height * 0.5;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + direction * box.height * 0.4, { steps: 12 });
    await page.mouse.up();
    await assertCovered(page);
  }
  await page.setViewportSize({ width: 900, height: 1300 });
  if (await close.isVisible()) await close.click();
  await assertCovered(page);
  await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Zoom out', exact: true })).toBeEnabled();
  await assertCovered(page);
  expect(errors).toEqual([]);
});
