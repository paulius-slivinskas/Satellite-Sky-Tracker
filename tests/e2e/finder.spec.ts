import { test, expect, prepare, encoded } from './fixtures';
test('fullscreen finder tracks orientation behind overlays and guides around its reticle', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await page.addInitScript(() =>
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
      configurable: true,
      value: async () => 'granted',
    }),
  );
  await page.goto(
    `/?view=${encoded({ version: 2, selectedNorad: '25544', observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' }, simulatedTimeMs: Date.parse('2024-03-01T10:00:00Z'), playing: false })}`,
  );
  const launch = page.getByRole('button', { name: 'Find in the sky' });
  await expect(launch).toBeInViewport({ ratio: 1 });
  await launch.click();
  const dialog = page.getByRole('dialog', { name: 'Satellite sky finder' });
  await expect(dialog.getByRole('heading', { name: 'ISS', exact: true })).toHaveCSS(
    'text-align',
    'center',
  );
  await expect(dialog.locator('.finder-sky')).toHaveAttribute('data-tracking', 'manual');
  const skyBox = (await dialog.locator('.finder-sky').boundingBox())!;
  expect(skyBox).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  await expect(dialog.locator('.finder-sky-reticle')).toHaveAttribute(
    'transform',
    'translate(195 422)',
  );
  await expect(dialog.locator('.finder-sky-horizon')).toHaveAttribute('d', /M/);
  await expect(dialog.locator('.finder-sky-track')).toHaveAttribute('d', /M/);
  await expect(dialog.locator('.finder-live-position dd').first()).toHaveText(/\d+\.\d°/);
  await expect(dialog.locator('.finder-live-position dd').last()).toHaveText(/-?\d+\.\d°/);
  await expect(dialog.getByRole('img')).toHaveAttribute('aria-label', /Sky view for ISS/);
  await expect(dialog.getByRole('img')).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByText('Phone top', { exact: true })).toHaveCount(0);
  await expect(
    dialog.getByText(/Live position|Azimuth from true north|Pass in progress|Live clock/),
  ).toHaveCount(0);
  await expect(dialog.getByLabel('Manual compass heading')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Enable compass', exact: true }).click();
  await page.evaluate(() =>
    window.dispatchEvent(
      new DeviceOrientationEvent('deviceorientationabsolute', {
        alpha: 270,
        beta: 90,
        gamma: 0,
        absolute: true,
      }),
    ),
  );
  await expect(dialog.locator('.finder-sky')).toHaveAttribute('data-tracking', 'live');
  const horizon = await dialog.locator('.finder-sky-horizon').getAttribute('d');
  await page.evaluate(() =>
    window.dispatchEvent(
      new DeviceOrientationEvent('deviceorientationabsolute', {
        alpha: 270,
        beta: 120,
        gamma: 0,
        absolute: true,
      }),
    ),
  );
  await expect(dialog.locator('.finder-sky-horizon')).not.toHaveAttribute('d', horizon!);
  await expect(dialog.getByTestId('sky-guide')).toBeVisible();
  const guideOffset = await dialog.getByTestId('sky-guide').evaluate((el) => {
    const [x, y] = el
      .getAttribute('transform')!
      .match(/-?[0-9.]+/g)!
      .map(Number);
    return Math.hypot(x - 195, y - 422);
  });
  expect(guideOffset).toBeCloseTo(48);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(dialog.locator('.finder-sky-reticle')).toHaveAttribute(
    'transform',
    'translate(422 195)',
  );
  await expect(dialog.getByRole('button', { name: 'Close sky finder' })).toBeInViewport({
    ratio: 1,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const before = await dialog.locator('.finder-live-position dd').allTextContents();
  await page.clock.setFixedTime(new Date('2024-02-29T12:31:00Z'));
  await expect
    .poll(() => dialog.locator('.finder-live-position dd').allTextContents())
    .not.toEqual(before);
  const close = dialog.getByRole('button', { name: 'Close sky finder', exact: true });
  await expect(close).toHaveCSS('border-radius', '50%');
  await page.screenshot({ path: testInfo.outputPath('minimal-red-finder.png') });
  await close.click();
  await expect(dialog).toHaveCount(0);
});
test('missing observer and denied compass use compact states without extra instructions', async ({
  page,
}) => {
  await prepare(page);
  await page.addInitScript(() =>
    Object.defineProperty(window, 'DeviceOrientationEvent', {
      configurable: true,
      value: Object.assign(function DeviceOrientationEvent() {}, {
        requestPermission: async () => 'denied',
      }),
    }),
  );
  await page.goto(`/?view=${encoded({ version: 2, selectedNorad: '25544', observer: null })}`);
  await page.getByRole('button', { name: 'Find in the sky' }).click();
  const dialog = page.getByRole('dialog', { name: 'Satellite sky finder' });
  await expect(dialog.getByText('Observer location required', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Enable compass', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Motion permission was denied. Allow it in your browser settings.',
  );
  await expect(dialog.locator('.finder-sky')).toHaveAttribute('data-tracking', 'manual');
  await expect(dialog.getByLabel('Manual compass heading')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('compass enable reports missing sensor readings in an app notification', async ({ page }) => {
  await page.clock.install();
  await prepare(page);
  await page.addInitScript(() =>
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
      configurable: true,
      value: async () => 'granted',
    }),
  );
  await page.addInitScript(() => {
    const listen = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, ...args: unknown[]) => {
      if (type === 'deviceorientation' || type === 'deviceorientationabsolute') return;
      return (listen as (...args: unknown[]) => void)(type, ...args);
    }) as typeof window.addEventListener;
  });
  await page.goto(
    `/?view=${encoded({ version: 2, selectedNorad: '25544', observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' } })}`,
  );
  await page.getByRole('button', { name: 'Find in the sky', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Satellite sky finder' });
  await dialog.getByRole('button', { name: 'Enable compass', exact: true }).click();
  await page.clock.setFixedTime(new Date('2024-02-29T12:30:05Z'));
  await page.clock.fastForward(1000);
  await expect(dialog.getByRole('alert')).toContainText(
    'No compass readings received from this device.',
  );
  await expect(dialog.getByRole('button', { name: 'Enable compass', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Dismiss Compass unavailable', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('iOS calibration holds the stationary view through compass swings and follows real turns', async ({
  page,
}) => {
  await prepare(page);
  await page.addInitScript(() =>
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
      configurable: true,
      value: async () => 'granted',
    }),
  );
  await page.goto(
    `/?view=${encoded({ version: 2, selectedNorad: '25544', observer: { lat: 54.6872, lon: 25.2797, alt: 120, name: 'Vilnius' }, playing: false })}`,
  );
  await page.getByRole('button', { name: 'Find in the sky', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Satellite sky finder' });
  await dialog.getByRole('button', { name: 'Enable compass', exact: true }).click();
  await page.clock.install();
  const reading = async (alpha: number, beta: number, heading?: number) => {
    await page.evaluate(
      ({ alpha, beta, heading }) => {
        const event = new DeviceOrientationEvent('deviceorientation', {
          alpha,
          beta,
          gamma: 0,
          absolute: false,
        });
        if (heading !== undefined)
          Object.defineProperties(event, {
            webkitCompassHeading: { value: heading },
            webkitCompassAccuracy: { value: 5 },
          });
        window.dispatchEvent(event);
      },
      { alpha, beta, heading },
    );
    await page.clock.runFor(80);
  };
  await reading(30, 110, 350);
  await expect(dialog.getByRole('status')).toContainText('Hold your phone flat');
  for (let i = 0; i < 9; i++) await reading(30, 0, 350);
  await expect(dialog.locator('.finder-sky')).toHaveAttribute('data-tracking', 'live');
  for (let i = 0; i < 20; i++) await reading(30, 110, 350);
  const horizon = await dialog.locator('.finder-sky-horizon').getAttribute('d');
  const bearing = await dialog.locator('.finder-sky-bearing').textContent();
  // Long compass-only swings (not just alternating one-frame spikes).
  for (const heading of [325, 350, 15]) {
    for (let i = 0; i < 12; i++) await reading(30, 110, heading);
    await expect(dialog.locator('.finder-sky-bearing')).toHaveText(bearing!);
    await expect(dialog.locator('.finder-sky-horizon')).toHaveAttribute('d', horizon!);
  }
  // Keep the calibrated frame when the independent compass sample is missing.
  for (let i = 0; i < 24; i++) await reading(30, 110);
  await expect(dialog.locator('.finder-sky')).toHaveAttribute('data-tracking', 'live');
  await expect(dialog.locator('.finder-sky-bearing')).toHaveText(bearing!);
  for (let i = 0; i < 10; i++) await reading(10, 110, 350);
  await expect(dialog.locator('.finder-sky-bearing')).toHaveText('10° · 20°');
  await dialog.getByRole('button', { name: 'Align north', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Hold your phone flat');
});
