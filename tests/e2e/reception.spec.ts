import { test, expect, prepare, openSidebar, encoded } from './fixtures';

test('reception survives reload, uses real time and saves an exportable report', async ({
  page,
}, testInfo) => {
  await prepare(page);
  await page.route('https://api.open-meteo.com/v1/forecast?**', (route) =>
    route.fulfill({
      json: {
        hourly: {
          time: [Date.parse('2024-02-29T12:00:00Z') / 1000],
          temperature_2m: [7],
          weather_code: [2],
          wind_speed_10m: [15],
          cloud_cover: [65],
          precipitation: [0],
        },
      },
    }),
  );
  await page.goto(
    `/?view=${encoded({ version: 2, observer: { lat: 54.7, lon: 25.3, alt: 120, name: 'Vilnius' } })}`,
  );
  await openSidebar(page);
  const search = page.getByRole('combobox', { name: 'Satellite search' });
  await search.fill('ISS');
  await page.getByRole('option', { name: /ISS.*#25544/ }).click();
  await page.getByRole('tab', { name: 'Signal report', exact: true }).click();
  await page.getByRole('button', { name: 'Start reception', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Receiving ISS' })).toContainText(
    '00:00:00',
  );
  const startedAt = await page.evaluate(
    () => JSON.parse(localStorage.getItem('satapp_reception_v1')!)[0].startedAt,
  );
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('satapp_view_v2') || '{}').selectedNorad),
    )
    .toBe('25544');
  await page.reload();
  await page.getByRole('tab', { name: 'Signal report', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop reception', exact: true })).toBeVisible();
  await page.clock.setFixedTime(new Date(startedAt + 125000));
  await page.getByRole('button', { name: 'Stop reception', exact: true }).click();
  const report = page.getByRole('dialog', { name: 'Reception report', exact: true });
  await expect(report).toContainText('00:02:05');
  await expect(report.getByRole('textbox')).toHaveCount(1);
  await expect(report.getByRole('combobox', { name: 'Equipment used' })).toBeVisible();
  await report.getByRole('button', { name: '4 stars · Good', exact: true }).click();
  await report
    .getByRole('combobox', { name: 'Equipment used', exact: true })
    .fill('SDR + Yagi antenna');
  await report
    .getByRole('textbox', { name: 'Notes', exact: true })
    .fill('Clear at culmination; fades near horizon. Reduced tuning by 10 kHz.');
  await expect(report.getByRole('status', { name: 'Weather at reception' })).toContainText(
    'Partly cloudy · 7.0 °C · Wind 15 km/h',
  );
  await page.screenshot({
    path: testInfo.outputPath('simplified-reception-report.png'),
    animations: 'disabled',
  });
  await report.getByRole('button', { name: 'Save report', exact: true }).click();
  await page.getByRole('tab', { name: 'Signal report', exact: true }).click();
  await page.getByRole('button', { name: 'Reception logs (1)', exact: true }).click();
  await page.getByRole('button').filter({ hasText: 'Saved report' }).click();
  await expect(report.getByRole('combobox', { name: 'Equipment used', exact: true })).toHaveValue(
    'SDR + Yagi antenna',
  );
  await report.getByRole('button', { name: 'Close reception report' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export all logs', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('satellite-reception-logs.json');
  const logs = await page.evaluate(() => JSON.parse(localStorage.getItem('satapp_reception_v1')!));
  expect(logs[0].stoppedAt - logs[0].startedAt).toBe(125000);
  expect(logs[0].quality).toBe(4);
  expect(logs[0].equipment).toBe('SDR + Yagi antenna');
  expect(logs[0].weather.temperatureC).toBe(7);
  expect(logs[0].remarks).toContain('10 kHz');
  expect(logs[0].saved).toBe(true);
});

test('legacy observations stay editable and weather failure never blocks saving', async ({
  page,
}) => {
  await prepare(page);
  await page.route('https://api.open-meteo.com/v1/forecast?**', (route) => route.abort());
  await page.addInitScript(() =>
    localStorage.setItem(
      'satapp_reception_v1',
      JSON.stringify([
        {
          id: 'legacy',
          noradId: '25544',
          satelliteName: 'ISS',
          startedAt: Date.parse('2024-02-29T12:30:00Z'),
          stoppedAt: Date.parse('2024-02-29T12:31:00Z'),
          observer: { lat: 54.7, lon: 25.3, alt: 120, name: 'Vilnius' },
          saved: true,
          notes: {
            frequencyStartMHz: '437.805',
            frequencyEndMHz: '437.795',
            doppler: 'Down 10 kHz',
            reception: 'Clear at peak',
            conditions: 'Trees to the west',
            antenna: 'Yagi',
            setup: 'SDR',
          },
        },
      ]),
    ),
  );
  await page.goto(`/?view=${encoded({ version: 2, selectedNorad: '25544' })}`);
  await page.getByRole('tab', { name: 'Signal report', exact: true }).click();
  await page.getByRole('button', { name: 'Reception logs (1)', exact: true }).click();
  await page.getByRole('button').filter({ hasText: 'Saved report' }).click();
  const report = page.getByRole('dialog', { name: 'Reception report', exact: true });
  await expect(report.getByRole('combobox', { name: 'Equipment used', exact: true })).toHaveValue(
    'Yagi · SDR',
  );
  await expect(report.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue(
    /437.805 MHz/,
  );
  await expect(report.getByRole('status', { name: 'Weather at reception' })).toContainText(
    'Weather unavailable',
  );
  await report.getByRole('button', { name: '5 stars · Excellent', exact: true }).click();
  await report.getByRole('button', { name: 'Save report', exact: true }).click();
  await expect(report).toHaveCount(0);
  const log = await page.evaluate(
    () => JSON.parse(localStorage.getItem('satapp_reception_v1')!)[0],
  );
  expect(log.notes.frequencyStartMHz).toBe('437.805');
  expect(log.quality).toBe(5);
  expect(log.saved).toBe(true);
});
