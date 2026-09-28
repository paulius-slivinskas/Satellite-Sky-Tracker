import { test, expect, prepare, openSidebar, encoded, LINE1, LINE2 } from './fixtures';
import type { Page } from '@playwright/test';

const anchor = Date.parse('2024-02-29T12:30:00Z');
const initial = {
  version: 2,
  tab: 'passes',
  categories: [],
  playing: false,
  simulatedTimeMs: anchor,
  observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' },
  passWatchlist: [] as string[],
  passRange: 'upcoming3',
  showPassesOnMap: true,
};
async function setup(page: Page) {
  await prepare(page);
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  );
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ body: '' }));
  // A different mean anomaly gives the second fixture distinct, interleaved pass times.
  await page.route('**/api/celestrak/elements?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('GROUP') !== 'amateur')
      return route.fallback();
    return route.fulfill({
      contentType: 'text/plain',
      headers: {
        'X-Celestrak-Updated-At': new Date(anchor).toISOString(),
        'X-Celestrak-Next-Refresh-At': new Date(anchor + 7 * 86400000).toISOString(),
      },
      body: `AO-91\n${LINE1.replace('25544', '43017')}\n${LINE2.replace('25544', '43017').replace('44.0617', '84.0617')}\n`,
    });
  });
}
const savedList = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2') || '{}').passWatchlist);
async function openSelection(page: Page) {
  await page.getByRole('button', { name: 'Satellite selection', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Satellite selection', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function addPair(page: Page) {
  const dialog = await openSelection(page);
  const categories = dialog.getByRole('group', { name: 'Satellite categories' });
  await categories.getByRole('button', { name: 'ISS', exact: true }).click();
  await expect(categories.getByRole('button', { name: 'ISS', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const iss = dialog.getByRole('checkbox', { name: 'ISS (25544)', exact: true });
  await iss.locator('xpath=ancestor::label').click();
  await expect(iss).toBeChecked();
  // Exercise the native keyboard path too, retaining ISS in the final draft.
  await iss.focus();
  await iss.press('Space');
  await expect(iss).not.toBeChecked();
  await iss.press('Space');
  await expect(iss).toBeChecked();
  await categories.getByRole('button', { name: 'Amateur Radio', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Search satellites', exact: true }).fill('43017');
  const amateur = dialog.getByRole('checkbox', { name: 'AO-91 (43017)', exact: true });
  await amateur.locator('xpath=ancestor::label').click();
  await expect(amateur).toBeChecked();
  const bucket = dialog.getByRole('region', { name: 'Selected satellites' });
  await expect(bucket.getByRole('button', { name: 'Remove ISS', exact: true })).toBeVisible();
  await expect(bucket.getByRole('button', { name: 'Remove AO-91', exact: true })).toBeVisible();
  return dialog;
}

test('watchlist category/search selection is transactional, removable, clearable and persistent', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setup(page);
  await page.goto(`/?view=${encoded(initial)}`);
  await openSidebar(page);
  let dialog = await addPair(page);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => savedList(page)).toEqual([]);
  await expect(page.locator('.pass-item')).toHaveCount(0);

  dialog = await addPair(page);
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(() => savedList(page)).toEqual(['25544', '43017']);
  await expect(page.locator('.pass-item')).toHaveCount(3, { timeout: 20000 });
  // Remove the initial empty-list URL so it cannot override the persisted preference.
  await page.evaluate(() => history.replaceState(null, '', '/'));
  await page.reload();
  await openSidebar(page);
  await expect.poll(() => savedList(page)).toEqual(['25544', '43017']);
  dialog = await openSelection(page);
  await dialog.getByRole('button', { name: 'Remove ISS', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => savedList(page)).toEqual(['25544', '43017']);
  dialog = await openSelection(page);
  await dialog.getByRole('button', { name: 'Remove ISS', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(() => savedList(page)).toEqual(['43017']);
  dialog = await openSelection(page);
  await dialog.getByRole('button', { name: 'Clear list', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => savedList(page)).toEqual(['43017']);
  dialog = await openSelection(page);
  await dialog.getByRole('button', { name: 'Clear list', exact: true }).click();
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect.poll(() => savedList(page)).toEqual([]);
  await expect(page.locator('.pass-item')).toHaveCount(0);
  await expect(page.locator('#map')).toHaveAttribute('data-pass-count', '0');
  expect(errors).toEqual([]);
});

for (const [range, count] of [
  ['upcoming3', 3],
  ['upcoming5', 5],
] as const) {
  test(`${range} is a global chronological total for both satellites independent of Filters`, async ({
    page,
  }) => {
    await setup(page);
    await page.goto(
      `/?view=${encoded({ ...initial, passWatchlist: ['25544', '43017'], passRange: range, selectedNorad: '33591' })}`,
    );
    await openSidebar(page);
    // The catalog publishes partial groups while loading. Wait for the final
    // snapshot before inspecting the combined worker result.
    await expect(page.locator('.status')).toHaveCount(0, { timeout: 20000 });
    const cards = page.locator('.pass-item');
    await expect(cards).toHaveCount(count, { timeout: 20000 });
    await expect
      .poll(() =>
        cards.evaluateAll((elements) =>
          [...new Set(elements.map((element) => element.getAttribute('data-norad')))].sort(),
        ),
      )
      .toEqual(['25544', '43017']);
    const entries = await cards.evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.getAttribute('data-norad'),
        start: Number(element.getAttribute('data-pass-start')),
      })),
    );
    expect([...new Set(entries.map((entry) => entry.id))].sort()).toEqual(['25544', '43017']);
    expect(entries.map((entry) => entry.start)).toEqual(
      entries.map((entry) => entry.start).sort((a, b) => a - b),
    );
    expect(entries.every((entry) => entry.start >= anchor)).toBe(true);
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2')!).categories),
    ).toEqual([]);
    await expect(page.locator('#map')).toHaveAttribute('data-pass-count', String(count));
    await expect
      .poll(async () => {
        const plotted = ((await page.locator('#map').getAttribute('data-pass-satellites')) ?? '')
          .split(' ')
          .filter(Boolean);
        return [...new Set(plotted)].sort();
      })
      .toEqual(['25544', '43017']);
    for (const id of ['25544', '43017']) {
      await expect
        .poll(() => page.locator(`#map .pass-label-content[data-norad="${id}"]`).count())
        .toBeGreaterThan(0);
    }
    await expect(
      cards.locator('[data-slot="card-title"]').filter({ hasText: 'ISS' }).first(),
    ).toBeVisible();
    await expect(
      cards.locator('[data-slot="card-title"]').filter({ hasText: 'AO-91' }).first(),
    ).toBeVisible();
  });
}

test('day ranges preserve full overlapping passes and an explicitly empty shared watchlist overrides legacy selection', async ({
  page,
}) => {
  await setup(page);
  const from = Date.parse('2024-02-29T18:23:00Z');
  await page.goto(
    `/?view=${encoded({ ...initial, simulatedTimeMs: from, passWatchlist: ['25544', '43017'], passRange: '1' })}`,
  );
  await openSidebar(page);
  await expect.poll(() => page.locator('.pass-item').count()).toBeGreaterThan(3);
  const starts = await page
    .locator('.pass-item')
    .evaluateAll((elements) =>
      elements.map((element) => Number(element.getAttribute('data-pass-start'))),
    );
  const ends = await page
    .locator('.pass-item')
    .evaluateAll((elements) =>
      elements.map((element) => Number(element.getAttribute('data-pass-end'))),
    );
  expect(starts.every((start, index) => start < from + 86400000 && ends[index] > from)).toBe(true);
  expect(starts.some((start) => start < from)).toBe(true); // Already ongoing: retain its real rise.
  expect(starts).toEqual([...starts].sort((a, b) => a - b));
  await page.goto(`/?view=${encoded({ ...initial, passNorad: '25544', passWatchlist: [] })}`);
  await openSidebar(page);
  await expect.poll(() => savedList(page)).toEqual([]);
  await expect(page.locator('.pass-item')).toHaveCount(0);
});

test('sharing a different map selection preserves the explicit multi-satellite watchlist', async ({
  page,
}) => {
  await setup(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as typeof window & { __sharedUrl?: string }).__sharedUrl = value;
        },
      },
    });
  });
  await page.goto(
    `/?view=${encoded({ ...initial, passWatchlist: ['25544', '43017'], passRange: 'upcoming5' })}`,
  );
  await openSidebar(page);
  await expect(page.locator('.pass-item')).toHaveCount(5, { timeout: 20000 });
  await page.getByRole('tab', { name: 'Filters', exact: true }).click();
  await page.getByRole('combobox', { name: 'Smart Search' }).fill('33591');
  await page.getByRole('option', { name: /NOAA 19/ }).click();
  await page.getByRole('button', { name: 'Copy share link', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as typeof window & { __sharedUrl?: string }).__sharedUrl),
    )
    .toBeTruthy();
  const url = await page.evaluate(
    () => (window as typeof window & { __sharedUrl?: string }).__sharedUrl!,
  );
  const payload = JSON.parse(
    Buffer.from(new URL(url).searchParams.get('view')!, 'base64url').toString('utf8'),
  );
  expect(payload.passWatchlist).toEqual(['25544', '43017']);
  expect(payload.selectedNorad).toBe('33591');
  await expect(page.locator('#map')).toHaveAttribute('data-pass-count', '5');
  await page.goto(url);
  await openSidebar(page);
  await page.getByRole('tab', { name: 'Passes', exact: true }).click();
  await expect(page.locator('.pass-item')).toHaveCount(5, { timeout: 20000 });
  await expect.poll(() => savedList(page)).toEqual(['25544', '43017']);
});

test('removing a focused unavailable satellite keeps Escape dismissal and cancels the draft', async ({
  page,
}) => {
  await setup(page);
  await page.goto(`/?view=${encoded({ ...initial, passWatchlist: ['99999', '25544'] })}`);
  await openSidebar(page);
  const dialog = await openSelection(page);
  const remove = dialog.getByRole('button', { name: 'Remove NORAD 99999', exact: true });
  await remove.focus();
  await remove.click();
  await expect(remove).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => savedList(page)).toEqual(['99999', '25544']);
  const reopened = await openSelection(page);
  await expect(
    reopened.getByRole('button', { name: 'Remove NORAD 99999', exact: true }),
  ).toBeVisible();
});
