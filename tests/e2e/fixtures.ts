import { test, expect, type Page } from '@playwright/test';
export { test, expect };
export const LINE1 = '1 25544U 98067A   24060.51835648  .00016717  00000+0  30172-3 0  9993';
export const LINE2 = '2 25544  51.6416  70.5262 0005235  60.8206  44.0617 15.49815374441373';
const tle = (name: string, id: string) =>
  `${name}\n${LINE1.replace('25544', id)}\n${LINE2.replace('25544', id)}\n`;
export async function prepare(page: Page, updatedAt = new Date('2024-02-29T12:30:00Z')) {
  await page.clock.setFixedTime(updatedAt);
  // Browser traffic must use the shared server cache; never contact the provider in tests.
  await page.route('https://celestrak.org/**', (route) => route.abort('blockedbyclient'));
  // Cached response dates are fixed by the fixture, not evaluated in a document
  // that may be navigating away while the request is intercepted.
  const cacheHeaders = () => {
    const now = updatedAt.getTime();
    return {
      'X-Celestrak-Updated-At': new Date(now).toISOString(),
      'X-Celestrak-Next-Refresh-At': new Date(now + 7 * 86400000).toISOString(),
    };
  };
  await page.route('**/api/celestrak/elements?**', async (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get('CATNR');
    const group = url.searchParams.get('GROUP');
    const text = id
      ? tle(`FLTSATCOM ${id}`, id)
      : group === 'stations'
        ? tle('ISS (ZARYA)', '25544')
        : group === 'amateur'
          ? tle('AO-91', '43017')
          : group === 'starlink'
            ? tle('STARLINK-1000', '44713')
            : group === 'weather'
              ? tle('NOAA 19', '33591')
              : group === 'military'
                ? tle('USA 123', '24954')
                : tle('OPS 6391 (FLTSATCOM 1)', '10669') + tle('OTHER SAT', '12345');
    return route.fulfill({ contentType: 'text/plain', body: text, headers: cacheHeaders() });
  });
  await page.route('https://db.satnogs.org/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/celestrak/satcat?**', async (route) =>
    route.fulfill({
      headers: cacheHeaders(),
      json: [{ NORAD_CAT_ID: 25544, OBJECT_ID: '1998-067A', OPSTAT: '+', LAUNCH: '1998-11-20' }],
    }),
  );
  await page.route('**/api/sat/*/radio', (route) =>
    route.fulfill({
      json: {
        norad: 25544,
        satName: 'ISS',
        source: { satnogs: true },
        fetchedAt: '2024-02-29T12:30:00Z',
        status: { provider: 'none', lastReport: null, recentReportsCount: 0 },
        transmitters: [
          {
            id: 'test',
            source: 'TEST FIXTURE',
            label: 'FM Voice',
            typeHint: 'repeater',
            uplink: { low: 145990000, high: 145990000, unit: 'Hz' },
            downlink: { low: 437800000, high: 437800000, unit: 'Hz' },
            beacon: { low: null, high: null, unit: 'Hz' },
            mode: 'FM',
            callsign: 'ARISS',
            status: 'Active',
          },
        ],
      },
    }),
  );
  await page.route('https://photon.komoot.io/**', (route) =>
    route.fulfill({
      json: {
        features: [
          {
            geometry: { coordinates: [25.2797, 54.6872] },
            properties: { name: 'Vilnius', country: 'Lithuania' },
          },
        ],
      },
    }),
  );
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({ json: { elevation: [120] } }),
  );
  await page.route('https://tiles.maps.eox.at/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.route('https://tiles.openfreemap.org/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('.pbf')) {
      return route.fulfill({
        contentType: 'application/x-protobuf',
        body: Buffer.alloc(0),
      });
    }
    return route.fulfill({
      json: {
        tilejson: '3.0.0',
        tiles: ['https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf'],
        minzoom: 0,
        maxzoom: 14,
      },
    });
  });
}
export async function openSidebar(page: Page) {
  const button = page.getByRole('button', { name: 'Open sidebar', exact: true });
  if (await button.isVisible()) await button.click();
  await expect(page.locator('.sidebar-stack')).toHaveCSS('transform', 'none');
}
export function encoded(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export async function setAppearance(page: Page, mode: 'light' | 'dark') {
  const wasClosed = await page
    .getByRole('button', { name: 'Open sidebar', exact: true })
    .isVisible();
  const tab = await page.evaluate(
    () => JSON.parse(localStorage.getItem('satapp_view_v2') || '{}').tab || 'filters',
  );
  await openSidebar(page);
  await page.getByRole('tab', { name: 'Settings', exact: true }).last().click();
  const toggle = page.getByRole('switch', { name: 'Dark mode', exact: true });
  if ((await toggle.isChecked()) !== (mode === 'dark')) {
    await toggle.focus();
    await toggle.press('Space');
  }
  await page
    .getByRole('tab', { name: tab[0].toUpperCase() + tab.slice(1), exact: true })
    .last()
    .click();
  if (wasClosed) await page.getByRole('button', { name: 'Close sidebar', exact: true }).click();
}
