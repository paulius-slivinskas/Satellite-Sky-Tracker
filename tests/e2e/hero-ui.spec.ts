import { test, expect, prepare, openSidebar, encoded } from './fixtures';
import type { Page } from '@playwright/test';

async function setup(page: Page) {
  await prepare(page);
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  );
  await page.route('https://fonts.gstatic.com/**', (route) => route.fulfill({ body: '' }));
}
async function selectIss(page: Page) {
  await openSidebar(page);
  await expect(page.locator('.sidebar-stack')).toHaveCSS('transform', 'none');
  await page.getByRole('combobox', { name: 'Satellite search' }).fill('25544');
  await page.getByRole('option', { name: /ISS/ }).click();
  await expect(page.getByRole('complementary', { name: 'ISS satellite details' })).toBeVisible();
}

test('satellite and transmitter use HeroUI cards with an exterior, keyboard-operable close button', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setup(page);
  await page.goto('/');
  await selectIss(page);
  const panel = page.getByRole('complementary', { name: 'ISS satellite details' });
  await expect(panel).toHaveAttribute('data-slot', 'card');
  await expect(panel.locator(':scope > [data-slot="card-header"]')).toHaveCount(1);
  await panel.getByRole('tab', { name: 'Amateur radio', exact: true }).click();
  await expect(panel.locator('.tx-card')).toHaveAttribute('data-slot', 'card');
  await expect(panel.locator('.tx-card')).toContainText('FM Voice');
  const transmitter = panel.getByRole('button', { name: /FM Voice/ });
  await expect(transmitter).toHaveAttribute('aria-expanded', 'false');
  await transmitter.focus();
  await transmitter.press('Enter');
  await expect(transmitter).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.getByText('437.800 MHz')).toBeVisible();
  await transmitter.click();
  await expect(transmitter).toHaveAttribute('aria-expanded', 'false');
  await expect(panel.getByText('437.800 MHz')).not.toBeVisible();
  await expect(panel.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
  const close = page.getByRole('button', { name: 'Close satellite details', exact: true });
  await expect(close).toBeVisible();
  expect(await close.evaluate((element) => element.closest('.sat-info-panel') === null)).toBe(true);
  const bounds = (await close.boundingBox())!;
  const panelBounds = (await panel.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  if (viewport.width <= 680) {
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(panelBounds.y);
    expect(bounds.x).toBeLessThan(viewport.width / 2);
  } else {
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(panelBounds.x);
  }
  expect(
    await close.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
      );
    }),
  ).toBe(true);
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(panel).toBeVisible();
  await expect(close).toBeVisible();
  await close.click();
  await expect(page.locator('#map')).toHaveAttribute('data-selected-norad', '25544');
  await expect(panel).toHaveCount(0);
  await expect(close).toHaveCount(0);
  await selectIss(page);
  await close.focus();
  await expect(close).toBeFocused();
  await close.press('Enter');
  await expect(panel).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('pass HeroUI cards retain numerical details and focus/hover selection', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setup(page);
  const shared = {
    version: 1,
    tab: 'passes',
    categories: ['iss'],
    observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' },
    time: {
      simulatedTimeMs: Date.parse('2024-02-29T12:30:00Z'),
      speed: 1,
      playing: false,
      format: '24h',
    },
    passes: { range: 'upcoming3', selectedNorad: '25544' },
    selected: { norad: '25544' },
    map: { lat: 54.6, lon: 25.2, zoom: 3 },
  };
  await page.goto(`/?view=${encoded(shared)}`);
  await openSidebar(page);
  const cards = page.locator('.pass-item');
  await expect(cards).toHaveCount(3, { timeout: 20000 });
  for (let index = 0; index < 3; index++) {
    const card = cards.nth(index);
    await expect(card).toHaveAttribute('data-slot', 'card');
    await expect(card.locator('[data-slot="card-header"]')).toHaveCount(1);
    await expect(card.locator('[data-slot="card-title"]')).toHaveText('ISS');
    await expect(card.locator('.pass-sequence')).toHaveCount(0);
    await expect(card.locator('[data-slot="card-content"]')).toHaveCount(1);
    for (const label of [
      'Pass Start',
      'Pass End',
      'Max Elevation',
      'Rise Direction',
      'Set Direction',
      'Max Elevation Az',
    ]) {
      await expect(card.getByText(label, { exact: true })).toHaveCount(1);
    }
  }
  await expect(cards.first()).toContainText('18:22:42');
  await expect(cards.first()).toContainText('18:29:40');
  await expect(cards.first()).toContainText('5.4°');
  await cards.first().focus();
  await expect(cards.first()).toBeFocused();
  await expect(cards.first()).toHaveClass(/pass-item-hover/);
  await cards.nth(1).hover();
  await expect(cards.nth(1)).toHaveClass(/pass-item-hover/);
  await expect(cards.first()).not.toHaveClass(/pass-item-hover/);
  const sidebarClose = page.getByRole('button', { name: 'Close sidebar', exact: true });
  if (await sidebarClose.isVisible()) await sidebarClose.click();
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await openSidebar(page);
  await expect(cards).toHaveCount(3);
  await cards.first().focus();
  await expect(cards.first()).toHaveClass(/pass-item-hover/);
  expect(errors).toEqual([]);
});

test('observer location uses a real HeroUI accordion with keyboard expansion', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await openSidebar(page);
  const trigger = page.getByRole('button', { name: 'Observer location', exact: true });
  await expect(trigger).toHaveClass(/location-trigger/);
  await expect(trigger).toHaveAttribute('data-slot', 'accordion-trigger');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.focus();
  await trigger.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('combobox', { name: 'Location', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply location', exact: true })).toBeVisible();
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('combobox', { name: 'Location', exact: true })).not.toBeVisible();
});
