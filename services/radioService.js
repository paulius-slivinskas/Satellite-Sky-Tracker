const fs = require("node:fs");
const path = require("node:path");

const SATNOGS_BASE = "https://db.satnogs.org/api";
const AMSAT_BASE = "https://amsat.org/status/api/v1/sat_info.php";

const SATNOGS_TTL_MS = 12 * 60 * 60 * 1000;
const AMSAT_TTL_MS = 10 * 60 * 1000;
const HTTP_TIMEOUT_MS = 12000;
const AMSAT_CSV_FALLBACK_PATHS = [
  process.env.AMSAT_FREQ_CSV_PATH,
  path.join(process.cwd(), "amsat-all-frequencies.csv"),
  "/Users/pauliusslivinskas/amsat-all-frequencies.csv",
  path.join(process.cwd(), "config", "amsat-all-frequencies.csv")
].filter(Boolean);

class SatnogsError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "SatnogsError";
    this.cause = cause;
  }
}

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
    unit: "Hz"
  };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        cur += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function mhzToHz(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.round(n * 1e6);
}

function parseMhzFieldRange(rawValue) {
  const raw = normalizeText(rawValue)
    .replace(/\*/g, "")
    .replace(/xxx/gi, "")
    .replace(/\s+/g, "");
  if (!raw) {
    return { low: null, high: null, unit: "Hz" };
  }

  const tokens = raw
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  const candidate = tokens.find((t) => /[\d.]+(?:-[\d.]+)?/.test(t)) || "";
  const rangeMatch = candidate.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const low = mhzToHz(rangeMatch[1]);
    const high = mhzToHz(rangeMatch[2]);
    if (low !== null || high !== null) {
      return {
        low,
        high: high === null ? low : high,
        unit: "Hz"
      };
    }
  }

  const singleMatch = candidate.match(/(\d+(?:\.\d+)?)/);
  if (!singleMatch) {
    return { low: null, high: null, unit: "Hz" };
  }
  const hz = mhzToHz(singleMatch[1]);
  return {
    low: hz,
    high: hz,
    unit: "Hz"
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
    source: "AMSAT_CSV",
    label,
    typeHint: typeHintFromText(label, row.name, mode),
    uplink: parseMhzFieldRange(row.uplinkRaw),
    downlink: parseMhzFieldRange(row.downlinkRaw),
    beacon: parseMhzFieldRange(row.beaconRaw),
    mode: mode || "N/A",
    callsign: normalizeText(row.callsign) || null,
    status: normalizeText(row.status) || "Unknown",
    service: null,
    baud: null,
    invert: null,
    alive: null,
    notes: notes.join("; ") || null
  };
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
    const raw = fs.readFileSync(sourcePath, "utf-8");
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length);
    if (!lines.length) {
      return new Map();
    }

    const headers = parseCsvLine(lines[0]).map((h) => normalizeText(h));
    const idx = (name) => headers.indexOf(name);
    const noradIdx = idx("norad_id");
    const nameIdx = idx("name");
    const uplinkIdx = idx("uplink");
    const downlinkIdx = idx("downlink");
    const beaconIdx = idx("beacon");
    const modeIdx = idx("mode");
    const callsignIdx = idx("callsign");
    const statusIdx = idx("status");
    const satnogsIdIdx = idx("satnogs_id");

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
        name: normalizeText(cols[nameIdx] || ""),
        uplinkRaw: normalizeText(cols[uplinkIdx] || ""),
        downlinkRaw: normalizeText(cols[downlinkIdx] || ""),
        beaconRaw: normalizeText(cols[beaconIdx] || ""),
        mode: normalizeText(cols[modeIdx] || ""),
        callsign: normalizeText(cols[callsignIdx] || ""),
        status: normalizeText(cols[statusIdx] || ""),
        satnogsId: normalizeText(cols[satnogsIdIdx] || "")
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

function typeHintFromText(label, description, mode) {
  // Extend this matcher by adding more keyword groups mapped to a typeHint.
  const text = `${normalizeText(label)} ${normalizeText(description)} ${normalizeText(mode)}`.toLowerCase();
  if (text.includes("beacon")) {
    return "beacon";
  }
  if (text.includes("telemetry")) {
    return "telemetry";
  }
  if (text.includes("aprs") || text.includes("packet")) {
    return "aprs";
  }
  if (text.includes("transponder") || text.includes("linear")) {
    return "transponder";
  }
  if (text.includes("repeater") || /\bfm\b/.test(text)) {
    return "repeater";
  }
  return "unknown";
}

function normalizeTransmitter(tx) {
  const label = normalizeText(tx.description || tx.name || tx.tx_mode || tx.service || "Unnamed");
  const mode = normalizeText(tx.mode || tx.modulation || tx.tx_mode || tx.service || "");
  const status = tx.alive === false ? "Inactive" : tx.status ? String(tx.status) : tx.alive === true ? "Active" : "Unknown";
  const notesParts = [];
  if (tx.service) {
    notesParts.push(`service=${tx.service}`);
  }
  if (tx.baud !== undefined && tx.baud !== null && tx.baud !== "") {
    notesParts.push(`baud=${tx.baud}`);
  }
  if (tx.invert !== undefined && tx.invert !== null && tx.invert !== "") {
    notesParts.push(`invert=${tx.invert}`);
  }

  return {
    id: tx.id ?? null,
    source: "SatNOGS",
    label,
    typeHint: typeHintFromText(label, tx.description, mode),
    uplink: toFreqRange(tx.uplink_low, tx.uplink_high, tx.uplink),
    downlink: toFreqRange(tx.downlink_low, tx.downlink_high, tx.downlink),
    beacon: toFreqRange(tx.beacon_low, tx.beacon_high, tx.beacon),
    mode: mode || "N/A",
    callsign: normalizeText(tx.callsign) || null,
    status,
    service: normalizeText(tx.service) || null,
    baud: tx.baud ?? null,
    invert: tx.invert ?? null,
    alive: tx.alive ?? null,
    notes: notesParts.join("; ") || null
  };
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
      transmitters: []
    };
  }

  let txRows = [];
  if (Array.isArray(sat.transmitters) && sat.transmitters.length) {
    const requests = sat.transmitters.map(async (item) => {
      if (typeof item === "object" && item !== null) {
        return item;
      }
      const id = String(item).replace(/[^\d]/g, "");
      if (!id) {
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
    transmitters: txRows.map(normalizeTransmitter)
  };
}

function readAmsatMap() {
  try {
    const filePath = path.join(process.cwd(), "config", "amsat-map.json");
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
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
      provider: "none",
      lastReportTime: null,
      lastReport: null,
      recentReportsCount: 0
    };
  }

  const sorted = reports
    .slice()
    .sort((a, b) => {
      const ta = new Date(a?.time || a?.timestamp || a?.date || 0).getTime();
      const tb = new Date(b?.time || b?.timestamp || b?.date || 0).getTime();
      return tb - ta;
    });

  const last = sorted[0] || {};
  const reportText = last.report || last.status || last.comment || null;
  const reportTime = last.time || last.timestamp || last.date || null;

  return {
    provider: "amsat",
    lastReportTime: reportTime ? new Date(reportTime).toISOString() : null,
    lastReport: reportText ? String(reportText) : null,
    recentReportsCount: reports.length
  };
}

class RadioService {
  constructor(cache) {
    this.cache = cache;
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
    const cached = await this.cache.get(key);
    if (cached) {
      return cached;
    }

    try {
      const payload = await fetchSatnogsTransmitterList(norad);
      await this.cache.set(key, payload, SATNOGS_TTL_MS);
      return payload;
    } catch (error) {
      throw new SatnogsError(`Failed to fetch SatNOGS data for NORAD ${norad}`, error);
    }
  }

  async getAmsatStatus(norad) {
    const amsatName = this.amsatMap[String(norad)];
    if (!amsatName) {
      return {
        provider: "none",
        lastReportTime: null,
        lastReport: null,
        recentReportsCount: 0
      };
    }

    const key = this.amsatKey(amsatName);
    const cached = await this.cache.get(key);
    if (cached) {
      return cached;
    }

    const url = `${AMSAT_BASE}?name=${encodeURIComponent(amsatName)}&hours=24`;
    try {
      const payload = await fetchJson(url);
      const status = parseAmsatStatus(payload);
      await this.cache.set(key, status, AMSAT_TTL_MS);
      return status;
    } catch (error) {
      return {
        provider: "none",
        lastReportTime: null,
        lastReport: null,
        recentReportsCount: 0
      };
    }
  }

  async getUnifiedRadioByNorad(norad) {
    let satnogs = {
      satName: null,
      transmitters: []
    };
    let satnogsFailed = false;
    let satnogsError = null;
    try {
      satnogs = await this.getSatnogsNormalized(norad);
    } catch (error) {
      satnogsFailed = true;
      satnogsError = error;
    }
    const amsatStatus = await this.getAmsatStatus(norad);
    const csvRows = this.amsatCsvByNorad.get(String(norad)) || [];
    const csvTransmitters = csvRows.map((row, idx) => normalizeCsvTransmitter(row, idx + 1));
    const dedupe = new Set();
    const combinedTransmitters = [...satnogs.transmitters, ...csvTransmitters].filter((tx) => {
      const key = [
        normalizeText(tx.label),
        tx.uplink?.low ?? "",
        tx.uplink?.high ?? "",
        tx.downlink?.low ?? "",
        tx.downlink?.high ?? "",
        normalizeText(tx.mode),
        normalizeText(tx.callsign)
      ].join("|");
      if (dedupe.has(key)) {
        return false;
      }
      dedupe.add(key);
      return true;
    });

    if (satnogsFailed && !combinedTransmitters.length) {
      throw satnogsError || new SatnogsError(`Failed to fetch SatNOGS data for NORAD ${norad}`);
    }

    return {
      norad: Number(norad),
      satName: satnogs.satName || csvRows[0]?.name || `NORAD ${norad}`,
      source: {
        satnogs: !satnogsFailed,
        amsat: amsatStatus.provider === "amsat",
        amsatCsv: csvTransmitters.length > 0
      },
      transmitters: combinedTransmitters,
      status: amsatStatus,
      fetchedAt: new Date().toISOString()
    };
  }
}

module.exports = {
  RadioService,
  SatnogsError
};
