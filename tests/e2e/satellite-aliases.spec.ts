import { test, expect, prepare, openSidebar, LINE1, LINE2 } from './fixtures';

test('aliases are searchable and visible in Smart Search, details and pass selection', async ({
  page,
}, testInfo) => {
  await prepare(page);
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  );
  const entries = [
    ['27607', 'SAUDISAT 1C (SO-50)', 'SO-50'],
    ['61781', 'ASRTU-1 (AO-123)', 'AO-123 / ASRTU-1'],
    ['43017', 'RADFXSAT (FOX-1B)', 'AO-91'],
    ['40908', 'LILACSAT-2', 'CAS-3H / LilacSat-2'],
  ];
  await page.route('**/api/celestrak/elements?**', (route) => {
    if (new URL(route.request().url()).searchParams.get('GROUP') !== 'amateur')
      return route.fallback();
    return route.fulfill({
      contentType: 'text/plain',
      body: entries
        .map(
          ([id, name]) => `${name}\n${LINE1.replace('25544', id)}\n${LINE2.replace('25544', id)}\n`,
        )
        .join(''),
    });
  });
  await page.goto('/');
  await openSidebar(page);
  const search = page.getByRole('combobox', { name: 'Search' });
  for (const [id, name, query] of entries) {
    await search.fill(query);
    const option = page.getByRole('option').filter({ hasText: name });
    await expect(option).toHaveCount(1);
    await expect(option).toContainText(`#${id}`);
  }
  await search.fill('AO-91');
  const ao91 = page.getByRole('option').filter({ hasText: 'RADFXSAT (FOX-1B)' });
  await expect(ao91).toContainText('Also known as: AO-91');
  await page.screenshot({ path: testInfo.outputPath('alias-search.png') });
  await ao91.click();
  const details = page.getByRole('complementary', { name: 'RADFXSAT (FOX-1B) satellite details' });
  await expect(details).toContainText('Also known as: AO-91');
  await page.getByRole('button', { name: 'Close satellite details' }).click();
  await openSidebar(page);
  await page.getByRole('tab', { name: 'Passes', exact: true }).click();
  await page.getByRole('button', { name: 'Satellite selection', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Satellite selection', exact: true });
  const input = dialog.getByRole('textbox', { name: 'Search satellites', exact: true });
  for (const [id, name, query] of entries) {
    await input.fill(query);
    await expect(
      dialog.getByRole('checkbox', { name: `${name} (${id})`, exact: true }),
    ).toBeVisible();
  }
  await input.fill('ao91');
  const row = dialog.getByRole('checkbox', { name: 'RADFXSAT (FOX-1B) (43017)', exact: true });
  await row.locator('xpath=ancestor::label').click();
  await expect(dialog.getByRole('region', { name: 'Selected satellites' })).toContainText(
    'Also known as: AO-91',
  );
  await page.screenshot({ path: testInfo.outputPath('alias-selection.png') });
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2') || '{}').passWatchlist),
    )
    .toEqual(['43017']);
});
