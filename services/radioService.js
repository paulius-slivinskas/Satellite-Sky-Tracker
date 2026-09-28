const fs = require('node:fs');
const path = require('node:path');
const {
  parseCsvLine,
  normalizeText,
  normalizeCsvTransmitter,
  normalizeTransmitter,
  dedupeTransmitters,
} = require('../lib/radioNormalization');
const manualOverrides = require('../config/manual-radio');

const SATNOGS_BASE = 'https://db.satnogs.org/api';
const AMSAT_BASE = 'https://amsat.org/status/api/v1/sat_info.php';

const SATNOGS_TTL_MS = 12 * 60 * 60 * 1000;
const AMSAT_TTL_MS = 10 * 60 * 1000;
const HTTP_TIMEOUT_MS = 12000;
const AMSAT_CSV_FALLBACK_PATHS = [
  process.env.AMSAT_FREQ_CSV_PATH,
  path.join(__dirname, '..', 'amsat-all-frequencies.csv'),
  path.join(__dirname, '..', 'config', 'amsat-all-frequencies.csv'),
].filter(Boolean);

class SatnogsError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'SatnogsError';
    this.cause = cause;
  }
}

function readAmsatCsvByNorad() {
  const sourcePath = AMSAT_CSV_FALLBACK_PATHS.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (error) {
      return false;
    }
  });
  if (!sourcePath) {
    return new Map();
  }

  try {
    const raw = fs.readFileSync(sourcePath, 'utf-8');
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length);
    if (!lines.length) {
      return new Map();
    }

    const headers = parseCsvLine(lines[0]).map((h) => normalizeText(h));
    const idx = (name) => headers.indexOf(name);
    const noradIdx = idx('norad_id');
    const nameIdx = idx('name');
    const uplinkIdx = idx('uplink');
    const downlinkIdx = idx('downlink');
    const beaconIdx = idx('beacon');
    const modeIdx = idx('mode');
    const callsignIdx = idx('callsign');
    const statusIdx = idx('status');
    const satnogsIdIdx = idx('satnogs_id');

    if (noradIdx < 0) {
      return new Map();
    }

    const byNorad = new Map();
    for (let i = 1; i < lines.length; i += 1) {
      const cols = parseCsvLine(lines[i]);
      const norad = normalizeText(cols[noradIdx]);
      if (!norad || !/^\d+$/.test(norad)) {
        continue;
      }
      const row = {
        norad,
        name: normalizeText(cols[nameIdx] || ''),
        uplinkRaw: normalizeText(cols[uplinkIdx] || ''),
        downlinkRaw: normalizeText(cols[downlinkIdx] || ''),
        beaconRaw: normalizeText(cols[beaconIdx] || ''),
        mode: normalizeText(cols[modeIdx] || ''),
        callsign: normalizeText(cols[callsignIdx] || ''),
        status: normalizeText(cols[statusIdx] || ''),
        satnogsId: normalizeText(cols[satnogsIdIdx] || ''),
      };
      const list = byNorad.get(norad) || [];
      list.push(row);
      byNorad.set(norad, list);
    }
    return byNorad;
  } catch (error) {
    return new Map();
  }
}

async function fetchJson(url, timeoutMs = HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSatnogsTransmitterList(norad) {
  const satUrl = `${SATNOGS_BASE}/satellites/?format=json&norad_cat_id=${encodeURIComponent(String(norad))}`;
  const satPayload = await fetchJson(satUrl);
  const sat = Array.isArray(satPayload) ? satPayload[0] : null;
  if (!sat) {
    return {
      satName: null,
      transmitters: [],
    };
  }

  let txRows = [];
  if (Array.isArray(sat.transmitters) && sat.transmitters.length) {
    const requests = sat.transmitters.map(async (item) => {
      if (typeof item === 'object' && item !== null) {
        return item;
      }
      const id = String(item).replace(/\/$/, '').split('/').pop();
      if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
        return null;
      }
      const txUrl = `${SATNOGS_BASE}/transmitters/${id}/?format=json`;
      try {
        return await fetchJson(txUrl);
      } catch (error) {
        return null;
      }
    });
    const resolved = await Promise.all(requests);
    txRows = resolved.filter(Boolean);
  }

  if (!txRows.length) {
    const fallbackUrl = `${SATNOGS_BASE}/transmitters/?format=json&satellite__norad_cat_id=${encodeURIComponent(String(norad))}`;
    const fallbackPayload = await fetchJson(fallbackUrl);
    txRows = Array.isArray(fallbackPayload) ? fallbackPayload : [];
  }

  return {
    satName: sat.name || sat.names || null,
    transmitters: txRows.map(normalizeTransmitter),
  };
}

function readAmsatMap() {
  try {
    const filePath = path.join(__dirname, '..', 'config', 'amsat-map.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function parseAmsatStatus(payload) {
  const reports = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.reports)
      ? payload.reports
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
  if (!reports.length) {
    return {
      provider: 'none',
      lastReportTime: null,
      lastReport: null,
      recentReportsCount: 0,
    };
  }

  const sorted = reports.slice().sort((a, b) => {
    const ta = new Date(a?.time || a?.timestamp || a?.date || 0).getTime();
    const tb = new Date(b?.time || b?.timestamp || b?.date || 0).getTime();
    return tb - ta;
  });

  const last = sorted[0] || {};
  const reportText = last.report || last.status || last.comment || null;
  const reportTime = last.time || last.timestamp || last.date || null;
  const reportDate = reportTime ? new Date(reportTime) : null;

  return {
    provider: 'amsat',
    lastReportTime:
      reportDate && Number.isFinite(reportDate.getTime()) ? reportDate.toISOString() : null,
    lastReport: reportText ? String(reportText) : null,
    recentReportsCount: reports.length,
  };
}

class RadioService {
  constructor(cache) {
    this.cache = cache;
    this.inflight = new Map();
    this.amsatMap = readAmsatMap();
    this.amsatCsvByNorad = readAmsatCsvByNorad();
  }

  satnogsKey(norad) {
    return `satnogs:norad:${norad}`;
  }

  amsatKey(name) {
    return `amsat:name:${name.toUpperCase()}`;
  }

  async getSatnogsNormalized(norad) {
    const key = this.satnogsKey(norad);
    const cached = await this.cache.get(key).catch(() => null);
    if (cached) {
      return cached;
    }

    try {
      const payload = await fetchSatnogsTransmitterList(norad);
      await this.cache.set(key, payload, SATNOGS_TTL_MS).catch(() => {});
      return payload;
    } catch (error) {
      throw new SatnogsError(`Failed to fetch SatNOGS data for NORAD ${norad}`, error);
    }
  }

  async getAmsatStatus(norad) {
    const amsatName = this.amsatMap[String(norad)];
    if (!amsatName) {
      return {
        provider: 'none',
        lastReportTime: null,
        lastReport: null,
        recentReportsCount: 0,
      };
    }

    const key = this.amsatKey(amsatName);
    const cached = await this.cache.get(key).catch(() => null);
    if (cached) {
      return cached;
    }

    const url = `${AMSAT_BASE}?name=${encodeURIComponent(amsatName)}&hours=24`;
    try {
      const payload = await fetchJson(url);
      const status = parseAmsatStatus(payload);
      await this.cache.set(key, status, AMSAT_TTL_MS).catch(() => {});
      return status;
    } catch (error) {
      return {
        provider: 'none',
        lastReportTime: null,
        lastReport: null,
        recentReportsCount: 0,
      };
    }
  }

  getUnifiedRadioByNorad(norad) {
    const key = String(norad);
    if (this.inflight.has(key)) return this.inflight.get(key);
    const pending = this.loadUnifiedRadio(key).finally(() => this.inflight.delete(key));
    this.inflight.set(key, pending);
    return pending;
  }

  async loadUnifiedRadio(norad) {
    const statusPromise = this.getAmsatStatus(norad);
    let satnogs = {
      satName: null,
      transmitters: [],
    };
    let satnogsFailed = false;
    let satnogsError = null;
    try {
      satnogs = await this.getSatnogsNormalized(norad);
    } catch (error) {
      satnogsFailed = true;
      satnogsError = error;
    }
    const amsatStatus = await statusPromise;
    const csvRows = this.amsatCsvByNorad.get(String(norad)) || [];
    const csvTransmitters = csvRows.map((row, idx) => normalizeCsvTransmitter(row, idx + 1));
    const satName = satnogs.satName || csvRows[0]?.name || `NORAD ${norad}`;
    const nameKey = String(satName)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const manualTransmitters = manualOverrides
      .filter(
        (row) =>
          String(row.norad) === norad ||
          row.aliases.some((alias) =>
            nameKey.includes(alias.toUpperCase().replace(/[^A-Z0-9]/g, '')),
          ),
      )
      .map((row, index) => {
        const frequency = (value) => ({
          low: value == null ? null : Math.round(value * 1e6),
          high: value == null ? null : Math.round(value * 1e6),
          unit: 'Hz',
        });
        return {
          id: `manual-${norad}-${index}`,
          source: 'MANUAL',
          label: `${row.aliases[0]} (manual)`,
          typeHint: 'repeater',
          uplink: frequency(row.uplinkMhz),
          downlink: frequency(row.downlinkMhz),
          beacon: frequency(null),
          mode: row.mode,
          callsign: row.callsign,
          status: row.status,
          service: null,
          baud: null,
          invert: null,
          alive: null,
          notes: row.notes,
        };
      });
    const combinedTransmitters = dedupeTransmitters([
      ...satnogs.transmitters,
      ...csvTransmitters,
      ...manualTransmitters,
    ]);

    if (satnogsFailed && !combinedTransmitters.length) {
      throw satnogsError || new SatnogsError(`Failed to fetch SatNOGS data for NORAD ${norad}`);
    }

    return {
      norad: Number(norad),
      satName,
      source: {
        satnogs: !satnogsFailed,
        amsat: amsatStatus.provider === 'amsat',
        amsatCsv: csvTransmitters.length > 0,
        manual: manualTransmitters.length > 0,
      },
      transmitters: combinedTransmitters,
      status: amsatStatus,
      fetchedAt: new Date().toISOString(),
    };
  }
}

module.exports = {
  RadioService,
  SatnogsError,
};
