function parseNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toFreqRange(low, high, single) {
  let lo = parseNumber(low);
  let hi = parseNumber(high);
  const one = parseNumber(single);

  if (one !== null) {
    lo = one;
    hi = one;
  } else if (lo !== null && hi === null) {
    hi = lo;
  } else if (hi !== null && lo === null) {
    lo = hi;
  }

  return {
    low: lo,
    high: hi,
    unit: 'Hz',
  };
}

function normalizeText(value) {
  return String(value || '').trim();
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function mhzToHz(value) {
  const n = parseNumber(value);
  return n === null ? null : Math.round(n * 1e6);
}

function parseMhzFieldRange(rawValue) {
  const raw = normalizeText(rawValue).replace(/\*/g, '').replace(/xxx/gi, '').replace(/\s+/g, '');
  if (!raw) {
    return { low: null, high: null, unit: 'Hz' };
  }

  const tokens = raw
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  const candidate = tokens.find((t) => /[\d.]+(?:-[\d.]+)?/.test(t)) || '';
  const rangeMatch = candidate.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const low = mhzToHz(rangeMatch[1]);
    const high = mhzToHz(rangeMatch[2]);
    if (low !== null || high !== null) {
      return {
        low,
        high: high === null ? low : high,
        unit: 'Hz',
      };
    }
  }

  const singleMatch = candidate.match(/(\d+(?:\.\d+)?)/);
  if (!singleMatch) {
    return { low: null, high: null, unit: 'Hz' };
  }
  const hz = mhzToHz(singleMatch[1]);
  return {
    low: hz,
    high: hz,
    unit: 'Hz',
  };
}

function normalizeCsvTransmitter(row, index) {
  const mode = normalizeText(row.mode);
  const label = mode ? `${mode} (${row.name})` : `${row.name} (AMSAT CSV)`;
  const notes = [];
  if (normalizeText(row.uplinkRaw)) {
    notes.push(`uplinkRaw=${row.uplinkRaw}`);
  }
  if (normalizeText(row.downlinkRaw)) {
    notes.push(`downlinkRaw=${row.downlinkRaw}`);
  }
  if (normalizeText(row.beaconRaw)) {
    notes.push(`beaconRaw=${row.beaconRaw}`);
  }
  if (normalizeText(row.satnogsId)) {
    notes.push(`satnogsId=${row.satnogsId}`);
  }

  return {
    id: `amsat-csv-${row.norad}-${index}`,
    source: 'AMSAT_CSV',
    label,
    typeHint: typeHintFromText(label, row.name, mode),
    uplink: parseMhzFieldRange(row.uplinkRaw),
    downlink: parseMhzFieldRange(row.downlinkRaw),
    beacon: parseMhzFieldRange(row.beaconRaw),
    mode: mode || 'N/A',
    callsign: normalizeText(row.callsign) || null,
    status: normalizeText(row.status) || 'Unknown',
    service: null,
    baud: null,
    invert: null,
    alive: null,
    notes: notes.join('; ') || null,
  };
}

function typeHintFromText(label, description, mode) {
  // Extend this matcher by adding more keyword groups mapped to a typeHint.
  const text =
    `${normalizeText(label)} ${normalizeText(description)} ${normalizeText(mode)}`.toLowerCase();
  if (text.includes('beacon')) {
    return 'beacon';
  }
  if (text.includes('telemetry')) {
    return 'telemetry';
  }
  if (text.includes('aprs') || text.includes('packet')) {
    return 'aprs';
  }
  if (text.includes('transponder') || text.includes('linear')) {
    return 'transponder';
  }
  if (text.includes('repeater') || /\bfm\b/.test(text)) {
    return 'repeater';
  }
  return 'unknown';
}

function normalizeTransmitter(tx) {
  const label = normalizeText(tx.description || tx.name || tx.tx_mode || tx.service || 'Unnamed');
  const mode = normalizeText(tx.mode || tx.modulation || tx.tx_mode || tx.service || '');
  const status =
    tx.alive === false
      ? 'Inactive'
      : tx.status
        ? String(tx.status)
        : tx.alive === true
          ? 'Active'
          : 'Unknown';
  const notesParts = [];
  if (tx.service) {
    notesParts.push(`service=${tx.service}`);
  }
  if (tx.baud !== undefined && tx.baud !== null && tx.baud !== '') {
    notesParts.push(`baud=${tx.baud}`);
  }
  if (tx.invert !== undefined && tx.invert !== null && tx.invert !== '') {
    notesParts.push(`invert=${tx.invert}`);
  }

  return {
    id: tx.id ?? null,
    source: 'SatNOGS',
    label,
    typeHint: typeHintFromText(label, tx.description, mode),
    uplink: toFreqRange(tx.uplink_low, tx.uplink_high, tx.uplink),
    downlink: toFreqRange(tx.downlink_low, tx.downlink_high, tx.downlink),
    beacon: toFreqRange(tx.beacon_low, tx.beacon_high, tx.beacon),
    mode: mode || 'N/A',
    callsign: normalizeText(tx.callsign) || null,
    status,
    service: normalizeText(tx.service) || null,
    baud: tx.baud ?? null,
    invert: tx.invert ?? null,
    alive: tx.alive ?? null,
    notes: notesParts.join('; ') || null,
  };
}

function dedupeTransmitters(rows) {
  const seen = new Set();
  return rows.filter((tx) => {
    const key = [
      tx.label,
      tx.mode,
      tx.callsign,
      ...[tx.uplink, tx.downlink, tx.beacon].flatMap((range) => [
        range?.low ?? '',
        range?.high ?? '',
      ]),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = {
  parseNumber,
  toFreqRange,
  normalizeText,
  parseCsvLine,
  normalizeCsvTransmitter,
  normalizeTransmitter,
  parseMhzFieldRange,
  dedupeTransmitters,
};
