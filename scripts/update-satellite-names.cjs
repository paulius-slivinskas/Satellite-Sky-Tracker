// Refresh the bundled name index; browsers can search aliases without network requests.
const fs = require('node:fs/promises');
const path = require('node:path');
const { parseCsvLine } = require('../lib/radioNormalization');
const source = 'https://db.satnogs.org/api/satellites/?format=json';
const root = path.join(__dirname, '..');

async function main() {
  const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`SatNOGS HTTP ${response.status}`);
  const satellites = await response.json();
  if (!Array.isArray(satellites) || !satellites.length)
    throw new Error('SatNOGS returned no satellite names; keeping the existing index.');
  const names = new Map();
  const add = (id, value) => {
    if (!/^\d+$/.test(String(id)) || Number(id) <= 0 || typeof value !== 'string') return;
    // SatNOGS uses the 90000-series for provisional identities. Do not join these
    // to CelesTrak objects, or infer an identity from the uncertain norad_follow_id.
    if (Number(id) >= 90000 && Number(id) <= 99999) return;
    const key = String(Number(id));
    const values = names.get(key) || new Set();
    for (const name of value
      .split(/[,;\n/]+/)
      .map((part) => part.trim())
      .filter(Boolean)) {
      // Some source rows use spaces between code aliases, e.g. CAS-3H XW-2H.
      const parts = /^(?:[A-Z]+-\d+[A-Z]*\s+)+[A-Z]+-\d+[A-Z]*$/i.test(name)
        ? name.split(/\s+/)
        : [name];
      for (const part of parts) values.add(part);
    }
    if (values.size) names.set(key, values);
  };
  for (const satellite of satellites) {
    add(satellite.norad_cat_id, satellite.name);
    add(satellite.norad_cat_id, satellite.names);
  }
  const csv = await fs.readFile(path.join(root, 'amsat-all-frequencies.csv'), 'utf8');
  const [header, ...rows] = csv.split(/\r?\n/).filter(Boolean).map(parseCsvLine);
  for (const row of rows) add(row[header.indexOf('norad_id')], row[header.indexOf('name')]);
  const output = {
    updatedAt: new Date().toISOString(),
    sources: [source, 'amsat-all-frequencies.csv'],
    names: Object.fromEntries(
      [...names].sort(([a], [b]) => Number(a) - Number(b)).map(([id, values]) => [id, [...values]]),
    ),
  };
  const destination = path.join(root, 'src/data/satellite-names.json');
  await fs.writeFile(`${destination}.tmp`, `${JSON.stringify(output, null, 2)}\n`);
  await fs.rename(`${destination}.tmp`, destination);
  console.log(`Saved names for ${names.size} NORAD IDs.`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
