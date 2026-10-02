import { test, expect, prepare, openSidebar } from './fixtures';

test('switch track, thumb, label and keyboard all update the category filter', async ({ page }) => {
  await prepare(page);
  await page.goto('/');
  await openSidebar(page);
  await expect(page.getByTestId('sat-count')).toContainText('visible from selected categories');
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  const row = page
    .locator('.filter-switch')
    .filter({ has: page.getByText('Starlink', { exact: true }) });
  const input = page.getByRole('switch', { name: 'Starlink', exact: true });
  await row.locator('.switch__control').click({ position: { x: 3, y: 8 } });
  await expect(input).toBeChecked();
  await expect(page.getByTestId('sat-count')).toHaveText('1 visible from selected categories');
  await row.locator('.switch__thumb').click();
  await expect(input).not.toBeChecked();
  await expect(page.getByTestId('sat-count')).toHaveText('0 visible from selected categories');
  await row.getByText('Starlink', { exact: true }).click();
  await expect(input).toBeChecked();
  await input.focus();
  await page.keyboard.press('Space');
  await expect(input).not.toBeChecked();
});

test('settings switches respond to their visible controls and stay synchronized across tabs', async ({
  page,
}) => {
  await prepare(page);
  await page.goto('/');
  await openSidebar(page);
  const row = (name: string) =>
    page.locator('.filter-switch').filter({ has: page.getByText(name, { exact: true }) });
  await row('Set max altitude').locator('.switch__control').click();
  await expect(page.getByRole('spinbutton', { name: 'Maximum altitude (km)' })).toBeVisible();
  await row('Show LOS Footprint').locator('.switch__thumb').click();
  await expect(page.getByRole('switch', { name: 'Show LOS Footprint' })).toBeChecked();
  await row('Only visible from observer').locator('.switch__control').click();
  await expect(page.getByText('Set an observer location to apply this filter.')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Show Passes on Map' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Filters', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Passes', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Show Passes on Map' })).toBeChecked();
  await row('Show Passes on Map').locator('.switch__control').click();
  await expect(page.getByRole('switch', { name: 'Show Passes on Map' })).not.toBeChecked();
  await row('Show Passes on Map').locator('.switch__thumb').click();
  await expect(page.getByRole('switch', { name: 'Show Passes on Map' })).toBeChecked();
  await page.getByRole('tab', { name: 'Filters', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Show Passes on Map' })).toHaveCount(0);
});
