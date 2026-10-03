import { test, expect, setAppearance, prepare, openSidebar, LINE1, LINE2 } from './fixtures';
import type { Page } from '@playwright/test';

const freshTime = Date.parse('2024-02-29T12:30:00Z');
const alert = (page: Page) => page.locator('.status[data-slot="alert-root"]');
const title = (page: Page) => alert(page).locator('[data-slot="alert-title"]');
const description = (page: Page) => alert(page).locator('[data-slot="alert-description"]');
async function setup(page: Page, updatedAt?: Date) {
  await prepare(page, updatedAt);
  // These scenarios use only local fixtures, including typography resources.
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  );
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ body: '' }));
}

test('uses HeroUI while loading, clears the alert for fresh feeds and reuses the fresh catalog on reload', async ({
  page,
}) => {
  await setup(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests: string[] = [];
  await page.route('**/api/celestrak/elements?**', async (route) => {
    requests.push(route.request().url());
    await pending;
    await route.fallback();
  });
  try {
    await page.goto('/');
    await expect(alert(page)).toBeVisible();
    await expect(title(page)).toHaveText('Loading orbital data');
  } finally {
    release();
  }
  await expect(page.getByTestId('sat-count')).toContainText('visible from selected categories');
  await expect(alert(page)).toHaveCount(0, { timeout: 20000 });
  expect(requests.length).toBeGreaterThan(0);
  const fetched = requests.length;
  // Reload six days later, still inside the shared weekly refresh interval.
  await page.clock.setFixedTime(new Date(freshTime + 6 * 86400000));
  await page.reload();
  await expect(page.getByTestId('sat-count')).toContainText('visible from selected categories');
  await expect(alert(page)).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  expect(requests).toHaveLength(fetched);
});

test('a failed Weather feed produces a specific HeroUI warning while other satellites remain available', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/api/celestrak/elements?**', (route) => {
    const url = new URL(route.request().url());
    return url.searchParams.get('GROUP') === 'weather'
      ? route.fulfill({ status: 503, body: 'Weather fixture temporarily unavailable' })
      : route.fallback();
  });
  await page.goto('/');
  await expect(title(page)).toHaveText('Some orbital feeds are unavailable', { timeout: 20000 });
  await expect(alert(page)).toHaveClass(/\balert--warning\b/);
  await expect(description(page)).toContainText('Weather');
  await expect(description(page)).toContainText('HTTP 503');
  await expect(page.getByTestId('sat-count')).not.toHaveText('0 visible from selected categories');
  await expect(title(page)).not.toHaveText('Orbital data unavailable');
  const retry = alert(page).getByRole('button', { name: 'Retry', exact: true });
  await expect(retry).toHaveClass(/\bbutton--tertiary\b/);
  for (const mode of ['dark', 'light']) {
    if (mode === 'light') await setAppearance(page, 'light');
    const colors = await retry.evaluate((button) => ({
      action: getComputedStyle(button).color,
      neutral: getComputedStyle(document.body).color,
    }));
    expect(colors.action, `${mode} warning action should use neutral foreground`).toBe(
      colors.neutral,
    );
  }
  const dismiss = alert(page).getByRole('button', {
    name: 'Dismiss Some orbital feeds are unavailable',
    exact: true,
  });
  await dismiss.focus();
  await dismiss.press('Enter');
  await expect(alert(page)).toHaveCount(0);
});

test('an empty catalog after all feed failures produces a HeroUI danger alert', async ({
  page,
}) => {
  await setup(page);
  await page.route('**/api/celestrak/elements?**', (route) =>
    route.fulfill({ status: 503, body: 'Fixture unavailable' }),
  );
  await page.route('https://db.satnogs.org/**', (route) =>
    route.fulfill({ status: 503, body: 'Fixture fallback unavailable' }),
  );
  await page.goto('/');
  await expect(title(page)).toHaveText('Orbital data unavailable', { timeout: 20000 });
  await expect(alert(page)).toHaveClass(/\balert--danger\b/);
  await expect(page.getByTestId('sat-count')).toHaveText('0 visible from selected categories');
});

test('old TLE epochs are explained as outdated elements rather than unavailable feeds', async ({
  page,
}) => {
  await setup(page, new Date('2026-09-27T12:30:00Z'));
  await page.goto('/');
  await expect(title(page)).toHaveText('Some orbital elements are outdated', { timeout: 20000 });
  await expect(alert(page)).toHaveClass(/\balert--warning\b/);
  await expect(title(page)).not.toContainText('unavailable');
  await expect(description(page)).not.toContainText('HTTP');
  const cached = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('satapp_catalog_v2') || '[]'),
  );
  expect(cached).toHaveLength(7);
  expect(
    cached.every(
      (group: { savedAt: number }) => group.savedAt > Date.parse('2026-09-27T00:00:00Z'),
    ),
  ).toBe(true);
});

test('provider HTTP 403 permits bounded shared-cache reads and suppresses repeat reads across reloads', async ({
  page,
}) => {
  await setup(page);
  const requests: string[] = [];
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'celestrak.org') externalRequests.push(request.url());
  });
  let fallbackRequests = 0;
  await page.route('**/api/celestrak/elements?**', (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      status: 503,
      headers: {
        'X-Celestrak-Blocked-Until': new Date(freshTime + 3600000).toISOString(),
        'X-Celestrak-Next-Refresh-At': new Date(freshTime + 3600000).toISOString(),
        'X-Celestrak-Warning': 'CelesTrak rejected requests (HTTP 403)',
      },
      json: { error: 'CelesTrak rejected requests (HTTP 403)' },
    });
  });
  await page.route('https://db.satnogs.org/**', (route) => {
    if (new URL(route.request().url()).pathname.includes('/api/tle/')) {
      fallbackRequests++;
      return route.fulfill({ json: [{ tle0: 'ISS (ZARYA)', tle1: LINE1, tle2: LINE2 }] });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/');
  await expect(title(page)).toHaveText('CelesTrak temporarily blocked', { timeout: 20000 });
  await expect(alert(page)).toHaveClass(/\balert--warning\b/);
  await expect(description(page)).toContainText('HTTP 403');
  await expect(description(page)).toContainText(/paused|pause|until/i);
  await expect
    .poll(() => page.evaluate(() => Number(localStorage.getItem('satapp_celestrak_blocked_until'))))
    .toBeGreaterThan(freshTime);
  await expect(page.getByTestId('sat-count')).toHaveText('1 visible from selected categories');
  expect(fallbackRequests).toBeGreaterThan(0);
  expect(requests.length).toBeGreaterThan(0);
  // Other GROUP calls read OUR shared cache and may recover retained data even while
  // upstream is blocked. The backend tests enforce the provider's global stop queue.
  expect(requests.length).toBeLessThanOrEqual(6);
  expect(new Set(requests).size).toBe(requests.length);
  expect(externalRequests).toEqual([]);
  expect(requests.some((url) => new URL(url).searchParams.has('CATNR'))).toBe(false);
  const initialRequestCount = requests.length;
  await page.reload();
  await expect(title(page)).toHaveText('CelesTrak temporarily blocked');
  await expect(page.getByTestId('sat-count')).toHaveText('1 visible from selected categories');
  await page.waitForLoadState('networkidle');
  expect(requests).toHaveLength(initialRequestCount);
  expect(externalRequests).toEqual([]);
  await expect(description(page)).toContainText('HTTP 403');
});

test('dismissed catalog issue stays hidden across rerenders, background checks and reloads but new or recovered issues return', async ({
  page,
}) => {
  await page.clock.install({ time: new Date(freshTime) });
  await setup(page);
  let failedGroup: string | null = 'weather';
  let weatherRequests = 0;
  await page.route('**/api/celestrak/elements?**', (route) => {
    const group = new URL(route.request().url()).searchParams.get('GROUP');
    if (group === 'weather') weatherRequests++;
    return failedGroup !== null && group === failedGroup
      ? route.fulfill({ status: 503, body: 'Fixture feed unavailable' })
      : route.fallback();
  });
  await page.goto('/');
  await expect(title(page)).toHaveText('Some orbital feeds are unavailable', { timeout: 20000 });
  await expect(description(page)).toContainText('Weather');
  await alert(page)
    .getByRole('button', { name: 'Dismiss Some orbital feeds are unavailable', exact: true })
    .click();
  await expect(alert(page)).toHaveCount(0);
  await setAppearance(page, 'light');
  await expect(alert(page)).toHaveCount(0);

  const previousWeatherRequests = weatherRequests;
  // Trigger the existing hourly background check after the failure retry deadline.
  await page.clock.setFixedTime(new Date(freshTime + 3600000));
  await page.clock.fastForward(3600001);
  await expect.poll(() => weatherRequests).toBeGreaterThan(previousWeatherRequests);
  await expect(alert(page)).toHaveCount(0, { timeout: 20000 });
  await page.reload();
  await expect(page.getByTestId('sat-count')).toContainText('visible from selected categories');
  await expect(alert(page)).toHaveCount(0, { timeout: 20000 });

  const checkChangedFeeds = async () => {
    // Remove fixture cache entries so the next user-triggered check sees the changed scenario.
    await page.evaluate(() => {
      localStorage.removeItem('satapp_catalog_v2');
      localStorage.removeItem('satapp_celestrak_attempts_v1');
    });
    await openSidebar(page);
    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Check saved data', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Check saved data', exact: true })).toBeEnabled();
    const closeSidebar = page.getByRole('button', { name: 'Close sidebar', exact: true });
    if (await closeSidebar.isVisible()) await closeSidebar.click();
  };
  failedGroup = 'military';
  await checkChangedFeeds();
  await expect(title(page)).toHaveText('Some orbital feeds are unavailable', { timeout: 20000 });
  await expect(description(page)).toContainText('Military');
  await expect(description(page)).not.toContainText('Weather');
  await alert(page)
    .getByRole('button', { name: 'Dismiss Some orbital feeds are unavailable', exact: true })
    .click();
  await expect(alert(page)).toHaveCount(0);

  failedGroup = null;
  await checkChangedFeeds();
  await expect(alert(page)).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => sessionStorage.getItem('satapp_dismissed_catalog_issue_v1')))
    .toBeNull();
  failedGroup = 'military';
  await checkChangedFeeds();
  await expect(title(page)).toHaveText('Some orbital feeds are unavailable', { timeout: 20000 });
  await expect(description(page)).toContainText('Military');
});
