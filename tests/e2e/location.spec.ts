import { test, expect, prepare, openSidebar } from './fixtures';
import type { Page } from '@playwright/test';

const photon = /https:\/\/photon\.komoot\.io\/api\/.*/;
const elevations = /https:\/\/api\.open-meteo\.com\/v1\/elevation.*/;
const feature = (name: string, lat: number, lon: number) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { name },
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function openLocation(page: Page) {
  await page.goto('/');
  await openSidebar(page);
  await page.locator('.location-trigger').click();
  return page.getByRole('combobox', { name: 'Location', exact: true });
}

test('location search commits a selected place and exposes editable coordinates', async ({
  page,
}) => {
  await prepare(page);
  await page.route(photon, (route) =>
    route.fulfill({ json: { features: [feature('Vilnius, Lithuania', 54.6872, 25.2797)] } }),
  );
  await page.route(elevations, (route) => route.fulfill({ json: { elevation: [112.4] } }));
  const search = await openLocation(page);
  await search.fill('Vilnius');
  await page.getByRole('option', { name: 'Vilnius, Lithuania', exact: true }).click();
  await expect(search).toHaveValue('Vilnius, Lithuania');
  await expect(page.getByRole('spinbutton', { name: 'Latitude', exact: true })).toHaveValue(
    '54.6872',
  );
  await expect(page.getByRole('spinbutton', { name: 'Longitude', exact: true })).toHaveValue(
    '25.2797',
  );
  await expect(page.getByRole('spinbutton', { name: 'Altitude (m)', exact: true })).toHaveValue(
    '112',
  );
  await expect(page.locator('.location-trigger')).toContainText('Vilnius, Lithuania');
  await expect(page.locator('.location-trigger')).toContainText('112 m above sea level');
  // A second search must still be editable after committing a selection.
  await search.fill('Viln');
  await expect(page.getByRole('option', { name: 'Vilnius, Lithuania', exact: true })).toBeVisible();
  await search.press('Escape');
  await expect(page.getByRole('option', { name: 'Vilnius, Lithuania', exact: true })).toHaveCount(
    0,
  );
});

test('late results for an earlier location query do not replace the current results', async ({
  page,
}) => {
  await prepare(page);
  const oldStarted = deferred();
  const releaseOld = deferred();
  const oldFinished = deferred();
  await page.route(photon, async (route) => {
    const query = new URL(route.request().url()).searchParams.get('q');
    if (query === 'Vilnius') {
      oldStarted.resolve();
      await releaseOld.promise;
      try {
        await route.fulfill({
          json: { features: [feature('Vilnius, Lithuania', 54.6872, 25.2797)] },
        });
      } catch {
        /* An aborted request cannot deliver its stale response. */
      } finally {
        oldFinished.resolve();
      }
    } else {
      await route.fulfill({ json: { features: [feature('Berlin, Germany', 52.52, 13.405)] } });
    }
  });
  const search = await openLocation(page);
  await search.fill('Vilnius');
  await oldStarted.promise;
  await search.fill('Berlin');
  await expect(page.getByRole('option', { name: 'Berlin, Germany', exact: true })).toBeVisible();
  releaseOld.resolve();
  await oldFinished.promise;
  await expect(search).toHaveValue('Berlin');
  await expect(page.getByRole('option', { name: 'Berlin, Germany', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Vilnius, Lithuania', exact: true })).toHaveCount(
    0,
  );
});

test('manual altitude survives an in-flight elevation result and Apply', async ({ page }) => {
  await prepare(page);
  const elevationStarted = deferred();
  const releaseElevation = deferred();
  const elevationFinished = deferred();
  await page.route(photon, (route) =>
    route.fulfill({ json: { features: [feature('Vilnius, Lithuania', 54.6872, 25.2797)] } }),
  );
  await page.route(elevations, async (route) => {
    elevationStarted.resolve();
    await releaseElevation.promise;
    try {
      await route.fulfill({ json: { elevation: [112] } });
    } catch {
      /* Manual edits cancel automatic elevation lookup. */
    } finally {
      elevationFinished.resolve();
    }
  });
  const search = await openLocation(page);
  await search.fill('Vilnius');
  await page.getByRole('option', { name: 'Vilnius, Lithuania', exact: true }).click();
  await elevationStarted.promise;
  const altitude = page.getByRole('spinbutton', { name: 'Altitude (m)', exact: true });
  await altitude.fill('245');
  releaseElevation.resolve();
  await elevationFinished.promise;
  await expect(altitude).toHaveValue('245');
  await page.getByRole('button', { name: 'Apply location', exact: true }).click();
  await expect(altitude).toHaveValue('245');
  await expect(page.locator('.location-trigger')).toContainText('245 m above sea level');
});

test('mobile observer control stays reachable while the sidebar scrolls and the form fits a short screen', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'Touch interaction is verified in the mobile project.');
  await page.setViewportSize({ width: 390, height: 600 });
  await prepare(page);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 54.6872, longitude: 25.2797 });
  await page.goto('/');
  await openSidebar(page);
  const trigger = page.getByRole('button', { name: 'Observer location', exact: true });
  await expect(trigger).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.sidebar-stack')).toHaveCSS('transform', 'none');
  const before = (await trigger.boundingBox())!;
  expect(before.y).toBeGreaterThanOrEqual(60);
  await page.locator('.sidebar-stack').evaluate((el) => {
    el.scrollTop = 500;
  });
  await expect.poll(async () => (await trigger.boundingBox())!.y).toBe(before.y);
  expect(
    await trigger.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }),
  ).toBe(true);
  await trigger.click();
  await expect(page.getByRole('combobox', { name: 'Location', exact: true })).toBeInViewport({
    ratio: 1,
  });
  const useLocation = page.getByRole('button', { name: 'Use my location', exact: true });
  await expect(useLocation).toBeInViewport({ ratio: 1 });
  await useLocation.tap();
  await expect(page.getByRole('combobox', { name: 'Location', exact: true })).toHaveValue(
    'Current location',
  );
  await expect(page.getByRole('spinbutton', { name: 'Latitude', exact: true })).toHaveValue(
    '54.6872',
  );
  await expect(page.locator('.location-trigger')).toContainText('Current location');
  await expect(page.getByRole('button', { name: 'Close sidebar', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await page.screenshot({
    path: testInfo.outputPath('mobile-location-access.png'),
    animations: 'disabled',
  });
});
