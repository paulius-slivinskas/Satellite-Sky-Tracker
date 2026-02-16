function isFleetSatcomName(name) {
  const normalized = String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

  return (
    /\bOPS\s*6391\b/.test(normalized) ||
    /\bOPS\s*6392\b/.test(normalized) ||
    /\bOPS\s*6393\b/.test(normalized) ||
    /\bOPS\s*6394\b/.test(normalized) ||
    /\bFLTSATCOM\s*5\b/.test(normalized) ||
    /\bFLTSATCOM\s*7\b/.test(normalized) ||
    /\bFLTSATCOM\s*8\b/.test(normalized)
  );
}

const FLEET_SATCOM_TARGETS = [
  { noradId: "10669", name: "OPS 6391 (FLTSATCOM 1)" },
  { noradId: "11353", name: "OPS 6392 (FLTSATCOM 2)" },
  { noradId: "11669", name: "OPS 6393 (FLTSATCOM 3)" },
  { noradId: "12046", name: "OPS 6394 (FLTSATCOM 4)" },
  { noradId: "12635", name: "FLTSATCOM 5" },
  { noradId: "17181", name: "FLTSATCOM 7 (USA 20)" },
  { noradId: "20253", name: "FLTSATCOM 8 (USA 46)" }
];

const MANUAL_RADIO_OVERRIDES = [
  {
    norad: null,
    aliases: ["AO-91", "RADFXSAT", "FOX-1B"],
    uplinkMhz: 435.25,
    downlinkMhz: 145.96,
    mode: "FM",
    callsign: null,
    status: "Active",
    notes: "67 Hz CTCSS. Do not attempt access while in eclipse due to battery status."
  },
  {
    norad: null,
    aliases: ["AO-123", "ASRTU-1"],
    uplinkMhz: 145.85,
    downlinkMhz: 435.4,
    mode: "FM",
    callsign: null,
    status: "Active",
    notes: "67 Hz CTCSS."
  },
  {
    norad: null,
    aliases: ["CAS-3H", "LILACSAT-2"],
    uplinkMhz: 144.35,
    downlinkMhz: 437.2,
    mode: "FM / Telemetry Beacon",
    callsign: null,
    status: "Scheduled",
    notes: "FM transponder has no fixed schedule. Telemetry beacon on 437.200 MHz when transponder is off."
  },
  {
    norad: null,
    aliases: ["IO-86", "LAPAN-A2"],
    uplinkMhz: 145.88,
    downlinkMhz: 435.88,
    mode: "FM",
    callsign: null,
    status: "Scheduled",
    notes: "88.5 Hz CTCSS. Low inclination orbit (+/- 30 deg equator). Schedule: https://community.libre.space/t/lapan-a2-io-86-schedule-2026"
  },
  {
    norad: 25544,
    aliases: ["ISS"],
    uplinkMhz: 145.99,
    downlinkMhz: 437.8,
    mode: "FM",
    callsign: "ARISS",
    status: "Active",
    notes: "67 Hz CTCSS. See ARISS status for latest operational updates."
  },
  {
    norad: null,
    aliases: ["PO-101", "DIWATA-2"],
    uplinkMhz: 437.5,
    downlinkMhz: 145.9,
    mode: "FM",
    callsign: null,
    status: "Uncertain",
    notes: "141.3 Hz CTCSS. Reported as failing; FM transponder often activated by schedule."
  },
  {
    norad: null,
    aliases: ["QMR-KWT-2", "RS95S"],
    uplinkMhz: 145.92,
    downlinkMhz: 436.95,
    mode: "FM / SSTV",
    callsign: null,
    status: "Testing",
    notes: "67 Hz CTCSS. During testing; may transmit SSTV images."
  },
  {
    norad: null,
    aliases: ["SO-50", "SAUDISAT-1C"],
    uplinkMhz: 145.85,
    downlinkMhz: 436.795,
    mode: "FM",
    callsign: null,
    status: "Active",
    notes: "67 Hz CTCSS. Has 10-minute timer. Arm with 2-second carrier and 74.4 Hz tone."
  },
  {
    norad: null,
    aliases: ["SO-125", "HADES-ICM"],
    uplinkMhz: 145.875,
    downlinkMhz: 436.666,
    mode: "FM",
    callsign: null,
    status: "Active",
    notes: null
  }
];

const AMATEUR_SELECTED_ALIASES = [
  "AO-91",
  "RADFXSAT",
  "FOX-1B",
  "AO-123",
  "ASRTU-1",
  "CAS-3H",
  "LILACSAT-2",
  "IO-86",
  "LAPAN-A2",
  "ISS",
  "PO-101",
  "DIWATA-2",
  "QMR-KWT-2",
  "RS95S",
  "SO-50",
  "SAUDISAT-1C",
  "SO-125",
  "HADES-ICM"
];

function isAmateurSelectedName(name, noradId = null) {
  if (String(noradId || "").trim() === "25544") {
    return true;
  }
  const rawUpper = String(name || "").toUpperCase();
  if (/\bISS\b/.test(rawUpper)) {
    return true;
  }
  const normalized = normalizeRadioName(name);
  if (!normalized) {
    return false;
  }
  return AMATEUR_SELECTED_ALIASES.some((alias) => {
    if (String(alias).toUpperCase() === "ISS") {
      return false;
    }
    const aliasKey = normalizeRadioName(alias);
    return aliasKey && normalized.includes(aliasKey);
  });
}

const TRACKED_FILTER_CONFIG = {
  key: "tracked",
  label: "Tracked",
  color: "#94a3b8"
};

const AMATEUR_SELECTED_FILTER_CONFIG = {
  key: "amateur_selected",
  label: "Amateur Radio Selected",
  color: "#22c55e"
};

const CATEGORY_CONFIG = [
  {
    key: "iss",
    label: "ISS",
    color: "#ff6b00",
    group: "stations",
    url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle",
    include: (name) => name.toUpperCase().includes("ISS")
  },
  {
    key: "amateur",
    label: "Amateur Radio",
    color: "#2a9d8f",
    group: "amateur",
    url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=amateur&FORMAT=tle"
  },
  {
    key: "starlink",
    label: "Starlink",
    color: "#3a86ff",
    group: "starlink",
    url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle"
  },
  {
    key: "weather",
    label: "Weather",
    color: "#8338ec",
    group: "weather",
    url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle"
  },
  {
    key: "fltsatcom",
    label: "FLTSATCOM",
    color: "#f59e0b",
    group: "active",
    url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
    include: (name) => isFleetSatcomName(name)
  },
  {
    key: "military",
    label: "Military",
    color: "#ef4444",
    group: "military",
    url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=military&FORMAT=tle",
    include: (name) => !isFleetSatcomName(name)
  },
  {
    key: "other",
    label: "Other Active",
    color: "#6c757d",
    group: "active",
    url: "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle",
    maxItems: 350
  }
];
const FILTER_CONFIG = [TRACKED_FILTER_CONFIG, AMATEUR_SELECTED_FILTER_CONFIG, ...CATEGORY_CONFIG];
const USE_MOCK_DATA = false;

const INITIAL_MAP_CENTER = [15, 0];
const LOCATION_VIEW_RANGE_KM = 2000;
const ACCENT_GREEN = "#23c55e";
const MIN_LAT = -85;
const MAX_LAT = 85;
const LON_BOUND = 1000000;
const map = L.map("map", {
  zoomControl: false,
  attributionControl: false,
  worldCopyJump: true,
  maxBounds: [
    [MIN_LAT, -LON_BOUND],
    [MAX_LAT, LON_BOUND]
  ],
  maxBoundsViscosity: 1.0
}).setView(INITIAL_MAP_CENTER, 3);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 12
}).addTo(map);

function getVerticalFitMinZoom() {
  const height = map.getSize().y || window.innerHeight;
  // Web Mercator's practical latitude span (-85..85) is about one world-tile tall at z=0.
  // Keep min zoom at the vertical-fit threshold so users can zoom out until that exact point.
  const zoom = Math.log2(height / 255.2) - 0.1;
  return Math.max(0, Math.min(12, zoom));
}

function applyVerticalFitConstraints(recenter = false) {
  const minZoom = getVerticalFitMinZoom();
  map.setMinZoom(minZoom);

  if (recenter) {
    map.setView(INITIAL_MAP_CENTER, minZoom, { animate: false });
    return;
  }

  if (map.getZoom() < minZoom) {
    map.setZoom(minZoom, { animate: false });
  }
}

function locationSelectionZoom(lat, lon) {
  const latDelta = LOCATION_VIEW_RANGE_KM / 111.32;
  const lonScale = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const lonDelta = LOCATION_VIEW_RANGE_KM / (111.32 * lonScale);
  const bounds = L.latLngBounds(
    [lat - latDelta, lon - lonDelta],
    [lat + latDelta, lon + lonDelta]
  );
  const zoomFromBounds = map.getBoundsZoom(bounds, false);
  const minZoom = typeof map.getMinZoom === "function" ? map.getMinZoom() : 0;
  return Math.max(minZoom, zoomFromBounds);
}

window.addEventListener("resize", () => {
  map.invalidateSize();
  applyVerticalFitConstraints();
});

const markerLayer = L.layerGroup().addTo(map);
const passLayer = L.layerGroup().addTo(map);
const orbitLayer = L.layerGroup().addTo(map);
const selectedSatLayer = L.layerGroup().addTo(map);
const selectedLosLayer = L.layerGroup().addTo(map);
const allLosLayer = L.layerGroup().addTo(map);
const observerLayer = L.layerGroup().addTo(map);

const statusEl = document.getElementById("status");
const filtersEl = document.getElementById("filters");
const satCountEl = document.getElementById("sat-count");
const satSearchInputEl = document.getElementById("sat-search-input");
const satSearchSuggestionsEl = document.getElementById("sat-search-suggestions");
const maxAltitudeToggleEl = document.getElementById("max-altitude-toggle");
const maxAltitudeInputWrapEl = document.getElementById("max-altitude-input-wrap");
const maxAltitudeInputEl = document.getElementById("max-altitude-input");
const maxAltitudeTextEl = document.getElementById("max-altitude-text");
const timelineEl = document.getElementById("timeline");
const timeLabelEl = document.getElementById("time-label");
const playToggleEl = document.getElementById("play-toggle");
const resetTimeEl = document.getElementById("reset-time");
const speedSelectEl = document.getElementById("speed-select");
const satComboInputEl = document.getElementById("sat-combo-input");
const satComboSuggestBoxEl = document.getElementById("sat-combo-suggest-box");
const passesDaysSelectEl = document.getElementById("passes-days-select");
const passesListEl = document.getElementById("passes-list");
const timeFormatSelectEl = document.getElementById("time-format-select");
const allLosToggleEl = document.getElementById("all-los-toggle");
const losOnlyToggleEl = document.getElementById("los-only-toggle");
const showPassesToggleEl = document.getElementById("show-passes-toggle");
const showPassesTogglePassesEl = document.getElementById("show-passes-toggle-passes");
const satInfoEl = document.getElementById("sat-info");
const geoPermissionPopupEl = document.getElementById("geo-permission-popup");
const geoPermissionBtnEl = document.getElementById("geo-permission-btn");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");
const filtersPanelEl = document.querySelector('.tab-panel[data-panel="filters"]');
const locationQueryEl = document.getElementById("location-query");
const locationSuggestBoxEl = document.getElementById("location-suggest-box");
const searchLocationEl = document.getElementById("search-location");
const resetLocationEl = document.getElementById("reset-location");
const locationResultsWrapEl = document.getElementById("location-results-wrap");
const locationResultsEl = document.getElementById("location-results");
const spaceTrackIdentityEl = document.getElementById("spacetrack-identity");
const spaceTrackPasswordEl = document.getElementById("spacetrack-password");
const saveProviderSettingsEl = document.getElementById("save-provider-settings");
const providerStatusEl = document.getElementById("provider-status");

const observerLatEl = document.getElementById("observer-lat");
const observerLonEl = document.getElementById("observer-lon");
const observerAltEl = document.getElementById("observer-alt");
const sidebarToggleEl = document.getElementById("sidebar-toggle");
const sidebarStackEl = document.querySelector(".sidebar-stack");
const sidebarMainEl = document.getElementById("sidebar-main");
const sidebarLocationEl = document.getElementById("sidebar-location");
const sidebarLocationScrollEl = sidebarLocationEl?.querySelector(".sidebar-scroll") || null;
const locationFilterDetailsEl = document.querySelector(".location-filter-bottom");
const locationSummaryValueEl = document.getElementById("location-summary-value");
const locationSummaryActionEl = document.getElementById("location-summary-action");
const computePassesEl = document.getElementById("compute-passes");

let satellites = [];
let markers = new Map();
let selectedCategories = new Set(
  FILTER_CONFIG.filter((c) => c.key !== "starlink").map((c) => c.key)
);
let trackedSatIds = new Set();
let observerMarker = null;
let simulatedTimeMs = Date.now();
let speed = Number(speedSelectEl.value);
let playing = true;
let lastTick = Date.now();
let locationCandidates = [];
let satSearchCandidates = [];
let satSearchActiveIndex = -1;
let satComboSuggestCandidates = [];
let satComboSuggestActiveIndex = -1;
let locationSuggestCandidates = [];
let locationSuggestActiveIndex = -1;
let locationSuggestDebounce = null;
let locationPreviewActive = false;
let selectedOrbitSatId = null;
let lastOrbitRenderMs = 0;
let lastAllLosRenderMs = 0;
let selectedSatId = null;
let selectedSatOutline = null;
let selectedLosCircles = null;
let allLosCirclesBySatId = new Map();
let satInfoRequestToken = 0;
const satInfoCache = new Map();
let activeProviderNotes = [];
let selectedSearchSatId = null;
let selectedPassSatId = "";
let renderedPassTracks = [];
let renderedPassItems = [];
let passHoverResetTimer = null;
let elevationRequestToken = 0;
const elevationCache = new Map();
const statusToastsByKey = new Map();
const statusQueue = [];
let activeStatusToast = null;
let amsatCsvRadioIndex = null;
let amsatCsvRadioLoadPromise = null;
let allLosEnabled = false;
let losOnlyEnabled = false;
let showPassesOnMap = true;
let maxSatelliteAltitudeKm = 5000;
let maxAltitudeEnabled = false;
let timeFormat = "24h";

const PROVIDER_KEYS = {
  spaceTrackIdentity: "satapp_space_track_identity",
  spaceTrackPassword: "satapp_space_track_password"
};
const WATCHED_SATS_KEY = "satapp_tracked_sat_ids";
const ALL_LOS_ENABLED_KEY = "satapp_all_los_enabled";
const LOS_ONLY_ENABLED_KEY = "satapp_los_only_enabled";
const SHOW_PASSES_ON_MAP_KEY = "satapp_show_passes_on_map";
const MAX_ALTITUDE_FILTER_KEY = "satapp_max_altitude_km";
const MAX_ALTITUDE_ENABLED_KEY = "satapp_max_altitude_enabled";
const PREFS_INITIALIZED_KEY = "satapp_prefs_initialized";
const OBSERVER_LOCATION_KEY = "satapp_observer_location";
const SAT_SNAPSHOT_KEY = "satapp_satellite_snapshot_v1";
const CATEGORY_FILTERS_KEY = "satapp_category_filters_enabled";
const TIME_FORMAT_KEY = "satapp_time_format";
const SHARE_VIEW_PARAM = "view";
const WORLD_COPY_SHIFTS = [-360, 0, 360];
const TIMELINE_JOG_STEP_MS = 600;
const TIMELINE_JOG_PX_PER_STEP = 8;

function setStatus(message, options = {}) {
  if (!statusEl || !message) {
    return;
  }

  if (options.key) {
    statusQueue.forEach((entry) => {
      if (entry.options?.key === options.key) {
        entry._skip = true;
      }
    });
  }

  statusQueue.push({ message, options });
  processStatusQueue();
}

function clearStatusToast(key) {
  if (!key) {
    return;
  }
  statusQueue.forEach((entry) => {
    if (entry.options?.key === key) {
      entry._skip = true;
    }
  });
  if (!statusToastsByKey.has(key)) {
    return;
  }
  const toast = statusToastsByKey.get(key);
  statusToastsByKey.delete(key);
  if (!toast || !toast.isConnected) {
    return;
  }
  toast.classList.remove("show");
  toast.classList.add("hide");
  setTimeout(() => {
    toast.remove();
    if (activeStatusToast === toast) {
      activeStatusToast = null;
    }
    processStatusQueue();
  }, 1200);
}

function processStatusQueue() {
  if (!statusEl || activeStatusToast) {
    return;
  }
  while (statusQueue.length && statusQueue[0]._skip) {
    statusQueue.shift();
  }
  const next = statusQueue.shift();
  if (!next) {
    return;
  }

  const { message, options } = next;
  if (options.key && statusToastsByKey.has(options.key)) {
    const existing = statusToastsByKey.get(options.key);
    if (existing?.isConnected) {
      existing.remove();
    }
    statusToastsByKey.delete(options.key);
  }

  const toast = document.createElement("div");
  toast.className = "status-toast";
  const body = document.createElement("div");
  body.className = "status-toast-body";

  const isLoadingMessage =
    options.loading === true ||
    /\.\.\.$/.test(message) ||
    /loading|searching|requesting/i.test(message);

  if (isLoadingMessage) {
    const baseText = String(message).replace(/\.\.\.$/, "");
    body.append(document.createTextNode(baseText));
    const dots = document.createElement("span");
    dots.className = "status-loading-dots";
    dots.setAttribute("aria-hidden", "true");
    dots.innerHTML = "<span>.</span><span>.</span><span>.</span>";
    body.appendChild(dots);
  } else {
    body.textContent = message;
  }

  toast.appendChild(body);

  if (options.actionLabel) {
    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = "status-toast-action";
    if (options.actionTone === "green") {
      actionBtn.classList.add("green");
    }
    actionBtn.textContent = options.actionLabel;
    actionBtn.addEventListener("click", () => {
      if (typeof options.onAction === "function") {
        options.onAction();
      } else if (options.actionHref) {
        window.open(options.actionHref, "_blank", "noopener,noreferrer");
      }
    });
    toast.appendChild(actionBtn);
  }

  statusEl.appendChild(toast);
  activeStatusToast = toast;
  if (options.key) {
    statusToastsByKey.set(options.key, toast);
  }

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  if (options.persist === true) {
    return;
  }

  const durationMs = Number.isFinite(options.durationMs) ? options.durationMs : 7000;
  setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hide");
    setTimeout(() => {
      toast.remove();
      if (options.key) {
        statusToastsByKey.delete(options.key);
      }
      if (activeStatusToast === toast) {
        activeStatusToast = null;
      }
      processStatusQueue();
    }, 1200);
  }, durationMs);
}

function setGeoPermissionPopupVisible(visible) {
  if (!geoPermissionPopupEl) {
    return;
  }
  geoPermissionPopupEl.classList.toggle("hidden", !visible);
}

function readProviderCredentials() {
  try {
    return {
      identity: localStorage.getItem(PROVIDER_KEYS.spaceTrackIdentity) || "",
      password: localStorage.getItem(PROVIDER_KEYS.spaceTrackPassword) || ""
    };
  } catch (error) {
    return { identity: "", password: "" };
  }
}

function writeProviderCredentials(identity, password) {
  try {
    localStorage.setItem(PROVIDER_KEYS.spaceTrackIdentity, identity);
    localStorage.setItem(PROVIDER_KEYS.spaceTrackPassword, password);
  } catch (error) {
    // Ignore localStorage permission issues.
  }
}

function updateProviderStatus() {
  if (!providerStatusEl) {
    return;
  }
  const creds = readProviderCredentials();
  if (!creds.identity || !creds.password) {
    providerStatusEl.textContent = "Space-Track not configured. Using CelesTrak + SatNOGS.";
    return;
  }
  providerStatusEl.textContent = "Space-Track credentials saved. ISS will prefer Space-Track data.";
}

function setActiveTab(tabName) {
  tabButtons.forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabName);
  });
}

function readTrackedSatIds() {
  try {
    const raw = localStorage.getItem(WATCHED_SATS_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(parsed.map((v) => String(v)));
  } catch (error) {
    return new Set();
  }
}

function writeTrackedSatIds() {
  try {
    localStorage.setItem(WATCHED_SATS_KEY, JSON.stringify(Array.from(trackedSatIds)));
  } catch (error) {
    // Ignore storage errors.
  }
}

function isTrackedSatellite(satId) {
  return trackedSatIds.has(String(satId));
}

function toggleTrackedSatellite(satId) {
  const key = String(satId);
  if (!key) {
    return false;
  }
  if (trackedSatIds.has(key)) {
    trackedSatIds.delete(key);
    writeTrackedSatIds();
    return false;
  }
  trackedSatIds.add(key);
  writeTrackedSatIds();
  return true;
}

function readAllLosEnabled() {
  try {
    return localStorage.getItem(ALL_LOS_ENABLED_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function writeAllLosEnabled(enabled) {
  try {
    localStorage.setItem(ALL_LOS_ENABLED_KEY, enabled ? "1" : "0");
  } catch (error) {
    // Ignore storage errors.
  }
}

function readLosOnlyEnabled() {
  try {
    return localStorage.getItem(LOS_ONLY_ENABLED_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function writeLosOnlyEnabled(enabled) {
  try {
    localStorage.setItem(LOS_ONLY_ENABLED_KEY, enabled ? "1" : "0");
  } catch (error) {
    // Ignore storage errors.
  }
}

function readShowPassesOnMap() {
  try {
    const raw = localStorage.getItem(SHOW_PASSES_ON_MAP_KEY);
    if (raw === null) {
      return true;
    }
    return raw === "1";
  } catch (error) {
    return true;
  }
}

function writeShowPassesOnMap(enabled) {
  try {
    localStorage.setItem(SHOW_PASSES_ON_MAP_KEY, enabled ? "1" : "0");
  } catch (error) {
    // Ignore storage errors.
  }
}

function syncShowPassesToggles() {
  if (showPassesToggleEl) {
    showPassesToggleEl.checked = showPassesOnMap;
  }
  if (showPassesTogglePassesEl) {
    showPassesTogglePassesEl.checked = showPassesOnMap;
  }
}

function readTimeFormat() {
  try {
    const raw = localStorage.getItem(TIME_FORMAT_KEY);
    return raw === "12h" ? "12h" : "24h";
  } catch (error) {
    return "24h";
  }
}

function writeTimeFormat(value) {
  try {
    localStorage.setItem(TIME_FORMAT_KEY, value === "12h" ? "12h" : "24h");
  } catch (error) {
    // Ignore storage errors.
  }
}

function syncTimeFormatControl() {
  if (!timeFormatSelectEl) {
    return;
  }
  timeFormatSelectEl.value = timeFormat === "12h" ? "12h" : "24h";
}

function readMaxAltitudeEnabled() {
  try {
    return localStorage.getItem(MAX_ALTITUDE_ENABLED_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function writeMaxAltitudeEnabled(enabled) {
  try {
    localStorage.setItem(MAX_ALTITUDE_ENABLED_KEY, enabled ? "1" : "0");
  } catch (error) {
    // Ignore storage errors.
  }
}

function readPrefsInitialized() {
  try {
    return localStorage.getItem(PREFS_INITIALIZED_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function writePrefsInitialized() {
  try {
    localStorage.setItem(PREFS_INITIALIZED_KEY, "1");
  } catch (error) {
    // Ignore storage errors.
  }
}

function readStoredObserverLocation() {
  try {
    const raw = localStorage.getItem(OBSERVER_LOCATION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    const lat = Number(parsed?.lat);
    const lon = Number(parsed?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }
    const alt = Number(parsed?.alt);
    return {
      lat,
      lon,
      alt: Number.isFinite(alt) ? Math.round(alt) : null,
      name: typeof parsed?.name === "string" ? parsed.name : ""
    };
  } catch (error) {
    return null;
  }
}

function writeStoredObserverLocation() {
  const coords = observerCoords();
  if (!coords) {
    try {
      localStorage.removeItem(OBSERVER_LOCATION_KEY);
    } catch (error) {
      // Ignore storage errors.
    }
    return;
  }
  const payload = {
    lat: coords.lat,
    lon: coords.lon,
    alt: Number.isFinite(Number(observerAltEl?.value)) ? Number(observerAltEl.value) : null,
    name: String(locationQueryEl?.value || "").trim()
  };
  try {
    localStorage.setItem(OBSERVER_LOCATION_KEY, JSON.stringify(payload));
  } catch (error) {
    // Ignore storage errors.
  }
}

function defaultSelectedCategories() {
  return new Set(FILTER_CONFIG.filter((c) => c.key !== "starlink").map((c) => c.key));
}

function readSelectedCategories() {
  try {
    const raw = localStorage.getItem(CATEGORY_FILTERS_KEY);
    if (!raw) {
      return defaultSelectedCategories();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return defaultSelectedCategories();
    }
    const allowed = new Set(FILTER_CONFIG.map((c) => c.key));
    const selected = parsed
      .map((key) => String(key))
      .filter((key) => allowed.has(key));
    return new Set(selected);
  } catch (error) {
    return defaultSelectedCategories();
  }
}

function writeSelectedCategories() {
  try {
    localStorage.setItem(CATEGORY_FILTERS_KEY, JSON.stringify(Array.from(selectedCategories)));
  } catch (error) {
    // Ignore storage errors.
  }
}

function readMaxSatelliteAltitudeKm() {
  try {
    const raw = localStorage.getItem(MAX_ALTITUDE_FILTER_KEY);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  } catch (error) {
    // Ignore storage errors.
  }
  return 5000;
}

function writeMaxSatelliteAltitudeKm(value) {
  try {
    localStorage.setItem(MAX_ALTITUDE_FILTER_KEY, String(value));
  } catch (error) {
    // Ignore storage errors.
  }
}

function syncMaxAltitudeControl() {
  if (!maxAltitudeToggleEl || !maxAltitudeInputEl || !maxAltitudeTextEl || !maxAltitudeInputWrapEl) {
    return;
  }
  maxAltitudeToggleEl.checked = maxAltitudeEnabled;
  if (maxAltitudeEnabled) {
    maxAltitudeInputWrapEl.hidden = false;
    maxAltitudeInputWrapEl.style.display = "inline-flex";
    maxAltitudeInputEl.hidden = false;
    maxAltitudeInputEl.disabled = false;
    maxAltitudeTextEl.hidden = true;
    maxAltitudeInputEl.value = String(maxSatelliteAltitudeKm);
  } else {
    maxAltitudeInputWrapEl.hidden = true;
    maxAltitudeInputWrapEl.style.display = "none";
    maxAltitudeInputEl.hidden = true;
    maxAltitudeInputEl.disabled = true;
    maxAltitudeInputEl.value = "";
    maxAltitudeTextEl.hidden = false;
    maxAltitudeTextEl.textContent = "Set max altitude";
  }
}

function encodeBase64UrlFromUtf8(text) {
  try {
    const bytes = new TextEncoder().encode(String(text || ""));
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch (error) {
    return "";
  }
}

function decodeBase64UrlToUtf8(input) {
  const raw = String(input || "").trim();
  if (!raw) {
    return "";
  }
  const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
  const mod = padded.length % 4;
  const normalized = mod ? padded + "=".repeat(4 - mod) : padded;
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function activeTabName() {
  const active = document.querySelector(".tab-btn.active");
  return active?.dataset?.tab || "filters";
}

function satById(satId) {
  const key = String(satId || "");
  return satellites.find((sat) => sat.id === key) || null;
}

function satByNorad(norad) {
  const key = String(norad || "").trim();
  if (!key) {
    return null;
  }
  return satellites.find((sat) => String(sat.noradId || "").trim() === key) || null;
}

function buildShareViewState(preferredSatId = null) {
  const selectedSat =
    satById(preferredSatId) ||
    satById(selectedSatId) ||
    null;
  const selectedPassSat = satById(selectedPassSatId);
  const selectedSearchSat = satById(selectedSearchSatId);
  const coords = observerCoords();
  const mapCenter = map.getCenter();
  const speedMultiplier = currentSpeedMultiplier();
  const normalizedSpeed = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1;

  return {
    version: 1,
    tab: activeTabName(),
    categories: Array.from(selectedCategories),
    map: {
      lat: Number(mapCenter.lat.toFixed(6)),
      lon: Number(mapCenter.lng.toFixed(6)),
      zoom: map.getZoom()
    },
    observer: coords
      ? {
          lat: Number(coords.lat.toFixed(6)),
          lon: Number(coords.lon.toFixed(6)),
          alt: Number.isFinite(Number(observerAltEl?.value)) ? Math.round(Number(observerAltEl.value)) : null,
          name: String(locationQueryEl?.value || "").trim()
        }
      : null,
    filters: {
      allLosEnabled: Boolean(allLosEnabled),
      losOnlyEnabled: Boolean(losOnlyEnabled),
      showPassesOnMap: Boolean(showPassesOnMap),
      maxAltitudeEnabled: Boolean(maxAltitudeEnabled),
      maxAltitudeKm: Number.isFinite(Number(maxSatelliteAltitudeKm)) ? Math.round(Number(maxSatelliteAltitudeKm)) : 5000
    },
    time: {
      simulatedTimeMs: Math.round(simulatedTimeMs),
      speed: normalizedSpeed,
      playing: Boolean(playing),
      format: timeFormat === "12h" ? "12h" : "24h"
    },
    passes: {
      range: String(passesDaysSelectEl?.value || "1"),
      selectedNorad: selectedPassSat?.noradId ? String(selectedPassSat.noradId) : null
    },
    selected: {
      norad: selectedSat?.noradId ? String(selectedSat.noradId) : null,
      searchNorad: selectedSearchSat?.noradId ? String(selectedSearchSat.noradId) : null
    }
  };
}

function buildShareViewUrl(preferredSatId = null) {
  const payload = buildShareViewState(preferredSatId);
  const encoded = encodeBase64UrlFromUtf8(JSON.stringify(payload));
  const url = new URL(window.location.href);
  if (!encoded) {
    url.searchParams.delete(SHARE_VIEW_PARAM);
  } else {
    url.searchParams.set(SHARE_VIEW_PARAM, encoded);
  }
  return url.toString();
}

function readShareViewStateFromUrl() {
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get(SHARE_VIEW_PARAM);
    if (!raw) {
      return null;
    }
    const decoded = decodeBase64UrlToUtf8(raw);
    if (!decoded) {
      return null;
    }
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function applySharedViewStateEarly(state) {
  if (!state || typeof state !== "object") {
    return;
  }

  if (Array.isArray(state.categories)) {
    const allowed = new Set(FILTER_CONFIG.map((cfg) => cfg.key));
    const selected = state.categories
      .map((key) => String(key))
      .filter((key) => allowed.has(key));
    if (selected.length) {
      selectedCategories = new Set(selected);
      writeSelectedCategories();
    }
  }

  const filters = state.filters || {};
  if (typeof filters.allLosEnabled === "boolean") {
    allLosEnabled = filters.allLosEnabled;
    writeAllLosEnabled(allLosEnabled);
  }
  if (typeof filters.losOnlyEnabled === "boolean") {
    losOnlyEnabled = filters.losOnlyEnabled;
    writeLosOnlyEnabled(losOnlyEnabled);
  }
  if (typeof filters.showPassesOnMap === "boolean") {
    showPassesOnMap = filters.showPassesOnMap;
    writeShowPassesOnMap(showPassesOnMap);
  }
  if (typeof filters.maxAltitudeEnabled === "boolean") {
    maxAltitudeEnabled = filters.maxAltitudeEnabled;
    writeMaxAltitudeEnabled(maxAltitudeEnabled);
  }
  if (Number.isFinite(Number(filters.maxAltitudeKm)) && Number(filters.maxAltitudeKm) > 0) {
    maxSatelliteAltitudeKm = Math.round(Number(filters.maxAltitudeKm));
    writeMaxSatelliteAltitudeKm(maxSatelliteAltitudeKm);
  }

  const observer = state.observer || null;
  if (observer && Number.isFinite(Number(observer.lat)) && Number.isFinite(Number(observer.lon))) {
    observerLatEl.value = Number(observer.lat).toFixed(4);
    observerLonEl.value = Number(observer.lon).toFixed(4);
    observerAltEl.value = Number.isFinite(Number(observer.alt)) ? String(Math.round(Number(observer.alt))) : "";
    if (locationQueryEl) {
      locationQueryEl.value = String(observer.name || "").trim();
    }
    writeStoredObserverLocation();
  }

  const time = state.time || {};
  if (Number.isFinite(Number(time.simulatedTimeMs))) {
    simulatedTimeMs = Math.round(Number(time.simulatedTimeMs));
  }
  if (typeof time.playing === "boolean") {
    playing = time.playing;
  }
  if (time.format === "12h" || time.format === "24h") {
    timeFormat = time.format;
    writeTimeFormat(timeFormat);
  }
  if (Number.isFinite(Number(time.speed)) && Number(time.speed) > 0 && speedSelectEl) {
    const normalized = String(Number(time.speed));
    const option = Array.from(speedSelectEl.options).find((opt) => opt.value === normalized);
    if (option) {
      speedSelectEl.value = option.value;
      speed = currentSpeedMultiplier();
    }
  }

  const passes = state.passes || {};
  if (passesDaysSelectEl && passes.range) {
    const wanted = String(passes.range);
    const option = Array.from(passesDaysSelectEl.options).find((opt) => opt.value === wanted);
    if (option) {
      passesDaysSelectEl.value = option.value;
    }
  }

  if (state.tab) {
    setActiveTab(String(state.tab));
  }

  const mapState = state.map || {};
  if (
    Number.isFinite(Number(mapState.lat)) &&
    Number.isFinite(Number(mapState.lon)) &&
    Number.isFinite(Number(mapState.zoom))
  ) {
    map.setView([Number(mapState.lat), Number(mapState.lon)], Number(mapState.zoom), { animate: false });
  }

  syncMaxAltitudeControl();
  syncShowPassesToggles();
  syncTimeFormatControl();
  if (allLosToggleEl) {
    allLosToggleEl.checked = allLosEnabled;
  }
  if (losOnlyToggleEl) {
    losOnlyToggleEl.checked = losOnlyEnabled;
  }
  updateObserverMarker();
  updateComputePassesState();
  updateLocationSummary();
}

async function applySharedViewStateLate(state) {
  if (!state || typeof state !== "object") {
    return;
  }
  const selected = state.selected || {};
  const passes = state.passes || {};

  const searchSat = satByNorad(selected.searchNorad);
  if (searchSat) {
    selectedSearchSatId = searchSat.id;
    if (satSearchInputEl) {
      satSearchInputEl.value = `${searchSat.name} (${searchSat.noradId || "N/A"})`;
    }
  }

  const passSat = satByNorad(passes.selectedNorad);
  if (passSat) {
    setPassSatelliteInputById(passSat.id);
  }

  const selectedSat = satByNorad(selected.norad);
  if (selectedSat) {
    await activateSatelliteSelection(selectedSat, false);
  } else {
    redrawMarkers(true);
    renderPasses();
  }
}

async function copyTextToClipboard(text) {
  const payload = String(text || "");
  if (!payload) {
    return false;
  }
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(payload);
      return true;
    } catch (error) {
      // Fallback below.
    }
  }
  try {
    const area = document.createElement("textarea");
    area.value = payload;
    area.setAttribute("readonly", "readonly");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(area);
    return Boolean(copied);
  } catch (error) {
    return false;
  }
}

function applyMaxAltitudeInput() {
  if (!maxAltitudeInputEl) {
    return;
  }
  const parsed = Number(maxAltitudeInputEl.value);
  const safeValue = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 5000;
  maxSatelliteAltitudeKm = safeValue;
  maxAltitudeInputEl.value = String(safeValue);
  writeMaxSatelliteAltitudeKm(safeValue);
}

function setFiltersLoadingState(isLoading, message = "Loading satellites") {
  if (!satCountEl) {
    return;
  }

  if (isLoading) {
    satCountEl.classList.add("loading");
    satCountEl.innerHTML = `
      <span class="sat-loading-spinner" aria-hidden="true"></span>
      <span class="sat-loading-text">
        <span>${escapeHtml(message)}</span>
        <span class="status-loading-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
      </span>
    `;
    filtersPanelEl?.classList.add("loading");
    return;
  }

  satCountEl.classList.remove("loading");
  filtersPanelEl?.classList.remove("loading");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtNumber(value, digits = 2, suffix = "") {
  if (!Number.isFinite(value)) {
    return "N/A";
  }
  return `${value.toFixed(digits)}${suffix}`;
}

function fmtFreq(hzLow, hzHigh) {
  const low = Number(hzLow);
  const high = Number(hzHigh);
  if (!Number.isFinite(low) && !Number.isFinite(high)) {
    return "N/A";
  }
  if (Number.isFinite(low) && Number.isFinite(high) && low !== high) {
    return `${(low / 1e6).toFixed(3)}-${(high / 1e6).toFixed(3)} MHz`;
  }
  const single = Number.isFinite(low) ? low : high;
  return `${(single / 1e6).toFixed(3)} MHz`;
}

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeFuzzyToken(value) {
  return stripDiacritics(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function scoreSearchMatch(sat, queryUpper) {
  const nameUpper = sat.name.toUpperCase();
  const norad = String(sat.noradId || "");
  const queryNorm = normalizeFuzzyToken(queryUpper);
  const nameNorm = normalizeFuzzyToken(nameUpper);
  const noradNorm = normalizeFuzzyToken(norad);

  if (norad === queryUpper || (queryNorm && noradNorm === queryNorm)) {
    return 0;
  }
  if (norad.startsWith(queryUpper) || (queryNorm && noradNorm.startsWith(queryNorm))) {
    return 1;
  }
  if (nameUpper === queryUpper || (queryNorm && nameNorm === queryNorm)) {
    return 2;
  }
  if (nameUpper.startsWith(queryUpper) || (queryNorm && nameNorm.startsWith(queryNorm))) {
    return 3;
  }
  if (norad.includes(queryUpper) || (queryNorm && noradNorm.includes(queryNorm))) {
    return 4;
  }
  if (nameUpper.includes(queryUpper) || (queryNorm && nameNorm.includes(queryNorm))) {
    return 5;
  }
  return 99;
}

function findSatelliteSearchMatches(query) {
  const q = String(query || "").trim().toUpperCase();
  if (!q) {
    return [];
  }

  return satellites
    .map((sat) => ({ sat, score: scoreSearchMatch(sat, q) }))
    .filter((item) => item.score < 99)
    .sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }
      return a.sat.name.localeCompare(b.sat.name);
    })
    .slice(0, 10)
    .map((item) => item.sat);
}

function clearSatelliteSearchSuggestions() {
  satSearchCandidates = [];
  satSearchActiveIndex = -1;
  if (!satSearchSuggestionsEl) {
    return;
  }
  satSearchSuggestionsEl.innerHTML = "";
  satSearchSuggestionsEl.classList.remove("show");
}

function setSatSearchActiveIndex(index) {
  if (!satSearchSuggestionsEl || !satSearchCandidates.length) {
    satSearchActiveIndex = -1;
    return;
  }
  const count = satSearchCandidates.length;
  const normalized = ((Number(index) % count) + count) % count;
  satSearchActiveIndex = normalized;

  const rows = satSearchSuggestionsEl.querySelectorAll(".sat-suggest-item");
  rows.forEach((row, idx) => {
    const active = idx === normalized;
    row.classList.toggle("active", active);
    if (active) {
      row.scrollIntoView({ block: "nearest" });
    }
  });
}

function moveSatSearchActive(delta) {
  if (!satSearchCandidates.length) {
    return;
  }
  if (satSearchActiveIndex < 0) {
    setSatSearchActiveIndex(delta >= 0 ? 0 : satSearchCandidates.length - 1);
    return;
  }
  setSatSearchActiveIndex(satSearchActiveIndex + delta);
}

function getActiveSatSearchSuggestion() {
  if (!satSearchCandidates.length) {
    return null;
  }
  if (satSearchActiveIndex >= 0 && satSearchActiveIndex < satSearchCandidates.length) {
    return satSearchCandidates[satSearchActiveIndex];
  }
  return satSearchCandidates[0] || null;
}

function renderSatelliteSearchSuggestions(items) {
  satSearchCandidates = Array.isArray(items) ? items : [];
  satSearchActiveIndex = -1;
  if (!satSearchSuggestionsEl) {
    return;
  }

  satSearchSuggestionsEl.innerHTML = "";
  if (!satSearchCandidates.length) {
    satSearchSuggestionsEl.classList.remove("show");
    return;
  }

  satSearchCandidates.forEach((sat, idx) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "sat-suggest-item";
    row.innerHTML = `<span>${escapeHtml(sat.name)}</span><span class="sat-suggest-norad">#${escapeHtml(sat.noradId || "N/A")}</span>`;
    row.addEventListener("mouseenter", () => {
      setSatSearchActiveIndex(idx);
    });
    row.addEventListener("click", () => applySatelliteSearchSelection(sat));
    satSearchSuggestionsEl.appendChild(row);
  });

  satSearchSuggestionsEl.classList.add("show");
  setSatSearchActiveIndex(0);
}

function applySatelliteSearchSelection(sat) {
  selectedSearchSatId = sat.id;
  if (satSearchInputEl) {
    satSearchInputEl.value = `${sat.name} (${sat.noradId})`;
  }
  clearSatelliteSearchSuggestions();
  refreshSatelliteSelect();
  redrawMarkers(true);
  activateSatelliteSelection(sat, true);
  setStatus(`Filtered and selected ${sat.name} (${sat.noradId}).`);
}

function clearSatelliteSearchFilter() {
  if (!selectedSearchSatId) {
    return;
  }
  selectedSearchSatId = null;
  refreshSatelliteSelect();
  redrawMarkers(true);
}

function satDisplayLabel(sat) {
  return `${sat.name} (${sat.noradId || "N/A"})`;
}

function passSearchSatellites() {
  return satellites.slice().sort((a, b) => a.name.localeCompare(b.name));
}

function resolvePassSatelliteIdFromInput() {
  const query = String(satComboInputEl?.value || "").trim();
  const pinnedSatId = String(satComboInputEl?.dataset?.selectedSatId || "");
  if (!query) {
    return "";
  }

  const active = passSearchSatellites();
  if (pinnedSatId && active.some((sat) => sat.id === pinnedSatId)) {
    return pinnedSatId;
  }
  const queryUpper = query.toUpperCase();

  const exactByLabel = active.find((sat) => satDisplayLabel(sat) === query);
  if (exactByLabel) {
    return exactByLabel.id;
  }

  const exactByName = active.find((sat) => sat.name.toUpperCase() === queryUpper);
  if (exactByName) {
    return exactByName.id;
  }

  const exactByNorad = active.find((sat) => String(sat.noradId || "") === query);
  if (exactByNorad) {
    return exactByNorad.id;
  }

  const fuzzy = active
    .map((sat) => ({ sat, score: scoreSearchMatch(sat, queryUpper) }))
    .filter((item) => item.score < 99)
    .sort((a, b) => a.score - b.score)[0];

  return fuzzy ? fuzzy.sat.id : "";
}

function setPassSatelliteInputById(satId) {
  selectedPassSatId = satId || "";
  if (!satComboInputEl) {
    return;
  }
  const sat = satellites.find((item) => item.id === satId);
  satComboInputEl.value = sat ? satDisplayLabel(sat) : "";
  if (satId) {
    satComboInputEl.dataset.selectedSatId = satId;
  } else {
    delete satComboInputEl.dataset.selectedSatId;
  }
}

function clearSatComboSuggestions() {
  satComboSuggestCandidates = [];
  satComboSuggestActiveIndex = -1;
  if (!satComboSuggestBoxEl) {
    return;
  }
  satComboSuggestBoxEl.innerHTML = "";
  satComboSuggestBoxEl.classList.remove("show");
  renderPasses();
}

function findPassSatelliteMatches(query, limit = 16) {
  const active = passSearchSatellites();
  const q = String(query || "").trim();
  if (!q) {
    return active.slice(0, limit);
  }

  const queryUpper = q.toUpperCase();
  return active
    .map((sat) => ({ sat, score: scoreSearchMatch(sat, queryUpper) }))
    .filter((item) => item.score < 99)
    .sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }
      return a.sat.name.localeCompare(b.sat.name);
    })
    .slice(0, limit)
    .map((item) => item.sat);
}

function renderSatComboSuggestions(items) {
  satComboSuggestCandidates = items;
  satComboSuggestActiveIndex = -1;
  if (!satComboSuggestBoxEl) {
    return;
  }

  satComboSuggestBoxEl.innerHTML = "";
  if (!items.length) {
    satComboSuggestBoxEl.classList.remove("show");
    return;
  }

  items.forEach((sat, idx) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "inline-suggest-item";
    row.dataset.index = String(idx);
    row.innerHTML = `<span class="location-suggest-primary">${escapeHtml(sat.name)}</span><span class="inline-suggest-meta">#${escapeHtml(sat.noradId || "N/A")}</span>`;
    row.addEventListener("mouseenter", () => {
      setSatComboSuggestActiveIndex(idx);
    });
    row.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    row.addEventListener("click", () => {
      setPassSatelliteInputById(sat.id);
      clearSatComboSuggestions();
      renderPasses();
    });
    satComboSuggestBoxEl.appendChild(row);
  });
  satComboSuggestBoxEl.classList.add("show");
  setSatComboSuggestActiveIndex(0);
}

function setSatComboSuggestActiveIndex(index, preview = true) {
  if (!satComboSuggestBoxEl || !satComboSuggestCandidates.length) {
    satComboSuggestActiveIndex = -1;
    return;
  }
  const count = satComboSuggestCandidates.length;
  const normalized = ((Number(index) % count) + count) % count;
  satComboSuggestActiveIndex = normalized;

  const rows = satComboSuggestBoxEl.querySelectorAll(".inline-suggest-item");
  rows.forEach((row, idx) => {
    const active = idx === normalized;
    row.classList.toggle("active", active);
    if (active) {
      row.scrollIntoView({ block: "nearest" });
    }
  });

  if (preview) {
    const sat = satComboSuggestCandidates[normalized];
    if (sat) {
      renderPasses(sat.id, { preview: true });
    }
  }
}

function moveSatComboSuggestActive(delta) {
  if (!satComboSuggestCandidates.length) {
    return;
  }
  if (satComboSuggestActiveIndex < 0) {
    setSatComboSuggestActiveIndex(delta >= 0 ? 0 : satComboSuggestCandidates.length - 1, true);
    return;
  }
  setSatComboSuggestActiveIndex(satComboSuggestActiveIndex + delta, true);
}

function getActiveSatComboSuggestion() {
  if (!satComboSuggestCandidates.length) {
    return null;
  }
  if (satComboSuggestActiveIndex >= 0 && satComboSuggestActiveIndex < satComboSuggestCandidates.length) {
    return satComboSuggestCandidates[satComboSuggestActiveIndex];
  }
  return satComboSuggestCandidates[0] || null;
}

async function activateSatelliteSelection(sat, centerMap = false) {
  selectedSatId = sat.id;
  setPassSatelliteInputById(sat.id);
  renderSelectedSatelliteOutline();
  renderSelectedLineOfSightCircle();
  selectedOrbitSatId = sat.id;
  renderSelectedOrbitPath(true);
  renderPasses();
  renderSatInfoLoading(sat.name);

  if (centerMap) {
    const pos = satPositionAt(sat, currentSimTime());
    if (pos) {
      map.panTo([pos.lat, pos.lon], { animate: true });
    }
  }

  const requestToken = ++satInfoRequestToken;
  try {
    const metadata = await fetchSatInfo(sat);
    if (requestToken !== satInfoRequestToken) {
      return;
    }
    renderSatInfo(sat, metadata);
  } catch (error) {
    if (requestToken !== satInfoRequestToken) {
      return;
    }
    renderSatInfo(sat, {});
    setStatus("Some satellite metadata sources are unavailable.");
  }
}

function parseIntlCodeFromTle(line1) {
  if (!line1 || line1.length < 17) {
    return "N/A";
  }
  const raw = line1.slice(9, 17).trim();
  return raw || "N/A";
}

function normalizeOrBlank(value) {
  if (value === undefined || value === null || value === "") {
    return "N/A";
  }
  return String(value);
}

function satcatStatus(value) {
  if (!value) {
    return "N/A";
  }
  const map = {
    "+": "Operational",
    "P": "Partially operational",
    "B": "Backup/Standby",
    "S": "Spare",
    "X": "Extended mission",
    "D": "Decayed",
    "?": "Unknown"
  };
  return map[value] || value;
}

function setSatInfoVisible(visible) {
  if (!satInfoEl) {
    return;
  }
  satInfoEl.classList.toggle("hidden", !visible);
  document.body.classList.toggle("sat-info-open", Boolean(visible));
}

function clearActiveSatelliteSelection(clearSearchFocus = false) {
  selectedSatId = null;
  selectedOrbitSatId = null;
  satInfoRequestToken += 1;
  selectedSatLayer.clearLayers();
  selectedSatOutline = null;
  selectedLosLayer.clearLayers();
  selectedLosCircles = null;
  orbitLayer.clearLayers();
  setPassSatelliteInputById("");

  if (clearSearchFocus) {
    selectedSearchSatId = null;
    if (satSearchInputEl) {
      satSearchInputEl.value = "";
    }
    clearSatelliteSearchSuggestions();
  }

  setSatInfoVisible(false);
  redrawMarkers(true);
  renderPasses();
}

function renderSatInfoLoading(name) {
  setSatInfoVisible(true);
  satInfoEl.innerHTML = `
    <h3>Satellite Info</h3>
    <p><strong>${escapeHtml(name)}</strong></p>
    <p class="muted">Loading metadata...</p>
    <button type="button" class="sat-info-close" id="sat-info-close">Close</button>
  `;
}

function orbitalParams(sat) {
  if (sat.mockOrbit) {
    const earthRadiusKm = 6378.137;
    const semiMajorKm = earthRadiusKm + sat.mockOrbit.altKm;
    return {
      semiMajorKm,
      perigeeKm: sat.mockOrbit.altKm,
      apogeeKm: sat.mockOrbit.altKm,
      periodMin: sat.mockOrbit.periodMin,
      inclDeg: sat.mockOrbit.inclinationDeg
    };
  }

  const mu = 398600.4418;
  const earthRadiusKm = 6378.137;
  const nRadPerSec = sat.satrec.no / 60;
  if (!Number.isFinite(nRadPerSec) || nRadPerSec <= 0) {
    return null;
  }

  const semiMajorKm = Math.pow(mu / (nRadPerSec * nRadPerSec), 1 / 3);
  const ecc = sat.satrec.ecco;
  const perigeeKm = semiMajorKm * (1 - ecc) - earthRadiusKm;
  const apogeeKm = semiMajorKm * (1 + ecc) - earthRadiusKm;
  const periodMin = (2 * Math.PI) / nRadPerSec / 60;
  const inclDeg = satellite.radiansToDegrees(sat.satrec.inclo);

  return {
    semiMajorKm,
    perigeeKm,
    apogeeKm,
    periodMin,
    inclDeg
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchFirstJson(urls) {
  for (const url of urls) {
    try {
      return await fetchJson(url);
    } catch (error) {
      // Keep trying fallbacks.
    }
  }
  return null;
}

function asArray(payload) {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload.results)) {
    return payload.results;
  }
  return [payload];
}

function cleanPlainText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsvLineLocal(line) {
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

function parseMhzRangeToHzLocal(rawValue) {
  const raw = String(rawValue || "")
    .replace(/\*/g, "")
    .replace(/xxx/gi, "")
    .replace(/\s+/g, "");
  if (!raw) {
    return { low: null, high: null, unit: "Hz" };
  }
  const tokens = raw.split("/").filter(Boolean);
  const candidate = tokens.find((t) => /[\d.]+(?:-[\d.]+)?/.test(t)) || "";
  const rangeMatch = candidate.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const low = Math.round(Number(rangeMatch[1]) * 1e6);
    const high = Math.round(Number(rangeMatch[2]) * 1e6);
    return {
      low: Number.isFinite(low) ? low : null,
      high: Number.isFinite(high) ? high : Number.isFinite(low) ? low : null,
      unit: "Hz"
    };
  }
  const single = candidate.match(/(\d+(?:\.\d+)?)/);
  if (!single) {
    return { low: null, high: null, unit: "Hz" };
  }
  const hz = Math.round(Number(single[1]) * 1e6);
  return {
    low: Number.isFinite(hz) ? hz : null,
    high: Number.isFinite(hz) ? hz : null,
    unit: "Hz"
  };
}

function localTypeHint(label, mode) {
  const text = `${String(label || "")} ${String(mode || "")}`.toLowerCase();
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

function normalizeRadioName(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function manualRadioRowsForSatellite(sat) {
  if (!sat) {
    return [];
  }
  const norad = Number(sat.noradId);
  const normalizedName = normalizeRadioName(sat.name);
  const mhzToHz = (mhz) => {
    const n = Number(mhz);
    if (!Number.isFinite(n)) {
      return { low: null, high: null, unit: "Hz" };
    }
    const hz = Math.round(n * 1e6);
    return { low: hz, high: hz, unit: "Hz" };
  };

  return MANUAL_RADIO_OVERRIDES
    .filter((item) => {
      if (Number.isFinite(Number(item.norad)) && Number(item.norad) === norad) {
        return true;
      }
      const aliases = Array.isArray(item.aliases) ? item.aliases : [];
      return aliases.some((alias) => {
        const key = normalizeRadioName(alias);
        return key && normalizedName.includes(key);
      });
    })
    .map((item, idx) => {
      const aliasLabel = Array.isArray(item.aliases) ? item.aliases[0] : sat.name;
      return {
        id: `manual-radio-${sat.noradId || sat.id || "sat"}-${idx}`,
        source: "MANUAL",
        label: `${aliasLabel} (manual)`,
        typeHint: localTypeHint(aliasLabel, item.mode || ""),
        uplink: mhzToHz(item.uplinkMhz),
        downlink: mhzToHz(item.downlinkMhz),
        beacon: { low: null, high: null, unit: "Hz" },
        mode: item.mode || "N/A",
        callsign: item.callsign || null,
        status: item.status || "Unknown",
        notes: item.notes || null
      };
    });
}

async function ensureLocalAmsatCsvRadioIndex() {
  if (amsatCsvRadioIndex) {
    return amsatCsvRadioIndex;
  }
  if (amsatCsvRadioLoadPromise) {
    return amsatCsvRadioLoadPromise;
  }

  amsatCsvRadioLoadPromise = (async () => {
    const map = new Map();
    try {
      const response = await fetch("/amsat-all-frequencies.csv", { cache: "no-store" });
      if (!response.ok) {
        amsatCsvRadioIndex = map;
        return map;
      }
      const text = await response.text();
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length);
      if (!lines.length) {
        amsatCsvRadioIndex = map;
        return map;
      }
      const headers = parseCsvLineLocal(lines[0]).map((h) => h.trim());
      const idx = (name) => headers.indexOf(name);
      const noradIdx = idx("norad_id");
      const nameIdx = idx("name");
      const uplinkIdx = idx("uplink");
      const downlinkIdx = idx("downlink");
      const beaconIdx = idx("beacon");
      const modeIdx = idx("mode");
      const callsignIdx = idx("callsign");
      const statusIdx = idx("status");
      if (noradIdx < 0) {
        amsatCsvRadioIndex = map;
        return map;
      }

      for (let i = 1; i < lines.length; i += 1) {
        const cols = parseCsvLineLocal(lines[i]);
        const norad = String(cols[noradIdx] || "").trim();
        if (!/^\d+$/.test(norad)) {
          continue;
        }
        const name = String(cols[nameIdx] || "").trim();
        const mode = String(cols[modeIdx] || "").trim();
        const entry = {
          id: `amsat-csv-local-${norad}-${i}`,
          source: "AMSAT_CSV",
          label: mode ? `${mode} (${name})` : `${name} (AMSAT CSV)`,
          typeHint: localTypeHint(name, mode),
          uplink: parseMhzRangeToHzLocal(cols[uplinkIdx]),
          downlink: parseMhzRangeToHzLocal(cols[downlinkIdx]),
          beacon: parseMhzRangeToHzLocal(cols[beaconIdx]),
          mode: mode || "N/A",
          callsign: String(cols[callsignIdx] || "").trim() || null,
          status: String(cols[statusIdx] || "").trim() || "Unknown",
          notes: null
        };
        const arr = map.get(norad) || [];
        arr.push(entry);
        map.set(norad, arr);
      }
    } catch (error) {
      // Ignore local CSV loading errors, keep empty map.
    }
    amsatCsvRadioIndex = map;
    return map;
  })();

  return amsatCsvRadioLoadPromise;
}

function dedupeRadioTransmitters(rows) {
  const seen = new Set();
  return (rows || []).filter((tx) => {
    const key = [
      String(tx.label || "").toLowerCase(),
      tx.uplink?.low ?? "",
      tx.uplink?.high ?? "",
      tx.downlink?.low ?? "",
      tx.downlink?.high ?? "",
      String(tx.mode || "").toLowerCase(),
      String(tx.callsign || "").toLowerCase()
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

async function fetchSatInfo(sat) {
  const noradId = sat?.noradId;
  if (USE_MOCK_DATA) {
    const satItem = satellites.find((item) => item.noradId === noradId);
    const satNameRoot = sat?.name?.split(" ")[0] || "MOCK";
    const mockTx =
      satItem?.category === "amateur"
        ? [
            {
              description: "CW Beacon",
              uplink_low: 145950000,
              uplink_high: 145950000,
              downlink_low: 435250000,
              downlink_high: 435250000,
              callsign: `${satNameRoot}-1`,
              mode: "CW",
              status: "Active"
            },
            {
              description: "FM Voice",
              uplink_low: 145880000,
              uplink_high: 145980000,
              downlink_low: 436500000,
              downlink_high: 436600000,
              callsign: `${satNameRoot}-2`,
              mode: "FM",
              status: "Active"
            }
          ]
        : [];

    return {
      satcat: {
        NORAD_CAT_ID: noradId,
        OBJECT_ID: satItem?.mockIntlCode || "MOCK-000A",
        RCSVALUE: satItem?.category === "starlink" ? "Small" : "Medium",
        LAUNCH: satItem?.mockLaunchDate || "2025-01-01",
        SITE: satItem?.mockLaunchSite || "Mock Launch Site",
        OWNER: "Mock Provider",
        OPSTAT: "+"
      },
      radio: {
        norad: Number(noradId),
        satName: sat?.name || `NORAD ${noradId}`,
        source: { satnogs: true, amsat: false },
        transmitters: mockTx.map((tx, idx) => ({
          id: idx + 1,
          label: tx.description || "Mock TX",
          typeHint: "unknown",
          uplink: { low: Number(tx.uplink_low) || null, high: Number(tx.uplink_high) || null, unit: "Hz" },
          downlink: { low: Number(tx.downlink_low) || null, high: Number(tx.downlink_high) || null, unit: "Hz" },
          beacon: { low: null, high: null, unit: "Hz" },
          mode: tx.mode || "N/A",
          callsign: tx.callsign || null,
          status: tx.status || "Unknown",
          notes: null
        })),
        status: {
          provider: "none",
          lastReportTime: null,
          lastReport: null,
          recentReportsCount: 0
        },
        fetchedAt: new Date().toISOString()
      }
    };
  }

  if (satInfoCache.has(sat.id)) {
    return satInfoCache.get(sat.id);
  }

  const satcatPromise = fetchFirstJson([
    `https://celestrak.org/satcat/records.php?CATNR=${noradId}&FORMAT=json`
  ]);
  const radioPromise = fetchFirstJson([
    `/api/sat/${encodeURIComponent(String(noradId))}/radio`
  ]);

  const [satcatRaw, radio, localCsvIndex] = await Promise.all([
    satcatPromise,
    radioPromise,
    ensureLocalAmsatCsvRadioIndex()
  ]);

  const satcat = asArray(satcatRaw)[0] || null;
  const localRows = localCsvIndex?.get(String(noradId)) || [];
  const manualRows = manualRadioRowsForSatellite(sat);
  const extraRows = [...localRows, ...manualRows];
  let mergedRadio = radio || null;
  if (mergedRadio && Array.isArray(mergedRadio.transmitters)) {
    const mergedTransmitters = dedupeRadioTransmitters([...mergedRadio.transmitters, ...extraRows]);
    mergedRadio = {
      ...mergedRadio,
      source: {
        ...(mergedRadio.source || {}),
        amsatCsv: Boolean((mergedRadio.source && mergedRadio.source.amsatCsv) || localRows.length),
        manual: Boolean((mergedRadio.source && mergedRadio.source.manual) || manualRows.length)
      },
      transmitters: mergedTransmitters
    };
  } else if (extraRows.length) {
    mergedRadio = {
      norad: Number(noradId),
      satName: sat?.name || `NORAD ${noradId}`,
      source: { satnogs: false, amsat: false, amsatCsv: Boolean(localRows.length), manual: Boolean(manualRows.length) },
      transmitters: extraRows,
      status: { provider: "none", lastReportTime: null, lastReport: null, recentReportsCount: 0 },
      fetchedAt: new Date().toISOString()
    };
  }

  const payload = { satcat, radio: mergedRadio };
  satInfoCache.set(sat.id, payload);
  return payload;
}

function renderSatInfo(sat, metadata) {
  setSatInfoVisible(true);
  const params = orbitalParams(sat);
  const satcat = metadata?.satcat || {};
  const radioPayload = metadata?.radio || null;
  const txRows = Array.isArray(radioPayload?.transmitters) ? radioPayload.transmitters : [];

  const norad = sat.noradId || satcat.NORAD_CAT_ID || "N/A";
  const intlCode = satcat.OBJECT_ID || sat.mockIntlCode || parseIntlCodeFromTle(sat.line1);
  const source = sat.name || satcat.DATA_STATUS || satcat.OWNER || "CelesTrak / SatNOGS";
  const launchDate = satcat.LAUNCH || "N/A";
  const launchSite = satcat.SITE || "N/A";
  const rcs = satcat.RCSVALUE || satcat.RCS_SIZE || satcat.rcs || "N/A";

  const rows = [
    ["NORAD ID", norad],
    ["Int'l Code", intlCode],
    ["Perigee", fmtNumber(params?.perigeeKm, 1, " km")],
    ["Apogee", fmtNumber(params?.apogeeKm, 1, " km")],
    ["Inclination", fmtNumber(params?.inclDeg, 3, " deg").replace(" deg", " \u00b0")],
    ["Period", fmtNumber(params?.periodMin, 2, " min").replace(" min", " minutes")],
    ["Semi major axis", fmtNumber(params?.semiMajorKm, 2, " km")],
    ["RCS", normalizeOrBlank(rcs)],
    ["Launch date", normalizeOrBlank(launchDate)],
    ["Source", normalizeOrBlank(source)],
    ["Launch site", normalizeOrBlank(launchSite)],
    ["Status", satcatStatus(satcat.OPSTAT)]
  ];

  const rowsHtml = rows
    .map(([key, value]) => {
      return `<div class="sat-kv"><span class="sat-k">${escapeHtml(key)}</span><span class="sat-v">${escapeHtml(value)}</span></div>`;
    })
    .join("");

  let txHtml = `<p class="muted">No radio transmitter data available from SatNOGS/AMSAT CSV.</p>`;
  if (txRows.length) {
    txHtml = txRows
      .slice(0, 16)
      .map((tx) => {
        const beacon = tx.beacon ? fmtFreq(tx.beacon.low, tx.beacon.high) : "N/A";
        const uplink = tx.uplink ? fmtFreq(tx.uplink.low, tx.uplink.high) : "N/A";
        const downlink = tx.downlink ? fmtFreq(tx.downlink.low, tx.downlink.high) : "N/A";
        const callsign = tx.callsign || "N/A";
        const mode = tx.mode || "N/A";
        const status = tx.status || (tx.alive === false ? "Inactive" : "Active");
        const label = tx.label || "Transmitter";
        const sourceTag = tx.source || (radioPayload?.source?.satnogs ? "SatNOGS" : "Unknown");
        const typeHint = tx.typeHint || "unknown";
        const notes = tx.notes || "N/A";

        return `
          <div class="tx-card">
            <div class="tx-row"><span>Source</span><span>${escapeHtml(sourceTag)}</span></div>
            <div class="tx-row"><span>Label</span><span>${escapeHtml(label)}</span></div>
            <div class="tx-row"><span>Type</span><span>${escapeHtml(typeHint)}</span></div>
            <div class="tx-row"><span>Uplink</span><span>${escapeHtml(uplink)}</span></div>
            <div class="tx-row"><span>Downlink</span><span>${escapeHtml(downlink)}</span></div>
            <div class="tx-row"><span>Beacon</span><span>${escapeHtml(beacon)}</span></div>
            <div class="tx-row"><span>Callsign</span><span>${escapeHtml(callsign)}</span></div>
            <div class="tx-row"><span>Mode</span><span>${escapeHtml(mode)}</span></div>
            <div class="tx-row"><span>Status</span><span>${escapeHtml(String(status))}</span></div>
            <div class="tx-row"><span>Notes</span><span>${escapeHtml(notes)}</span></div>
          </div>
        `;
      })
      .join("");
  }

  const statusInfo = radioPayload?.status || {};
  const statusLine =
    statusInfo.provider === "amsat"
      ? `<p class="muted">AMSAT reports: ${escapeHtml(String(statusInfo.recentReportsCount || 0))}</p>`
      : "";

  const descriptionText = cleanPlainText(statusInfo.lastReport || "");
  const descriptionHtml = descriptionText
    ? `<p class="sat-description">${escapeHtml(descriptionText)}</p>`
    : "";
  const isTracked = isTrackedSatellite(sat.id);

  satInfoEl.innerHTML = `
    <div class="sat-info-head">
      <h3>${escapeHtml(sat.name)}</h3>
      <div class="sat-info-actions">
        <button
          type="button"
          class="sat-share-btn"
          id="sat-share-copy"
          data-sat-id="${escapeHtml(sat.id)}"
          title="Copy share link"
          aria-label="Copy share link"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M10.59 13.41a1 1 0 0 1 0-1.41l3.59-3.59a3 3 0 0 1 4.24 4.24l-2.12 2.12a3 3 0 0 1-4.24 0 1 1 0 0 1 1.41-1.41 1 1 0 0 0 1.42 0l2.12-2.12a1 1 0 1 0-1.42-1.41l-3.59 3.58a1 1 0 0 1-1.42 0Z"/>
            <path d="M13.41 10.59a1 1 0 0 1 0 1.41l-3.59 3.59a3 3 0 0 1-4.24-4.24l2.12-2.12a3 3 0 0 1 4.24 0 1 1 0 1 1-1.41 1.41 1 1 0 0 0-1.42 0L7 12.76a1 1 0 1 0 1.42 1.41l3.59-3.58a1 1 0 0 1 1.41 0Z"/>
          </svg>
        </button>
        <button
          type="button"
          class="sat-watch-btn ${isTracked ? "active" : ""}"
          id="sat-watch-toggle"
          data-sat-id="${escapeHtml(sat.id)}"
          aria-pressed="${isTracked ? "true" : "false"}"
          title="${isTracked ? "Remove from Tracked" : "Add to Tracked"}"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 5C6.5 5 2.1 8.3 1 12c1.1 3.7 5.5 7 11 7s9.9-3.3 11-7c-1.1-3.7-5.5-7-11-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="sat-kv-grid">${rowsHtml}</div>
    <h4>Amateur Radio</h4>
    ${txHtml}
    ${statusLine}
    ${descriptionHtml}
    <button type="button" class="sat-info-close" id="sat-info-close">Close</button>
  `;
}

function parseTLE(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const records = [];
  for (let i = 0; i < lines.length - 1; i += 1) {
    const line1 = lines[i];
    const line2 = lines[i + 1];
    if (line1.startsWith("1 ") && line2.startsWith("2 ")) {
      const prev = i > 0 ? lines[i - 1] : "";
      const name = prev && !prev.startsWith("1 ") && !prev.startsWith("2 ") ? prev : `SAT ${line1.slice(2, 7).trim()}`;
      records.push({ name, line1, line2 });
    }
  }
  return records;
}

async function fetchFleetSatcomRecords() {
  const out = [];

  for (const target of FLEET_SATCOM_TARGETS) {
    try {
      const text = await fetchTextWithRetry(
        `https://celestrak.org/NORAD/elements/gp.php?CATNR=${target.noradId}&FORMAT=tle`,
        2
      );
      const parsed = parseTLE(text);
      if (!parsed.length) {
        continue;
      }
      const rec = parsed[0];
      out.push({
        name: target.name,
        line1: rec.line1,
        line2: rec.line2
      });
    } catch (error) {
      // Keep loading other FLTSATCOM targets.
    }
  }

  return out;
}

function keepCanonicalIssRecord(records) {
  const canonical = records.find((r) => r.line1.slice(2, 7).trim() === "25544");
  if (canonical) {
    return [canonical];
  }

  const byName = records.find((r) => r.name.toUpperCase().includes("ISS"));
  return byName ? [byName] : [];
}

function buildMockSatellites() {
  const colorByCategory = new Map(CATEGORY_CONFIG.map((cfg) => [cfg.key, cfg.color]));
  const specs = [
    { name: "ISS (MOCK)", noradId: "25544", category: "iss", intl: "1998-067A", periodMin: 92.7, incl: 51.6, raan: -20, phase: 0, altKm: 420 },
    { name: "AO-91 (MOCK)", noradId: "43017", category: "amateur", intl: "2017-073E", periodMin: 97.0, incl: 97.7, raan: 40, phase: 65, altKm: 500 },
    { name: "LILACSAT-2 (MOCK)", noradId: "40908", category: "amateur", intl: "2015-049K", periodMin: 94.8, incl: 97.3, raan: 120, phase: 130, altKm: 470 },
    { name: "STARLINK-3001 (MOCK)", noradId: "72001", category: "starlink", intl: "2024-001A", periodMin: 95.2, incl: 53.0, raan: -70, phase: 30, altKm: 550 },
    { name: "STARLINK-3002 (MOCK)", noradId: "72002", category: "starlink", intl: "2024-001B", periodMin: 95.4, incl: 53.1, raan: -85, phase: 120, altKm: 550 },
    { name: "STARLINK-3003 (MOCK)", noradId: "72003", category: "starlink", intl: "2024-001C", periodMin: 95.0, incl: 53.2, raan: -100, phase: 220, altKm: 550 },
    { name: "NOAA-19 (MOCK)", noradId: "33591", category: "weather", intl: "2009-005A", periodMin: 102.1, incl: 99.2, raan: 10, phase: 85, altKm: 870 },
    { name: "METOP-B (MOCK)", noradId: "38771", category: "weather", intl: "2012-049A", periodMin: 101.4, incl: 98.7, raan: 75, phase: 160, altKm: 815 },
    { name: "HST (MOCK)", noradId: "20580", category: "other", intl: "1990-037B", periodMin: 95.4, incl: 28.5, raan: 135, phase: 260, altKm: 540 },
    { name: "TIANGONG (MOCK)", noradId: "48274", category: "other", intl: "2021-035A", periodMin: 92.1, incl: 41.5, raan: -145, phase: 300, altKm: 390 }
  ];

  return specs.map((s) => ({
    id: `${s.name}|${s.noradId}`,
    category: s.category,
    color: colorByCategory.get(s.category) || "#6c757d",
    name: s.name,
    noradId: s.noradId,
    mockIntlCode: s.intl,
    mockLaunchDate: "2025-01-01",
    mockLaunchSite: "Mock Launch Complex",
    mockOrbit: {
      periodMin: s.periodMin,
      inclinationDeg: s.incl,
      raanDeg: s.raan,
      phaseDeg: s.phase,
      altKm: s.altKm
    }
  }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithRetry(url, attempts = 3) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetchWithTimeout(url, {}, 9000);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await sleep(350 * (i + 1));
      }
    }
  }
  throw lastError || new Error("Request failed");
}

async function fetchJsonWithRetry(url, attempts = 2) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetchWithTimeout(url, {}, 9000);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await sleep(250 * (i + 1));
      }
    }
  }
  throw lastError || new Error("Request failed");
}

function normalizeTleRecord(name, line1, line2) {
  if (!line1 || !line2) {
    return null;
  }
  if (!String(line1).startsWith("1 ") || !String(line2).startsWith("2 ")) {
    return null;
  }
  return {
    name: name && String(name).trim() ? String(name).trim() : `SAT ${String(line1).slice(2, 7).trim()}`,
    line1: String(line1).trim(),
    line2: String(line2).trim()
  };
}

function parseSatnogsTlePayload(payload) {
  if (!payload) {
    return [];
  }
  if (typeof payload === "string") {
    return parseTLE(payload);
  }

  const rows = Array.isArray(payload) ? payload : [payload];
  const records = [];
  rows.forEach((row) => {
    if (!row || typeof row !== "object") {
      return;
    }
    if (typeof row.tle === "string") {
      records.push(...parseTLE(row.tle));
      return;
    }

    const rec = normalizeTleRecord(
      row.name || row.satellite || row.object_name,
      row.line1 || row.tle1 || row.tle_line1,
      row.line2 || row.tle2 || row.tle_line2
    );
    if (rec) {
      records.push(rec);
    }
  });
  return records;
}

async function fetchIssFromSpaceTrack() {
  const creds = readProviderCredentials();
  if (!creds.identity || !creds.password) {
    return null;
  }

  const loginBody = new URLSearchParams({
    identity: creds.identity,
    password: creds.password
  });

  await fetch("https://www.space-track.org/ajaxauth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: loginBody.toString()
  });

  const tleText = await fetchTextWithRetry(
    "https://www.space-track.org/basicspacedata/query/class/gp_history/NORAD_CAT_ID/25544/orderby/EPOCH%20desc/limit/1/format/tle",
    2
  );
  const parsed = parseTLE(tleText);
  if (!parsed.length) {
    return null;
  }
  return keepCanonicalIssRecord(parsed);
}

async function fetchIssFromSatnogs() {
  const endpoints = [
    "https://db.satnogs.org/api/tle/?norad_cat_id=25544",
    "https://db.satnogs.org/api/tles/?norad_cat_id=25544",
    "https://db.satnogs.org/api/satellites/?norad_cat_id=25544"
  ];

  for (const endpoint of endpoints) {
    try {
      const payload = await fetchJsonWithRetry(endpoint, 1);
      const parsed = keepCanonicalIssRecord(parseSatnogsTlePayload(payload));
      if (parsed.length) {
        return parsed;
      }
    } catch (error) {
      // Continue through fallbacks.
    }
  }
  return null;
}

function getTleCacheKey(configKey) {
  return `satapp_tle_cache_${configKey}`;
}

function readCachedTle(configKey) {
  try {
    const raw = localStorage.getItem(getTleCacheKey(configKey));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.text !== "string") {
      return null;
    }
    return parsed.text;
  } catch (error) {
    return null;
  }
}

function writeCachedTle(configKey, text) {
  try {
    localStorage.setItem(getTleCacheKey(configKey), JSON.stringify({ savedAt: Date.now(), text }));
  } catch (error) {
    // Ignore storage limits / private mode restrictions.
  }
}

function buildSatellitesFromTleCache() {
  const byKey = new Map();
  for (const config of CATEGORY_CONFIG) {
    const cached = readCachedTle(config.key);
    if (!cached) {
      continue;
    }
    let records = parseTLE(cached);
    if (!records.length) {
      continue;
    }
    if (config.include) {
      records = records.filter((r) => config.include(r.name));
    }
    if (config.key === "iss") {
      records = keepCanonicalIssRecord(records).map((rec) => ({ ...rec, name: "ISS" }));
    }
    if (config.maxItems && records.length > config.maxItems) {
      records = records.slice(0, config.maxItems);
    }

    for (const rec of records) {
      const noradId = rec.line1.slice(2, 7).trim();
      const id = `NORAD-${noradId}`;
      if (byKey.has(id)) {
        continue;
      }
      byKey.set(id, {
        id,
        category: config.key,
        color: config.color,
        name: noradId === "25544" ? "ISS" : rec.name,
        line1: rec.line1,
        line2: rec.line2,
        noradId,
        satrec: satellite.twoline2satrec(rec.line1, rec.line2)
      });
    }
  }
  return Array.from(byKey.values());
}

function writeSatelliteSnapshot(items) {
  if (!Array.isArray(items) || !items.length) {
    return;
  }
  try {
    const payload = items
      .map((sat) => {
        if (!sat || !sat.id || !sat.category || !sat.name || !sat.noradId) {
          return null;
        }
        if (typeof sat.line1 === "string" && typeof sat.line2 === "string") {
          return {
            id: sat.id,
            category: sat.category,
            color: sat.color,
            name: sat.name,
            line1: sat.line1,
            line2: sat.line2,
            noradId: sat.noradId
          };
        }
        if (sat.mockOrbit) {
          return {
            id: sat.id,
            category: sat.category,
            color: sat.color,
            name: sat.name,
            noradId: sat.noradId,
            mockOrbit: sat.mockOrbit
          };
        }
        return null;
      })
      .filter(Boolean);

    if (!payload.length) {
      return;
    }

    localStorage.setItem(
      SAT_SNAPSHOT_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        satellites: payload
      })
    );
  } catch (error) {
    // Ignore storage limits / private mode restrictions.
  }
}

function normalizeLegacySatelliteCategory(category, noradId) {
  if (category !== "amateur_selected") {
    return category;
  }
  return String(noradId || "").trim() === "25544" ? "iss" : "amateur";
}

function readSatelliteSnapshot() {
  try {
    const raw = localStorage.getItem(SAT_SNAPSHOT_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed?.satellites) ? parsed.satellites : [];
    const out = [];
    rows.forEach((row) => {
      if (!row || !row.id || !row.category || !row.name || !row.noradId) {
        return;
      }
      const category = normalizeLegacySatelliteCategory(row.category, row.noradId);
      if (row.line1 && row.line2) {
        out.push({
          id: row.id,
          category,
          color: row.color,
          name: row.name,
          line1: row.line1,
          line2: row.line2,
          noradId: row.noradId,
          satrec: satellite.twoline2satrec(row.line1, row.line2)
        });
        return;
      }
      if (row.mockOrbit) {
        out.push({
          id: row.id,
          category,
          color: row.color,
          name: row.name,
          noradId: row.noradId,
          mockOrbit: row.mockOrbit
        });
      }
    });
    return out;
  } catch (error) {
    return [];
  }
}

async function loadSatellites(options = {}) {
  const { showLoading = true } = options;
  if (showLoading) {
    setFiltersLoadingState(true);
  }
  if (USE_MOCK_DATA) {
    clearStatusToast("sat-load");
    satellites = buildMockSatellites();
    writeSatelliteSnapshot(satellites);
    buildFilterControls();
    refreshSatelliteSelect();
    if (showLoading) {
      setFiltersLoadingState(false);
    }
    setStatus(`Loaded ${satellites.length} mock satellites.`);
    return;
  }

  if (showLoading) {
    setStatus("Loading TLE data from CelesTrak...", {
      loading: true,
      persist: true,
      key: "sat-load"
    });
  }
  activeProviderNotes = [];

  const byKey = new Map();

  for (const config of CATEGORY_CONFIG) {
    try {
      let text;
      try {
        text = await fetchTextWithRetry(config.url, 3);
        if (!parseTLE(text).length) {
          throw new Error("Feed returned no valid TLE lines");
        }
        writeCachedTle(config.key, text);
      } catch (liveError) {
        const cached = readCachedTle(config.key);
        if (!cached || !parseTLE(cached).length) {
          throw liveError;
        }
        text = cached;
        // Silent fallback: do not show noisy cache-miss notification to users.
      }
      let records = parseTLE(text);

      if (config.key === "fltsatcom") {
        const targeted = await fetchFleetSatcomRecords();
        if (targeted.length) {
          records = targeted;
        }
      }

      if (config.include) {
        records = records.filter((r) => config.include(r.name));
      }
      if (config.key === "iss") {
        let providerIss = null;
        try {
          providerIss = await fetchIssFromSpaceTrack();
          if (providerIss && providerIss.length) {
            activeProviderNotes.push("ISS via Space-Track");
          }
        } catch (error) {
          // Fall back to other providers.
        }

        if (!providerIss || !providerIss.length) {
          try {
            providerIss = await fetchIssFromSatnogs();
            if (providerIss && providerIss.length) {
              activeProviderNotes.push("ISS via SatNOGS");
            }
          } catch (error) {
            // Fall back to CelesTrak.
          }
        }

        records = providerIss && providerIss.length ? providerIss : keepCanonicalIssRecord(records);
        records = records.map((rec) => ({ ...rec, name: "ISS" }));
        if (!providerIss || !providerIss.length) {
          activeProviderNotes.push("ISS via CelesTrak");
        }
      }
      if (config.maxItems && records.length > config.maxItems) {
        records = records.slice(0, config.maxItems);
      }

      for (const rec of records) {
        const noradId = rec.line1.slice(2, 7).trim();
        const normalizedName = noradId === "25544" ? "ISS" : rec.name;
        const id = `NORAD-${noradId}`;
        if (byKey.has(id)) {
          continue;
        }
        byKey.set(id, {
          id,
          category: config.key,
          color: config.color,
          name: normalizedName,
          line1: rec.line1,
          line2: rec.line2,
          noradId,
          satrec: satellite.twoline2satrec(rec.line1, rec.line2)
        });
      }
    } catch (error) {
      console.error(`Failed to load ${config.key}:`, error);
      setStatus(`Some feeds failed (${config.key}). Continuing with available data.`);
    }
  }

  const loadedSatellites = Array.from(byKey.values());
  if (selectedSearchSatId && !loadedSatellites.some((sat) => sat.id === selectedSearchSatId)) {
    selectedSearchSatId = null;
    if (satSearchInputEl) {
      satSearchInputEl.value = "";
    }
    clearSatelliteSearchSuggestions();
  }
  if (!loadedSatellites.length) {
    if (satellites.length) {
      if (showLoading) {
        setFiltersLoadingState(false);
      }
      setStatus("Live satellite update failed. Showing last cached satellites.");
      return;
    }
    if (showLoading) {
      setFiltersLoadingState(false);
    }
    setStatus("No satellite data loaded. Check network access and reload.");
    return;
  }

  satellites = loadedSatellites;
  writeSatelliteSnapshot(satellites);
  clearStatusToast("sat-load");
  buildFilterControls();
  refreshSatelliteSelect();
  if (showLoading) {
    setFiltersLoadingState(false);
  }
  const providerSummary = activeProviderNotes.length ? ` (${activeProviderNotes.join(", ")})` : "";
  setStatus(`Loaded ${satellites.length} satellites${providerSummary}.`);
}

function buildFilterControls() {
  filtersEl.innerHTML = "";
  const countsByCategory = new Map();
  satellites.forEach((sat) => {
    countsByCategory.set(sat.category, (countsByCategory.get(sat.category) || 0) + 1);
  });
  const trackedCount = satellites.filter((sat) => isTrackedSatellite(sat.id)).length;
  const amateurSelectedCount = satellites.filter((sat) => isAmateurSelectedName(sat.name, sat.noradId)).length;

  const allRow = document.createElement("div");
  allRow.className = "filter-item";

  const allLabel = document.createElement("span");
  allLabel.className = "filter-label";
  const allText = document.createElement("span");
  allText.className = "filter-name";
  allText.textContent = "All Filters";
  allLabel.appendChild(allText);

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "location-summary-action filter-clear-btn";
  clearBtn.id = "clear-all-filters";
  clearBtn.textContent = "Clear";

  clearBtn.addEventListener("click", () => {
    if (!selectedCategories.size) {
      return;
    }
    selectedCategories = new Set();
    writeSelectedCategories();
    refreshSatelliteSelect();
    redrawMarkers(true);
    buildFilterControls();
  });

  allRow.appendChild(allLabel);
  allRow.appendChild(clearBtn);
  filtersEl.appendChild(allRow);

  for (const config of FILTER_CONFIG) {
    const row = document.createElement("div");
    row.className = "filter-item";
    const labelWrap = document.createElement("span");
    labelWrap.className = "filter-label";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = selectedCategories.has(config.key);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        selectedCategories.add(config.key);
      } else {
        selectedCategories.delete(config.key);
      }
      writeSelectedCategories();
      refreshSatelliteSelect();
      redrawMarkers(true);
      syncAllFiltersToggleState();
    });

    const bubble = document.createElement("span");
    bubble.className = "filter-bubble";
    bubble.style.backgroundColor = config.color;

    const text = document.createElement("span");
    text.className = "filter-name";
    text.textContent = config.label;

    const count = document.createElement("span");
    count.className = "filter-count";
    const countValue = config.key === TRACKED_FILTER_CONFIG.key
      ? trackedCount
      : config.key === AMATEUR_SELECTED_FILTER_CONFIG.key
        ? amateurSelectedCount
        : countsByCategory.get(config.key) || 0;
    count.textContent = `(${countValue})`;

    labelWrap.appendChild(bubble);
    labelWrap.appendChild(text);
    labelWrap.appendChild(count);
    const toggle = document.createElement("label");
    toggle.className = "filter-toggle";

    cb.className = "filter-toggle-input";
    const knob = document.createElement("span");
    knob.className = "filter-toggle-slider";

    toggle.appendChild(cb);
    toggle.appendChild(knob);
    row.appendChild(labelWrap);
    row.appendChild(toggle);
    filtersEl.appendChild(row);
  }

  syncAllFiltersToggleState();
  writeSelectedCategories();
}

function syncAllFiltersToggleState() {
  const clearBtn = document.getElementById("clear-all-filters");
  if (!clearBtn) {
    return;
  }
  clearBtn.disabled = selectedCategories.size === 0;
}

function currentSimTime() {
  return new Date(simulatedTimeMs);
}

function satPositionAt(sat, date) {
  if (sat.mockOrbit) {
    const orbit = sat.mockOrbit;
    const tMin = date.getTime() / 60000;
    const mean = (2 * Math.PI * tMin) / orbit.periodMin + satellite.degreesToRadians(orbit.phaseDeg);
    const lat = orbit.inclinationDeg * Math.sin(mean);
    let lon = orbit.raanDeg + satellite.radiansToDegrees(mean) - (360 * tMin) / 1440;
    lon = ((lon + 540) % 360) - 180;
    return {
      lat,
      lon,
      altKm: orbit.altKm
    };
  }

  const result = satellite.propagate(sat.satrec, date);
  if (!result || !result.position) {
    return null;
  }

  const gmst = satellite.gstime(date);
  const geodetic = satellite.eciToGeodetic(result.position, gmst);

  return {
    lat: satellite.degreesLat(geodetic.latitude),
    lon: satellite.degreesLong(geodetic.longitude),
    altKm: geodetic.height
  };
}

function orbitPeriodMs(sat) {
  if (sat.mockOrbit) {
    return sat.mockOrbit.periodMin * 60 * 1000;
  }

  const meanMotionRadPerMin = sat.satrec.no;
  if (!Number.isFinite(meanMotionRadPerMin) || meanMotionRadPerMin <= 0) {
    return null;
  }
  return (2 * Math.PI * 60 * 1000) / meanMotionRadPerMin;
}

function lineOfSightRadiusMeters(altKm) {
  const satAltKm = Number(altKm);
  if (!Number.isFinite(satAltKm) || satAltKm <= 0) {
    return null;
  }

  const observerAltKm = Math.max(0, (Number(observerAltEl?.value) || 0) / 1000);
  const earthRadiusKm = 6378.137;
  const satAlpha = Math.acos(earthRadiusKm / (earthRadiusKm + satAltKm));
  const obsAlpha = observerAltKm > 0 ? Math.acos(earthRadiusKm / (earthRadiusKm + observerAltKm)) : 0;
  return earthRadiusKm * (satAlpha + obsAlpha) * 1000;
}

function greatCircleDistanceKm(aLatDeg, aLonDeg, bLatDeg, bLonDeg) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6378.137;
  const lat1 = toRad(aLatDeg);
  const lat2 = toRad(bLatDeg);
  const dLat = lat2 - lat1;
  const dLon = toRad(bLonDeg - aLonDeg);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(Math.max(0, h))));
}

function isInObserverLosFootprint(sat, observer, date) {
  const deltaKm = observerLosFootprintDeltaKm(sat, observer, date);
  return Number.isFinite(deltaKm) && deltaKm >= 0;
}

function observerLosFootprintDeltaKm(sat, observer, date) {
  const satPos = satPositionAt(sat, date);
  if (!satPos) {
    return Number.NaN;
  }
  const radiusMeters = lineOfSightRadiusMeters(satPos.altKm);
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    return Number.NaN;
  }
  const observerLat = satellite.radiansToDegrees(observer.latitude);
  const observerLon = satellite.radiansToDegrees(observer.longitude);
  const surfaceDistanceKm = greatCircleDistanceKm(observerLat, observerLon, satPos.lat, satPos.lon);
  return radiusMeters / 1000 - surfaceDistanceKm;
}

function splitTrackOnDateLine(points) {
  if (!points.length) {
    return [];
  }

  const segments = [];
  let current = [points[0]];

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    if (Math.abs(next[1] - prev[1]) > 180) {
      if (current.length > 1) {
        segments.push(current);
      }
      current = [next];
    } else {
      current.push(next);
    }
  }

  if (current.length > 1) {
    segments.push(current);
  }
  return segments;
}

function densifyTrackSegment(points, insertsPerEdge = 3) {
  if (!Array.isArray(points) || points.length < 2 || insertsPerEdge <= 0) {
    return points;
  }
  const out = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    out.push(a);
    for (let k = 1; k <= insertsPerEdge; k += 1) {
      const t = k / (insertsPerEdge + 1);
      out.push([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function buildTrackPoints(sat, fromMs, toMs, stepMs) {
  const points = [];
  for (let t = fromMs; t <= toMs; t += stepMs) {
    const pos = satPositionAt(sat, new Date(t));
    if (pos) {
      points.push([pos.lat, pos.lon]);
    }
  }
  return points;
}

function wrappedLatLng(base, lonShiftDeg) {
  return [base[0], base[1] + lonShiftDeg];
}

function addWrappedPolyline(layer, points, style) {
  const lines = [];
  WORLD_COPY_SHIFTS.forEach((shift) => {
    const shifted = points.map((pt) => wrappedLatLng(pt, shift));
    const line = L.polyline(shifted, { smoothFactor: 1.2, ...style, noClip: true }).addTo(layer);
    lines.push(line);
  });
  return lines;
}

function setMarkerSetLatLng(markerSet, lat, lon) {
  markerSet.copies.forEach((copy, idx) => {
    const shift = WORLD_COPY_SHIFTS[idx] || 0;
    copy.setLatLng([lat, lon + shift]);
  });
}

function renderSelectedOrbitPath(force = false) {
  if (!selectedOrbitSatId) {
    orbitLayer.clearLayers();
    return;
  }

  const nowMs = Date.now();
  if (!force && nowMs - lastOrbitRenderMs < 1000) {
    return;
  }
  lastOrbitRenderMs = nowMs;

  const sat = satellites.find((item) => item.id === selectedOrbitSatId);
  if (!sat) {
    orbitLayer.clearLayers();
    selectedOrbitSatId = null;
    return;
  }

  const periodMs = orbitPeriodMs(sat);
  if (!periodMs) {
    return;
  }

  const simMs = currentSimTime().getTime();
  const halfPeriod = periodMs / 2;
  const stepMs = 5 * 1000;

  const pastPoints = buildTrackPoints(sat, simMs - halfPeriod, simMs, stepMs);
  const futurePoints = buildTrackPoints(sat, simMs, simMs + halfPeriod, stepMs);

  orbitLayer.clearLayers();
  splitTrackOnDateLine(pastPoints).forEach((segment) => {
    const smoothSegment = densifyTrackSegment(segment, 3);
    addWrappedPolyline(orbitLayer, smoothSegment, {
      color: sat.color || ACCENT_GREEN,
      weight: 1,
      opacity: 0.15,
      dashArray: "1 10",
      lineCap: "round",
      lineJoin: "round"
    });
  });
  splitTrackOnDateLine(futurePoints).forEach((segment) => {
    const smoothSegment = densifyTrackSegment(segment, 3);
    addWrappedPolyline(orbitLayer, smoothSegment, {
      color: sat.color || ACCENT_GREEN,
      weight: 1,
      opacity: 0.95,
      dashArray: "1 10",
      lineCap: "round",
      lineJoin: "round"
    });
  });
}

function renderSelectedSatelliteOutline() {
  if (!selectedSatId) {
    selectedSatLayer.clearLayers();
    selectedSatOutline = null;
    return;
  }

  const sat = satellites.find((item) => item.id === selectedSatId);
  const markerSet = markers.get(selectedSatId);
  if (!sat || !markerSet || !markerSet.copies.length) {
    selectedSatLayer.clearLayers();
    selectedSatOutline = null;
    return;
  }

  const baseRadius = sat.category === "iss" ? 3 : 2;
  const outlineRadius = baseRadius + 2;
  const baseLatLng = markerSet.copies[1].getLatLng();
  const outlineColor = markerSet.copies[1].options.fillColor || markerSet.copies[1].options.color || sat.color;

  if (!selectedSatOutline || !Array.isArray(selectedSatOutline)) {
    selectedSatLayer.clearLayers();
    selectedSatOutline = WORLD_COPY_SHIFTS.map((shift) => {
      const outline = L.circleMarker([baseLatLng.lat, baseLatLng.lng + shift], {
        radius: outlineRadius,
        color: outlineColor,
        weight: 1.5,
        opacity: 1,
        fill: false,
        interactive: false
      });
      outline.addTo(selectedSatLayer);
      return outline;
    });
  } else {
    selectedSatOutline.forEach((outline, idx) => {
      const shift = WORLD_COPY_SHIFTS[idx] || 0;
      outline.setLatLng([baseLatLng.lat, baseLatLng.lng + shift]);
      outline.setRadius(outlineRadius);
      outline.setStyle({
        color: outlineColor,
        opacity: 1
      });
    });
  }
}

function renderSelectedLineOfSightCircle() {
  if (!selectedSatId) {
    selectedLosLayer.clearLayers();
    selectedLosCircles = null;
    return;
  }

  const sat = satellites.find((item) => item.id === selectedSatId);
  const markerSet = markers.get(selectedSatId);
  if (!sat || !markerSet || !markerSet.copies.length) {
    selectedLosLayer.clearLayers();
    selectedLosCircles = null;
    return;
  }

  const baseLatLng = markerSet.copies[1].getLatLng();
  const pos = satPositionAt(sat, currentSimTime());
  const radiusMeters = lineOfSightRadiusMeters(pos?.altKm);
  if (!radiusMeters || radiusMeters <= 0) {
    selectedLosLayer.clearLayers();
    selectedLosCircles = null;
    return;
  }

  const circleColor = markerSet.copies[1].options.fillColor || markerSet.copies[1].options.color || sat.color;

  if (!selectedLosCircles || !Array.isArray(selectedLosCircles)) {
    selectedLosLayer.clearLayers();
    selectedLosCircles = WORLD_COPY_SHIFTS.map((shift) => {
      const circle = L.circle([baseLatLng.lat, baseLatLng.lng + shift], {
        radius: radiusMeters,
        color: circleColor,
        weight: 1,
        opacity: 0.75,
        fill: false,
        interactive: false,
        noClip: true
      });
      circle.addTo(selectedLosLayer);
      return circle;
    });
  } else {
    selectedLosCircles.forEach((circle, idx) => {
      const shift = WORLD_COPY_SHIFTS[idx] || 0;
      circle.setLatLng([baseLatLng.lat, baseLatLng.lng + shift]);
      circle.setRadius(radiusMeters);
      circle.setStyle({
        color: circleColor,
        opacity: 0.75
      });
    });
  }
}

function renderAllLosCircles(force = false) {
  if (!allLosEnabled) {
    allLosLayer.clearLayers();
    allLosCirclesBySatId = new Map();
    lastAllLosRenderMs = 0;
    return;
  }

  const observer = observerGd();
  if (!observer) {
    allLosLayer.clearLayers();
    allLosCirclesBySatId = new Map();
    return;
  }

  const simNow = currentSimTime();
  const active = visibleSatellites();
  const stillUsed = new Set();

  active.forEach((sat) => {
    const look = getLookAngles(sat, simNow, observer);
    if (!look || !Number.isFinite(look.elevation)) {
      return;
    }
    const elevationDeg = satellite.radiansToDegrees(look.elevation);
    if (elevationDeg < 0) {
      return;
    }

    const markerSet = markers.get(sat.id);
    if (!markerSet || !markerSet.copies || !markerSet.copies[1]) {
      return;
    }

    const pos = satPositionAt(sat, simNow);
    const radiusMeters = lineOfSightRadiusMeters(pos?.altKm);
    if (!radiusMeters || radiusMeters <= 0) {
      return;
    }

    const baseLatLng = markerSet.copies[1].getLatLng();
    const circleColor = markerSet.copies[1].options.fillColor || markerSet.copies[1].options.color || sat.color;
    const isOtherSelectedLos = Boolean(selectedSatId && sat.id !== selectedSatId);
    const circleOpacity = isOtherSelectedLos ? 0.15 : 0.45;
    let circles = allLosCirclesBySatId.get(sat.id);
    if (!circles || !Array.isArray(circles) || circles.length !== WORLD_COPY_SHIFTS.length) {
      circles?.forEach((c) => allLosLayer.removeLayer(c));
      circles = WORLD_COPY_SHIFTS.map((shift) => {
        const circle = L.circle([baseLatLng.lat, baseLatLng.lng + shift], {
          radius: radiusMeters,
          color: circleColor,
          weight: 1,
          opacity: circleOpacity,
          fill: false,
          interactive: false,
          noClip: true
        }).addTo(allLosLayer);
        return circle;
      });
      allLosCirclesBySatId.set(sat.id, circles);
    } else {
      circles.forEach((circle, idx) => {
        const shift = WORLD_COPY_SHIFTS[idx] || 0;
        circle.setLatLng([baseLatLng.lat, baseLatLng.lng + shift]);
        circle.setRadius(radiusMeters);
        circle.setStyle({
          color: circleColor,
          opacity: circleOpacity
        });
      });
    }
    stillUsed.add(sat.id);
  });

  for (const [satId, circles] of allLosCirclesBySatId.entries()) {
    if (stillUsed.has(satId)) {
      continue;
    }
    circles.forEach((circle) => allLosLayer.removeLayer(circle));
    allLosCirclesBySatId.delete(satId);
  }
}

function visibleSatellites() {
  const now = currentSimTime();
  const observer = losOnlyEnabled ? observerGd() : null;
  return satellites.filter((sat) => {
    const isSearchFocused = Boolean(selectedSearchSatId && sat.id === selectedSearchSatId);
    const categoryVisible =
      selectedCategories.has(sat.category) ||
      (selectedCategories.has(TRACKED_FILTER_CONFIG.key) && isTrackedSatellite(sat.id)) ||
      (selectedCategories.has(AMATEUR_SELECTED_FILTER_CONFIG.key) && isAmateurSelectedName(sat.name, sat.noradId));
    if (!categoryVisible && !isSearchFocused) {
      return false;
    }

    const pos = satPositionAt(sat, now);
    if (!pos || !Number.isFinite(pos.altKm)) {
      return false;
    }
    if (maxAltitudeEnabled && pos.altKm > maxSatelliteAltitudeKm) {
      return false;
    }

    if (losOnlyEnabled && observer) {
      const look = getLookAngles(sat, now, observer);
      if (!look || !Number.isFinite(look.elevation)) {
        return false;
      }
      const elevationDeg = satellite.radiansToDegrees(look.elevation);
      if (elevationDeg < 0) {
        return false;
      }
    }
    return true;
  });
}

function redrawMarkers(forceRebuild = false) {
  const now = currentSimTime();
  const active = visibleSatellites();
  const observerForLosDim = allLosEnabled && !losOnlyEnabled ? observerGd() : null;

  satCountEl.textContent = `${active.length} visible from selected categories${maxAltitudeEnabled ? ` (<= ${maxSatelliteAltitudeKm} km)` : ""}`;

  if (forceRebuild) {
    markerLayer.clearLayers();
    markers = new Map();
  }

  const stillUsed = new Set();

  for (const sat of active) {
    const pos = satPositionAt(sat, now);
    if (!pos) {
      continue;
    }

    let outsideLos = false;
    if (observerForLosDim) {
      const look = getLookAngles(sat, now, observerForLosDim);
      const elevationDeg =
        look && Number.isFinite(look.elevation) ? satellite.radiansToDegrees(look.elevation) : -90;
      outsideLos = elevationDeg < 0;
    }

    let satFillOpacity = 0.9;
    if (outsideLos) {
      satFillOpacity = Math.min(satFillOpacity, 0.15);
    }
    const satHitOpacity = 0;

    let markerSet = markers.get(sat.id);
    if (!markerSet) {
      const baseRadius = sat.category === "iss" ? 3 : 2;
      const hoverRadius = baseRadius * 2;
      const hoverHitWeight = baseRadius * 4;

      const copies = WORLD_COPY_SHIFTS.map((shift) => {
        const copy = L.circleMarker([pos.lat, pos.lon + shift], {
          radius: baseRadius,
          color: sat.color,
          fillColor: sat.color,
          fillOpacity: satFillOpacity,
          weight: hoverHitWeight,
          opacity: satHitOpacity
        });
        copy.addTo(markerLayer);
        return copy;
      });

      markerSet = { copies, baseRadius, hoverRadius };
      markerSet.copies[1].bindTooltip(sat.name);

      markerSet.copies.forEach((copy) => {
        copy.on("mouseover", () => {
          markerSet.copies.forEach((item) => item.setRadius(markerSet.hoverRadius));
        });
        copy.on("mouseout", () => {
          markerSet.copies.forEach((item) => item.setRadius(markerSet.baseRadius));
        });
      });

      markerSet.copies.forEach((copy) => copy.on("click", () => {
        activateSatelliteSelection(sat, false);
        setStatus(`Showing one-orbit path for ${sat.name}.`);
      }));

      markers.set(sat.id, markerSet);
    } else {
      setMarkerSetLatLng(markerSet, pos.lat, pos.lon);
      markerSet.copies.forEach((copy) => {
        copy.setStyle({
          color: sat.color,
          fillColor: sat.color,
          fillOpacity: satFillOpacity,
          opacity: satHitOpacity
        });
      });
    }

    stillUsed.add(sat.id);
  }

  for (const [satId, markerSet] of markers.entries()) {
    if (!stillUsed.has(satId)) {
      markerSet.copies.forEach((copy) => markerLayer.removeLayer(copy));
      markers.delete(satId);
      if (satId === selectedOrbitSatId) {
        selectedOrbitSatId = null;
        orbitLayer.clearLayers();
      }
      if (satId === selectedSatId) {
        selectedSatId = null;
        selectedSatLayer.clearLayers();
        selectedSatOutline = null;
        selectedLosLayer.clearLayers();
        selectedLosCircles = null;
        orbitLayer.clearLayers();
        setSatInfoVisible(false);
      }
    }
  }

  renderSelectedSatelliteOutline();
  renderSelectedLineOfSightCircle();
  renderSelectedOrbitPath();
  renderAllLosCircles(forceRebuild);
}

function refreshSatelliteSelect() {
  const active = passSearchSatellites();

  if (selectedPassSatId && !active.some((sat) => sat.id === selectedPassSatId)) {
    setPassSatelliteInputById("");
  }

  if (satComboInputEl && document.activeElement === satComboInputEl) {
    renderSatComboSuggestions(findPassSatelliteMatches(satComboInputEl.value));
  }
}

function formatDate(d) {
  const use12h = timeFormat === "12h";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: use12h,
    hourCycle: use12h ? "h12" : "h23"
  });
}

function formatDateOnly(d) {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
}

function formatTimeOnly(d) {
  const use12h = timeFormat === "12h";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: use12h,
    hourCycle: use12h ? "h12" : "h23"
  });
}

function cleanText(value) {
  return String(value || "").trim();
}

function isDistrictLikeName(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) {
    return false;
  }
  return /(rajon|district|county|municipality|ward|region)/i.test(text);
}

function locationCityCandidate(item) {
  return (
    cleanText(item.city) ||
    cleanText(item.town) ||
    cleanText(item.village) ||
    cleanText(item.municipality) ||
    cleanText(item.hamlet) ||
    cleanText(item.suburb)
  );
}

function formatLocationLabel(item) {
  const name = cleanText(item?.name);
  const city = locationCityCandidate(item);
  const county = cleanText(item?.county || item?.state_district);

  if (name) {
    if (isDistrictLikeName(name) && city && name.toLowerCase() !== city.toLowerCase()) {
      return `${name} (${city})`;
    }
    return name;
  }

  if (county && city && county.toLowerCase() !== city.toLowerCase()) {
    return `${county} (${city})`;
  }

  return city || county || "Unknown place";
}

function formatLocationMeta(item) {
  const region = cleanText(item?.state || item?.county || item?.state_district);
  const country = cleanText(item?.country);
  if (region && country) {
    return `${region}, ${country}`;
  }
  return region || country || "";
}

function updateLocationSummary() {
  if (!locationSummaryValueEl) {
    return;
  }

  const hasCoords = Boolean(observerCoords());
  const name = locationQueryEl?.value?.trim() || "";
  const altitudeText = observerAltEl?.value?.trim() ? `${observerAltEl.value.trim()} m` : "altitude not set";

  if (hasCoords && name) {
    locationSummaryValueEl.innerHTML = `${escapeHtml(name)} <span class="location-summary-alt">(${escapeHtml(altitudeText)})</span>`;
  } else if (hasCoords) {
    locationSummaryValueEl.innerHTML = `Coordinates set <span class="location-summary-alt">(${escapeHtml(altitudeText)})</span>`;
  } else {
    locationSummaryValueEl.textContent = "Not set";
  }

  if (locationSummaryActionEl && locationFilterDetailsEl) {
    locationSummaryActionEl.textContent = locationFilterDetailsEl.open ? "Close" : "Change";
  }
}

function layoutSidebarSections() {
  if (!sidebarStackEl || !sidebarMainEl || !sidebarLocationEl || !sidebarLocationScrollEl) {
    return;
  }
  const isOpen = Boolean(locationFilterDetailsEl?.open);
  sidebarLocationEl.classList.toggle("expanded", isOpen);
  sidebarStackEl.classList.toggle("location-only", isOpen);
}

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle("sidebar-collapsed", Boolean(collapsed));
  if (sidebarToggleEl) {
    sidebarToggleEl.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }
}

function elevationCacheKey(lat, lon) {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

async function fetchElevationMeters(lat, lon) {
  const key = elevationCacheKey(lat, lon);
  if (elevationCache.has(key)) {
    return elevationCache.get(key);
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon)
  });
  const response = await fetch(`https://api.open-meteo.com/v1/elevation?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = await response.json();
  const elevation = Array.isArray(payload?.elevation)
    ? payload.elevation[0]
    : Array.isArray(payload?.elevations)
      ? payload.elevations[0]
      : payload?.elevation;
  const meters = Number(elevation);
  if (!Number.isFinite(meters)) {
    throw new Error("No elevation in response");
  }

  elevationCache.set(key, meters);
  return meters;
}

async function updateObserverAltitudeFromCoords(coords, silent = true) {
  if (!coords) {
    return;
  }

  const requestToken = ++elevationRequestToken;
  try {
    const meters = await fetchElevationMeters(coords.lat, coords.lon);
    if (requestToken !== elevationRequestToken) {
      return;
    }
    observerAltEl.value = String(Math.round(meters));
    updateLocationSummary();
    layoutSidebarSections();
    writeStoredObserverLocation();
    redrawMarkers(true);
    renderPasses();
  } catch (error) {
    if (!silent) {
      setStatus("Could not load elevation from coordinates. Keeping current altitude.");
    }
  }
}

async function fetchIpLocation() {
  const urls = [
    "https://ipapi.co/json/",
    "https://ipwho.is/"
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }
      const payload = await response.json();
      const lat = Number(payload.latitude ?? payload.lat);
      const lon = Number(payload.longitude ?? payload.lon ?? payload.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        continue;
      }
      return {
        lat,
        lon,
        city: payload.city || payload.town || payload.region_city || "",
        country: payload.country_name || payload.country || ""
      };
    } catch (error) {
      // Try next provider.
    }
  }
  return null;
}

function getBrowserGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation API unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: Number(position.coords.latitude),
          lon: Number(position.coords.longitude)
        });
      },
      (error) => reject(error),
      {
        enableHighAccuracy: false,
        timeout: 9000,
        maximumAge: 15 * 60 * 1000
      }
    );
  });
}

async function reverseLookupLocationName(lat, lon) {
  try {
    const reverseParams = new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lon),
      addressdetails: "1",
      zoom: "10"
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${reverseParams.toString()}`);
    if (!response.ok) {
      return null;
    }
    const row = await response.json();
    return normalizeLocationItem({
      lat: String(lat),
      lon: String(lon),
      name:
        row.address?.city ||
        row.address?.town ||
        row.address?.village ||
        row.address?.municipality ||
        row.address?.hamlet ||
        row.name ||
        row.display_name ||
        "Detected location",
      state: row.address?.state || row.address?.county || "",
      country: row.address?.country || "",
      city: row.address?.city || "",
      town: row.address?.town || "",
      village: row.address?.village || "",
      municipality: row.address?.municipality || "",
      hamlet: row.address?.hamlet || "",
      suburb: row.address?.suburb || "",
      county: row.address?.county || "",
      state_district: row.address?.state_district || ""
    });
  } catch (error) {
    return null;
  }
}

async function autoSetLocationFromIp() {
  if (observerCoords()) {
    setGeoPermissionPopupVisible(false);
    return;
  }

  let resolved = null;
  try {
    const geo = await getBrowserGeolocation();
    resolved = await reverseLookupLocationName(geo.lat, geo.lon);
  } catch (error) {
    // Fallback to IP providers.
  }

  if (!resolved) {
    const ipLoc = await fetchIpLocation();
    if (ipLoc) {
      const rev = await reverseLookupLocationName(ipLoc.lat, ipLoc.lon);
      resolved = rev || {
        lat: String(ipLoc.lat),
        lon: String(ipLoc.lon),
        name: ipLoc.city || "Detected location",
        state: "",
        country: ipLoc.country || ""
      };
    }
  }

  if (!resolved) {
    setGeoPermissionPopupVisible(true);
    return;
  }

  if (locationQueryEl && resolved.name) {
    locationQueryEl.value = resolved.name;
  }
  let nearby = [];
  try {
    nearby = await fetchNearbySettlements(Number(resolved.lat), Number(resolved.lon), 10);
  } catch (error) {
    // Nearby lookup is optional.
  }

  const merged = mergeUniqueLocations([resolved, ...nearby]);
  populateLocationResults(merged);
  setLocationResultsVisible(true);
  applyLocationCandidate(merged[0]);
  setGeoPermissionPopupVisible(false);
  setStatus(`Detected location: ${formatLocationLabel(merged[0])}.`);
}

function setLocationResultsVisible(visible) {
  if (locationResultsWrapEl) {
    locationResultsWrapEl.hidden = true;
    layoutSidebarSections();
  }
}

function resetObserverLocation() {
  if (locationQueryEl) {
    locationQueryEl.value = "";
  }
  observerLatEl.value = "";
  observerLonEl.value = "";
  observerAltEl.value = "";
  locationCandidates = [];
  renderLocationSuggestions([]);
  setLocationResultsVisible(false);
  updateObserverMarker();
  updateComputePassesState();
  updateLocationSummary();
  writeStoredObserverLocation();
  passLayer.clearLayers();
  renderPasses();
  redrawMarkers(true);
  setStatus("Observer location reset.");
}

function normalizeLocationItem(item) {
  return {
    lat: item.lat,
    lon: item.lon,
    name: item.name || item.display_name || "Unknown place",
    state: item.state || "",
    country: item.country || "",
    city: item.city || "",
    town: item.town || "",
    village: item.village || "",
    municipality: item.municipality || "",
    hamlet: item.hamlet || "",
    suburb: item.suburb || "",
    county: item.county || "",
    state_district: item.state_district || ""
  };
}

function mergeUniqueLocations(items) {
  const out = [];
  const seen = new Set();
  items.forEach((item) => {
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }
    const key = `${(item.name || "").toLowerCase()}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    out.push({
      lat: String(lat),
      lon: String(lon),
      name: item.name || "Unknown place",
      state: item.state || "",
      country: item.country || "",
      city: item.city || "",
      town: item.town || "",
      village: item.village || "",
      municipality: item.municipality || "",
      hamlet: item.hamlet || "",
      suburb: item.suburb || "",
      county: item.county || "",
      state_district: item.state_district || ""
    });
  });
  return out;
}

async function fetchLocationSuggestions(queryText) {
  const q = String(queryText || "").trim();
  if (!q) {
    return [];
  }

  const runSearch = async (extra = {}) => {
    const params = new URLSearchParams({
      format: "jsonv2",
      limit: "20",
      addressdetails: "1",
      q
    });
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim()) {
        params.set(key, String(value));
      }
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    if (!response.ok) {
      return [];
    }
    return response.json();
  };

  let primaryRows = [];
  try {
    primaryRows = await runSearch();
  } catch (error) {
    primaryRows = [];
  }

  let ltRows = [];
  try {
    // Lithuanian fallback helps with names typed without diacritics.
    ltRows = await runSearch({ countrycodes: "lt" });
  } catch (error) {
    ltRows = [];
  }

  const merged = mergeUniqueLocations(
    [...primaryRows, ...ltRows].map((row) => normalizeLocationItem({
      lat: row.lat,
      lon: row.lon,
      name: row.name || row.display_name,
      state: row.address?.state || row.address?.county || "",
      country: row.address?.country || "",
      city: row.address?.city || "",
      town: row.address?.town || "",
      village: row.address?.village || "",
      municipality: row.address?.municipality || "",
      hamlet: row.address?.hamlet || "",
      suburb: row.address?.suburb || "",
      county: row.address?.county || "",
      state_district: row.address?.state_district || ""
    }))
  );

  const queryNorm = normalizeFuzzyToken(q);
  return merged
    .map((item) => {
      const labelNorm = normalizeFuzzyToken(formatLocationLabel(item));
      const metaNorm = normalizeFuzzyToken(formatLocationMeta(item));
      let score = 99;
      if (labelNorm === queryNorm) {
        score = 0;
      } else if (labelNorm.startsWith(queryNorm)) {
        score = 1;
      } else if (labelNorm.includes(queryNorm)) {
        score = 2;
      } else if (metaNorm.startsWith(queryNorm)) {
        score = 3;
      } else if (metaNorm.includes(queryNorm)) {
        score = 4;
      }
      return { item, score };
    })
    .sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }
      return formatLocationLabel(a.item).localeCompare(formatLocationLabel(b.item));
    })
    .map((row) => row.item)
    .slice(0, 12);
}

function renderLocationSuggestions(items) {
  locationSuggestCandidates = items;
  locationSuggestActiveIndex = -1;
  if (!locationSuggestBoxEl) {
    return;
  }
  locationSuggestBoxEl.innerHTML = "";
  if (!items.length) {
    locationPreviewActive = false;
    locationSuggestBoxEl.classList.remove("show");
    return;
  }

  items.forEach((item, idx) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "inline-suggest-item";
    row.dataset.index = String(idx);
    const primary = document.createElement("span");
    primary.className = "location-suggest-primary";
    primary.textContent = formatLocationLabel(item);
    row.appendChild(primary);
    const metaText = formatLocationMeta(item);
    if (metaText) {
      const meta = document.createElement("span");
      meta.className = "inline-suggest-meta";
      meta.textContent = metaText;
      row.appendChild(meta);
    }
    row.addEventListener("mouseenter", () => {
      setLocationSuggestActiveIndex(idx, { preview: false });
    });
    row.addEventListener("click", () => {
      locationPreviewActive = false;
      applyLocationCandidate(item);
      renderLocationSuggestions([]);
    });
    locationSuggestBoxEl.appendChild(row);
  });
  locationSuggestBoxEl.classList.add("show");
  setLocationSuggestActiveIndex(0, { preview: false });
}

function setLocationSuggestActiveIndex(index, options = {}) {
  const { preview = false } = options;
  if (!locationSuggestBoxEl || !locationSuggestCandidates.length) {
    locationSuggestActiveIndex = -1;
    return;
  }
  const count = locationSuggestCandidates.length;
  const normalized = ((Number(index) % count) + count) % count;
  locationSuggestActiveIndex = normalized;

  const rows = locationSuggestBoxEl.querySelectorAll(".inline-suggest-item");
  rows.forEach((row, idx) => {
    const active = idx === normalized;
    row.classList.toggle("active", active);
    if (active) {
      row.scrollIntoView({ block: "nearest" });
    }
  });

  const activeCandidate = locationSuggestCandidates[normalized];
  if (activeCandidate && preview) {
    locationPreviewActive = true;
    applyLocationCandidate(activeCandidate, { skipAltitudeFetch: true, skipPassRender: true });
  }
}

function moveLocationSuggestActive(delta) {
  if (!locationSuggestCandidates.length) {
    return;
  }
  if (locationSuggestActiveIndex < 0) {
    setLocationSuggestActiveIndex(delta >= 0 ? 0 : locationSuggestCandidates.length - 1, { preview: true });
    return;
  }
  setLocationSuggestActiveIndex(locationSuggestActiveIndex + delta, { preview: true });
}

function getActiveLocationSuggestion() {
  if (!locationSuggestCandidates.length) {
    return null;
  }
  if (locationSuggestActiveIndex >= 0 && locationSuggestActiveIndex < locationSuggestCandidates.length) {
    return locationSuggestCandidates[locationSuggestActiveIndex];
  }
  return locationSuggestCandidates[0] || null;
}

function findSuggestedLocationByLabel(label) {
  const key = String(label || "").trim().toLowerCase();
  if (!key) {
    return null;
  }
  const exact = locationSuggestCandidates.find((item) => formatLocationLabel(item).toLowerCase() === key);
  if (exact) {
    return exact;
  }

  const keyNorm = normalizeFuzzyToken(key);
  if (!keyNorm) {
    return null;
  }

  const scored = locationSuggestCandidates
    .map((item) => {
      const labelText = formatLocationLabel(item);
      const labelNorm = normalizeFuzzyToken(labelText);
      let score = 99;
      if (labelNorm === keyNorm) {
        score = 0;
      } else if (labelNorm.startsWith(keyNorm)) {
        score = 1;
      } else if (labelNorm.includes(keyNorm)) {
        score = 2;
      }
      return { item, score, labelText };
    })
    .filter((row) => row.score < 99)
    .sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }
      return a.labelText.localeCompare(b.labelText);
    });

  return scored.length ? scored[0].item : null;
}

async function fetchNearbySettlements(lat, lon, radiusKm = 10) {
  const radiusM = Math.round(radiusKm * 1000);
  const query = `
[out:json][timeout:12];
(
  node["place"~"city|town|village|hamlet"](around:${radiusM},${lat},${lon});
  way["place"~"city|town|village|hamlet"](around:${radiusM},${lat},${lon});
  relation["place"~"city|town|village|hamlet"](around:${radiusM},${lat},${lon});
);
out center 20;
`;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: query
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  return elements
    .map((el) => {
      const latValue = Number(el.lat ?? el.center?.lat);
      const lonValue = Number(el.lon ?? el.center?.lon);
      if (!Number.isFinite(latValue) || !Number.isFinite(lonValue)) {
        return null;
      }
      return {
        lat: String(latValue),
        lon: String(lonValue),
        name: el.tags?.name || "Unnamed settlement",
        state: el.tags?.["addr:state"] || el.tags?.is_in || "",
        country: el.tags?.["addr:country"] || "",
        city: el.tags?.["addr:city"] || "",
        town: el.tags?.["addr:town"] || "",
        village: el.tags?.["addr:village"] || "",
        municipality: el.tags?.["addr:municipality"] || "",
        hamlet: el.tags?.["addr:hamlet"] || "",
        suburb: el.tags?.["addr:suburb"] || "",
        county: el.tags?.["addr:county"] || "",
        state_district: el.tags?.["addr:state_district"] || ""
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function populateLocationResults(items) {
  locationCandidates = items;
  if (!locationResultsEl) {
    return;
  }
  locationResultsEl.innerHTML = "";

  if (!items.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No matches found";
    locationResultsEl.appendChild(opt);
    return;
  }

  items.forEach((item, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = formatLocationLabel(item);
    locationResultsEl.appendChild(opt);
  });
}

function applyLocationCandidate(item, options = {}) {
  const { skipAltitudeFetch = false, skipPassRender = false } = options;
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return;
  }

  observerLatEl.value = lat.toFixed(4);
  observerLonEl.value = lon.toFixed(4);
  if (locationQueryEl) {
    locationQueryEl.value = formatLocationLabel(item);
  }
  updateObserverMarker();
  updateComputePassesState();
  map.setView([lat, lon], locationSelectionZoom(lat, lon));
  if (!skipAltitudeFetch) {
    updateObserverAltitudeFromCoords({ lat, lon }, false);
  }
  updateLocationSummary();
  if (!skipPassRender) {
    renderPasses();
  }
  writeStoredObserverLocation();
}

async function searchObserverLocation() {
  const query = locationQueryEl.value.trim();
  const coords = observerCoords();

  if (!query && !coords) {
    setStatus("Enter location name or coordinates to search location.");
    return;
  }

  setStatus("Searching location...", { loading: true });
  setLocationResultsVisible(false);

  try {
    if (!query && coords) {
      const reverseParams = new URLSearchParams({
        format: "jsonv2",
        lat: String(coords.lat),
        lon: String(coords.lon),
        addressdetails: "1",
        zoom: "10"
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${reverseParams.toString()}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const row = await response.json();
      const item = normalizeLocationItem({
        lat: row.lat ?? String(coords.lat),
        lon: row.lon ?? String(coords.lon),
        name:
          row.address?.city ||
          row.address?.town ||
          row.address?.village ||
          row.address?.municipality ||
          row.address?.hamlet ||
          row.name ||
          row.display_name,
        state: row.address?.state || row.address?.county || "",
        country: row.address?.country || "",
        city: row.address?.city || "",
        town: row.address?.town || "",
        village: row.address?.village || "",
        municipality: row.address?.municipality || "",
        hamlet: row.address?.hamlet || "",
        suburb: row.address?.suburb || "",
        county: row.address?.county || "",
        state_district: row.address?.state_district || ""
      });

      let nearby = [];
      try {
        nearby = await fetchNearbySettlements(Number(item.lat), Number(item.lon), 10);
      } catch (error) {
        // Keep primary location result if nearby lookup is unavailable.
      }

      const merged = mergeUniqueLocations([item, ...nearby]);
      populateLocationResults(merged);
      setLocationResultsVisible(true);
      applyLocationCandidate(merged[0]);
      return;
    }

    const params = new URLSearchParams({
      format: "jsonv2",
      limit: "5",
      addressdetails: "1"
    });

    params.set("q", query);

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const rows = await response.json();
    const items = rows.map((row) => normalizeLocationItem({
      lat: row.lat,
      lon: row.lon,
      name: row.name || row.display_name,
      state: row.address?.state || row.address?.county || "",
      country: row.address?.country || "",
      city: row.address?.city || "",
      town: row.address?.town || "",
      village: row.address?.village || "",
      municipality: row.address?.municipality || "",
      hamlet: row.address?.hamlet || "",
      suburb: row.address?.suburb || "",
      county: row.address?.county || "",
      state_district: row.address?.state_district || ""
    }));

    populateLocationResults(items);

    if (!items.length) {
      setStatus("Location search returned no matches.");
      return;
    }

    const primary = items[0];
    let nearby = [];
    try {
      nearby = await fetchNearbySettlements(Number(primary.lat), Number(primary.lon), 10);
    } catch (error) {
      // Nearby lookup is optional; ignore failures.
    }

    const merged = mergeUniqueLocations([primary, ...nearby, ...items.slice(1)]);
    populateLocationResults(merged);
    setLocationResultsVisible(true);
    applyLocationCandidate(merged[0]);
  } catch (error) {
    console.error("Location search failed:", error);
    setLocationResultsVisible(false);
    setStatus("Location search failed. Try again in a moment.");
  }
}

function updateTimeLabel() {
  const simTime = currentSimTime();
  const deltaMs = simulatedTimeMs - Date.now();
  const sign = deltaMs >= 0 ? "+" : "-";
  const absMs = Math.abs(deltaMs);
  const totalSeconds = Math.floor(absMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const offsetText = `${sign}${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  timeLabelEl.textContent = `Simulated time:\n${formatDate(simTime)} (${offsetText})`;
}

function currentSpeedMultiplier() {
  const raw = Number(speedSelectEl?.value);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

function syncPlayButton() {
  if (!playToggleEl) {
    return;
  }
  playToggleEl.textContent = playing ? "Pause" : "Play";
  playToggleEl.classList.toggle("btn-pause", playing);
  playToggleEl.classList.toggle("btn-secondary", false);
}

function observerGd() {
  const coords = observerCoords();
  if (!coords) {
    return null;
  }
  return {
    latitude: satellite.degreesToRadians(coords.lat),
    longitude: satellite.degreesToRadians(coords.lon),
    height: (Number(observerAltEl.value) || 0) / 1000
  };
}

function observerCoords() {
  const latText = observerLatEl.value.trim();
  const lonText = observerLonEl.value.trim();
  if (!latText || !lonText) {
    return null;
  }

  const lat = Number(latText);
  const lon = Number(lonText);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  return { lat, lon };
}

function updateComputePassesState() {
  if (!computePassesEl) {
    return;
  }
  computePassesEl.disabled = !observerCoords();
}

function getLookAngles(sat, date, observer) {
  if (sat.mockOrbit) {
    const pos = satPositionAt(sat, date);
    if (!pos) {
      return null;
    }

    const obsLat = satellite.radiansToDegrees(observer.latitude);
    const obsLon = satellite.radiansToDegrees(observer.longitude);
    const toRad = (deg) => (deg * Math.PI) / 180;
    const lat1 = toRad(obsLat);
    const lat2 = toRad(pos.lat);
    const dLon = toRad(pos.lon - obsLon);
    const cosC = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const c = Math.acos(Math.max(-1, Math.min(1, cosC)));
    const earthR = 6378.137;
    const psi = Math.acos(earthR / (earthR + pos.altKm));
    const elevDeg = c <= psi ? ((psi - c) / psi) * 90 : -5;

    return {
      elevation: satellite.degreesToRadians(elevDeg),
      azimuth: 0,
      rangeSat: 0
    };
  }

  const result = satellite.propagate(sat.satrec, date);
  if (!result || !result.position) {
    return null;
  }
  const gmst = satellite.gstime(date);
  const ecf = satellite.eciToEcf(result.position, gmst);
  return satellite.ecfToLookAngles(observer, ecf);
}

function computeNextPasses(sat, observer, startDate, hoursWindow = 24, minElevationDeg = 0, maxPasses = 1) {
  const passes = [];
  const stepMs = 5 * 1000;
  const end = startDate.getTime() + hoursWindow * 3600000;

  let inPass = false;
  let passStart = null;
  let maxElevation = -90;
  let maxAt = null;
  let lastElevDeg = null;
  let lastDate = null;

  const interpolateThresholdTime = (prevDate, prevElev, nextDate, nextElev, threshold) => {
    if (!prevDate || !nextDate || !Number.isFinite(prevElev) || !Number.isFinite(nextElev)) {
      return nextDate || prevDate || null;
    }
    const delta = nextElev - prevElev;
    if (Math.abs(delta) < 1e-9) {
      return nextDate;
    }
    const ratio = (threshold - prevElev) / delta;
    const clamped = Math.max(0, Math.min(1, ratio));
    return new Date(prevDate.getTime() + (nextDate.getTime() - prevDate.getTime()) * clamped);
  };

  for (let t = startDate.getTime(); t <= end; t += stepMs) {
    const d = new Date(t);
    const look = getLookAngles(sat, d, observer);
    if (!look) {
      continue;
    }
    const elevDeg = satellite.radiansToDegrees(look.elevation);

    if (
      !inPass &&
      elevDeg >= minElevationDeg &&
      (!Number.isFinite(lastElevDeg) || lastElevDeg < minElevationDeg)
    ) {
      inPass = true;
      passStart = interpolateThresholdTime(lastDate, lastElevDeg, d, elevDeg, minElevationDeg) || d;
      maxElevation = elevDeg;
      maxAt = d;
    }

    if (inPass) {
      if (elevDeg > maxElevation) {
        maxElevation = elevDeg;
        maxAt = d;
      }

      if (elevDeg < minElevationDeg) {
        const passEnd = interpolateThresholdTime(lastDate, lastElevDeg, d, elevDeg, minElevationDeg) || d;
        passes.push({
          start: passStart,
          end: passEnd,
          maxElevation,
          maxAt
        });
        inPass = false;
        passStart = null;
      }
    }

    if (passes.length >= maxPasses) {
      break;
    }

    lastElevDeg = elevDeg;
    lastDate = d;
  }

  if (inPass && passStart) {
    passes.push({
      start: passStart,
      end: new Date(end),
      maxElevation,
      maxAt: maxAt || new Date(end)
    });
  }

  return passes;
}

function azimuthDegreesAt(sat, observer, date) {
  const look = getLookAngles(sat, date, observer);
  if (!look || !Number.isFinite(look.azimuth)) {
    return null;
  }
  const deg = (satellite.radiansToDegrees(look.azimuth) + 360) % 360;
  return deg;
}

function cardinalFromAzimuth(deg) {
  if (!Number.isFinite(deg)) {
    return "N/A";
  }
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}

function findLosWindowForPass(sat, observer, pass) {
  if (!pass || !pass.start || !pass.end || !pass.maxAt) {
    return null;
  }

  const seedStart = new Date(pass.start.getTime() - 45 * 60 * 1000);
  const losCandidates = computeNextPasses(sat, observer, seedStart, 6, 0, 6);
  const peakMs = pass.maxAt.getTime();
  const match = losCandidates.find((los) => {
    return los.start.getTime() <= peakMs && peakMs <= los.end.getTime();
  });

  return match || null;
}

function findFootprintWindowForPass(sat, observer, pass) {
  if (!pass || !(pass.start instanceof Date) || !(pass.end instanceof Date) || !(pass.maxAt instanceof Date)) {
    return null;
  }

  const stepMs = 2 * 1000;
  const marginMs = 45 * 60 * 1000;
  const searchStartMs = pass.start.getTime() - marginMs;
  const searchEndMs = pass.end.getTime() + marginMs;
  const peakMs = pass.maxAt.getTime();
  const interpolateCrossingMs = (aMs, aDelta, bMs, bDelta) => {
    if (!Number.isFinite(aDelta) || !Number.isFinite(bDelta)) {
      return bMs;
    }
    const denom = aDelta - bDelta;
    if (Math.abs(denom) < 1e-9) {
      return bMs;
    }
    const ratio = aDelta / denom;
    const clamped = Math.max(0, Math.min(1, ratio));
    return aMs + (bMs - aMs) * clamped;
  };

  const windows = [];
  let currentWindow = null;
  let prevMs = null;
  let prevDelta = Number.NaN;

  for (let t = searchStartMs; t <= searchEndMs; t += stepMs) {
    const delta = observerLosFootprintDeltaKm(sat, observer, new Date(t));
    const inside = Number.isFinite(delta) && delta >= 0;
    const wasInside = Number.isFinite(prevDelta) && prevDelta >= 0;

    if (inside && !wasInside) {
      const startMs = prevMs === null ? t : interpolateCrossingMs(prevMs, prevDelta, t, delta);
      currentWindow = {
        startMs,
        endMs: t,
        peakDelta: delta
      };
    }

    if (inside && currentWindow) {
      currentWindow.endMs = t;
      if (delta > currentWindow.peakDelta) {
        currentWindow.peakDelta = delta;
      }
    }

    if (!inside && wasInside && currentWindow) {
      currentWindow.endMs = interpolateCrossingMs(prevMs, prevDelta, t, delta);
      windows.push(currentWindow);
      currentWindow = null;
    }

    prevMs = t;
    prevDelta = delta;
  }

  if (currentWindow) {
    windows.push(currentWindow);
  }

  if (!windows.length) {
    return null;
  }

  const picked =
    windows.find((w) => w.startMs <= peakMs && peakMs <= w.endMs) ||
    windows
      .map((w) => ({
        window: w,
        overlapMs: Math.max(0, Math.min(w.endMs, pass.end.getTime()) - Math.max(w.startMs, pass.start.getTime()))
      }))
      .sort((a, b) => b.overlapMs - a.overlapMs)[0]?.window ||
    windows
      .slice()
      .sort((a, b) => {
        const da = Math.min(Math.abs(a.startMs - peakMs), Math.abs(a.endMs - peakMs));
        const db = Math.min(Math.abs(b.startMs - peakMs), Math.abs(b.endMs - peakMs));
        return da - db;
      })[0];

  return {
    start: new Date(picked.startMs),
    end: new Date(picked.endMs),
    maxElevation: pass.maxElevation,
    maxAt: pass.maxAt
  };
}

function timesAreNear(a, b, toleranceMs = 1500) {
  if (!(a instanceof Date) || !(b instanceof Date)) {
    return false;
  }
  return Math.abs(a.getTime() - b.getTime()) <= toleranceMs;
}

function drawPassTrack(sat, from, to, trackOpacity = 0.9, maxAt = null, maxElevationDeg = null, trackIndex = null) {
  const pts = [];
  const stepMs = 5 * 1000;
  const rendered = { lines: [], labels: [], points: [], hitLines: [] };
  const createPassPoint = (lat, lon, shift, options = {}) => {
    const { minOpacity = trackOpacity, minFillOpacity = trackOpacity } = options;
    const baseOpacity = Math.max(trackOpacity, minOpacity);
    const baseFillOpacity = Math.max(trackOpacity, minFillOpacity);
    const point = L.circleMarker([lat, lon + shift], {
      radius: 1.25,
      color: sat.color,
      fillColor: sat.color,
      weight: 1,
      opacity: baseOpacity,
      fillOpacity: baseFillOpacity,
      interactive: false,
      keyboard: false
    }).addTo(passLayer);
    point.__baseOpacity = baseOpacity;
    point.__baseFillOpacity = baseFillOpacity;
    point.__baseRadius = 1.25;
    rendered.points.push(point);
    return point;
  };

  for (let t = from.getTime(); t <= to.getTime(); t += stepMs) {
    const pos = satPositionAt(sat, new Date(t));
    if (pos) {
      pts.push([pos.lat, pos.lon]);
    }
  }

  if (pts.length < 2) {
    return rendered;
  }

  const startPoint = pts[0];
  const endPoint = pts[pts.length - 1];
  const startLabel = formatTimeOnly(from);
  const endLabel = formatTimeOnly(to);
  WORLD_COPY_SHIFTS.forEach((shift) => {
    createPassPoint(startPoint[0], startPoint[1], shift, { minOpacity: 0, minFillOpacity: 0 });
    createPassPoint(endPoint[0], endPoint[1], shift, { minOpacity: 0, minFillOpacity: 0 });

    const startMarker = L.marker([startPoint[0], startPoint[1] + shift], {
      icon: L.divIcon({
        className: "pass-time-label pass-time-label-start",
        html: escapeHtml(startLabel),
        iconSize: [1, 1],
        iconAnchor: [0, 0]
      }),
      interactive: false,
      keyboard: false
    }).addTo(passLayer);
    startMarker.__baseOpacity = 0.15;
    startMarker.__labelType = "start";
    startMarker.setOpacity(0.15);
    rendered.labels.push(startMarker);

    const endMarker = L.marker([endPoint[0], endPoint[1] + shift], {
      icon: L.divIcon({
        className: "pass-time-label pass-time-label-end",
        html: escapeHtml(endLabel),
        iconSize: [1, 1],
        iconAnchor: [0, 0]
      }),
      interactive: false,
      keyboard: false
    }).addTo(passLayer);
    endMarker.__baseOpacity = 0.15;
    endMarker.__labelType = "end";
    endMarker.setOpacity(0.15);
    rendered.labels.push(endMarker);
  });

  if (maxAt instanceof Date && Number.isFinite(maxAt.getTime())) {
    const maxAtMs = maxAt.getTime();
    const fromMs = from.getTime();
    const toMs = to.getTime();
    if (maxAtMs >= fromMs && maxAtMs <= toMs) {
      const maxPos = satPositionAt(sat, maxAt);
      if (maxPos) {
        const maxTime = formatTimeOnly(maxAt);
        const maxElText = Number.isFinite(maxElevationDeg) ? `${maxElevationDeg.toFixed(1)}°` : "";
        const maxLabelHtml = `
          <span class="pass-max-time">${escapeHtml(maxTime)}</span>
          <span class="pass-max-elevation">${escapeHtml(maxElText)}</span>
        `;
        WORLD_COPY_SHIFTS.forEach((shift) => {
          createPassPoint(maxPos.lat, maxPos.lon, shift, { minOpacity: 0.75, minFillOpacity: 0.85 });

          const maxMarker = L.marker([maxPos.lat, maxPos.lon + shift], {
            icon: L.divIcon({
              className: "pass-time-label pass-time-label-max",
              html: maxLabelHtml,
              iconSize: [1, 1],
              iconAnchor: [0, 0]
            }),
            interactive: false,
            keyboard: false
          }).addTo(passLayer);
          maxMarker.__baseOpacity = trackOpacity;
          maxMarker.__labelType = "max";
          rendered.labels.push(maxMarker);
        });
      }
    }
  }

  const segments = splitTrackOnDateLine(pts);
  segments.forEach((segment) => {
    const smoothSegment = densifyTrackSegment(segment, 2);
    const lines = addWrappedPolyline(passLayer, smoothSegment, {
      color: sat.color,
      weight: 1,
      opacity: trackOpacity,
      lineCap: "round",
      lineJoin: "round",
      interactive: false
    });
    const hitLines = addWrappedPolyline(passLayer, smoothSegment, {
      color: sat.color,
      weight: 10,
      opacity: 0,
      lineCap: "round",
      lineJoin: "round",
      interactive: true
    });

    lines.forEach((line) => {
      line.__baseOpacity = trackOpacity;
      line.__baseWeight = 1;
      rendered.lines.push(line);
    });

    hitLines.forEach((hitLine) => {
      if (Number.isInteger(trackIndex)) {
        hitLine.on("mouseover", () => {
          if (passHoverResetTimer) {
            clearTimeout(passHoverResetTimer);
            passHoverResetTimer = null;
          }
          highlightPassTrack(trackIndex);
        });
        hitLine.on("mouseout", () => {
          if (passHoverResetTimer) {
            clearTimeout(passHoverResetTimer);
          }
          passHoverResetTimer = setTimeout(() => {
            highlightPassTrack(null);
            passHoverResetTimer = null;
          }, 50);
        });
      }
      rendered.hitLines.push(hitLine);
    });
  });
  return rendered;
}

function highlightPassTrack(activeIndex = null) {
  renderedPassTracks.forEach((track, idx) => {
    track.lines.forEach((line) => {
      const baseOpacity = Number.isFinite(line.__baseOpacity) ? line.__baseOpacity : 0.65;
      const baseWeight = Number.isFinite(line.__baseWeight) ? line.__baseWeight : 2;
      const isFocused = activeIndex === null ? false : idx === activeIndex;
      const opacity = activeIndex === null
        ? baseOpacity
        : isFocused
          ? Math.max(0.9, baseOpacity)
          : Math.max(0.02, baseOpacity * 0.25);
      const weight = activeIndex === null
        ? baseWeight
        : isFocused
          ? baseWeight + 0.6
          : baseWeight;
      line.setStyle({ opacity, weight });
    });

    track.labels.forEach((labelMarker) => {
      const baseOpacity = Number.isFinite(labelMarker.__baseOpacity) ? labelMarker.__baseOpacity : 0.75;
      const isFocused = activeIndex === null ? false : idx === activeIndex;
      const isStartOrEnd = labelMarker.__labelType === "start" || labelMarker.__labelType === "end";
      const opacity = activeIndex === null
        ? (isStartOrEnd ? 0.15 : baseOpacity)
        : isFocused
          ? 1
          : isStartOrEnd
            ? 0.15
            : Math.max(0.02, baseOpacity * 0.25);
      labelMarker.setOpacity(opacity);
    });

    (track.points || []).forEach((pointMarker) => {
      const baseOpacity = Number.isFinite(pointMarker.__baseOpacity) ? pointMarker.__baseOpacity : 0.75;
      const baseFillOpacity = Number.isFinite(pointMarker.__baseFillOpacity)
        ? pointMarker.__baseFillOpacity
        : 0.85;
      const baseRadius = Number.isFinite(pointMarker.__baseRadius) ? pointMarker.__baseRadius : 2.5;
      const isFocused = activeIndex === null ? false : idx === activeIndex;
      const opacity = activeIndex === null
        ? baseOpacity
        : isFocused
          ? Math.max(0.95, baseOpacity)
          : Math.max(0.02, baseOpacity * 0.25);
      const fillOpacity = activeIndex === null
        ? baseFillOpacity
        : isFocused
          ? Math.max(0.95, baseFillOpacity)
          : Math.max(0.02, baseFillOpacity * 0.25);
      const radius = activeIndex === null
        ? baseRadius
        : isFocused
          ? baseRadius + 1
          : baseRadius;
      pointMarker.setStyle({ opacity, fillOpacity, radius });
    });
  });

  renderedPassItems.forEach((item, idx) => {
    if (!item) {
      return;
    }
    if (activeIndex !== null && idx === activeIndex) {
      item.classList.add("pass-item-hover");
    } else {
      item.classList.remove("pass-item-hover");
    }
  });
}

function updateObserverMarker() {
  const coords = observerCoords();
  if (!coords) {
    if (observerMarker) {
      observerLayer.removeLayer(observerMarker);
      observerMarker = null;
    }
    return;
  }
  const { lat, lon } = coords;

  if (!observerMarker) {
    observerMarker = L.circleMarker([lat, lon], {
      radius: 5,
      color: "#3b82f6",
      fillColor: "#3b82f6",
      fillOpacity: 1,
      weight: 1
    })
      .addTo(observerLayer)
      .bindTooltip("Observer location");
  } else {
    observerMarker.setLatLng([lat, lon]);
  }
}

function renderPasses(overrideSatId = null, options = {}) {
  const { preview = false } = options;
  passLayer.clearLayers();
  renderedPassTracks = [];
  renderedPassItems = [];
  if (passHoverResetTimer) {
    clearTimeout(passHoverResetTimer);
    passHoverResetTimer = null;
  }
  updateObserverMarker();

  const resolvedSatId = overrideSatId || resolvePassSatelliteIdFromInput();
  if (!preview) {
    selectedPassSatId = resolvedSatId;
  }
  const sat = satellites.find((s) => s.id === resolvedSatId);
  if (!sat) {
    passesListEl.innerHTML = "<li>Select a satellite first.</li>";
    renderedPassItems = [];
    return;
  }

  const observer = observerGd();
  if (!observer) {
    passesListEl.innerHTML = "";
    renderedPassItems = [];
    return;
  }
  const simNow = currentSimTime();
  const passRangeMode = String(passesDaysSelectEl?.value || "1");
  let passes = [];
  let statusRangeLabel = "next 1 day";

  if (passRangeMode === "upcoming3" || passRangeMode === "upcoming5") {
    const upcomingCount = passRangeMode === "upcoming5" ? 5 : 3;
    passes = computeNextPasses(sat, observer, simNow, 72, 0, upcomingCount).filter((pass) => {
      return pass.end.getTime() >= simNow.getTime();
    });
    statusRangeLabel = `next ${upcomingCount} upcoming passes`;
  } else {
    const daysRange = Math.max(1, Math.min(3, Number(passRangeMode || 1)));
    const dayStart = new Date(simNow);
    dayStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(dayStart.getTime() + daysRange * 24 * 3600000);
    passes = computeNextPasses(sat, observer, dayStart, daysRange * 24, 0, 512).filter((pass) => {
      return pass.start.getTime() >= dayStart.getTime() && pass.start.getTime() < rangeEnd.getTime();
    });
    statusRangeLabel = `next ${daysRange} day(s)`;
  }

  if (!passes.length) {
    passesListEl.innerHTML = "<li>No LOS passes found in selected range.</li>";
    renderedPassItems = [];
    return;
  }

  const passEntries = [];
  passesListEl.innerHTML = "";
  passes.forEach((pass, index) => {
    const losWindow = findFootprintWindowForPass(sat, observer, pass) || findLosWindowForPass(sat, observer, pass);
    passEntries.push({ pass, losWindow });
    const li = document.createElement("li");
    li.className = "pass-item";
    const activeStart = losWindow?.start || pass.start;
    const activeEnd = losWindow?.end || pass.end;
    const isActiveNow = simNow.getTime() >= activeStart.getTime() && simNow.getTime() <= activeEnd.getTime();
    if (isActiveNow) {
      li.classList.add("pass-item-active");
      li.style.setProperty("--pass-accent", sat.color || ACCENT_GREEN);
    }
    const losStart = losWindow ? formatTimeOnly(losWindow.start) : "N/A";
    const losEnd = losWindow ? formatTimeOnly(losWindow.end) : "N/A";
    const losMatchesPass =
      losWindow &&
      timesAreNear(losWindow.start, pass.start) &&
      timesAreNear(losWindow.end, pass.end);
    const aosAz = azimuthDegreesAt(sat, observer, losWindow ? losWindow.start : pass.start);
    const losAz = azimuthDegreesAt(sat, observer, losWindow ? losWindow.end : pass.end);
    const maxAz = azimuthDegreesAt(sat, observer, pass.maxAt);
    const aosDir = cardinalFromAzimuth(aosAz);
    const losDir = cardinalFromAzimuth(losAz);
    const maxDir = cardinalFromAzimuth(maxAz);
    const aosAzText = Number.isFinite(aosAz) ? `${aosAz.toFixed(1)} deg` : "N/A";
    const losAzText = Number.isFinite(losAz) ? `${losAz.toFixed(1)} deg` : "N/A";
    const maxAzText = Number.isFinite(maxAz) ? `${maxAz.toFixed(1)} deg` : "N/A";
    li.innerHTML = `
      <div class="pass-title"><span>Pass ${index + 1}</span><span>${escapeHtml(formatDateOnly(pass.start))}</span></div>
      <div class="pass-row"><span>Pass Start</span><span>${escapeHtml(formatTimeOnly(pass.start))}</span></div>
      <div class="pass-row"><span>Pass End</span><span>${escapeHtml(formatTimeOnly(pass.end))}</span></div>
      <div class="pass-row"><span>Max Elevation</span><span>${escapeHtml(pass.maxElevation.toFixed(1))} deg</span></div>
      <div class="pass-row"><span>Rise Direction</span><span>${escapeHtml(aosDir)} (${escapeHtml(aosAzText)})</span></div>
      <div class="pass-row"><span>Set Direction</span><span>${escapeHtml(losDir)} (${escapeHtml(losAzText)})</span></div>
      <div class="pass-row"><span>Max Elevation Az</span><span>${escapeHtml(maxDir)} (${escapeHtml(maxAzText)})</span></div>
      ${
        losWindow && !losMatchesPass
          ? `<div class="pass-row"><span>LOS Appears</span><span>${escapeHtml(losStart)}</span></div>
      <div class="pass-row"><span>LOS Disappears</span><span>${escapeHtml(losEnd)}</span></div>`
          : ""
      }
    `;
    li.addEventListener("mouseenter", () => {
      if (passHoverResetTimer) {
        clearTimeout(passHoverResetTimer);
        passHoverResetTimer = null;
      }
      highlightPassTrack(index);
    });
    li.addEventListener("mouseleave", () => {
      if (passHoverResetTimer) {
        clearTimeout(passHoverResetTimer);
      }
      passHoverResetTimer = setTimeout(() => {
        highlightPassTrack(null);
        passHoverResetTimer = null;
      }, 50);
    });
    passesListEl.appendChild(li);
    renderedPassItems.push(li);
  });

  if (showPassesOnMap) {
    const totalPasses = passEntries.length;
    passEntries.forEach(({ pass, losWindow }, idx) => {
      const t = totalPasses > 1 ? idx / (totalPasses - 1) : 0;
      const opacity = 1 - (1 - 0.15) * t;
      const trackStart = losWindow?.start || pass.start;
      const trackEnd = losWindow?.end || pass.end;
      renderedPassTracks[idx] = drawPassTrack(
        sat,
        trackStart,
        trackEnd,
        opacity,
        pass.maxAt,
        pass.maxElevation,
        idx
      );
    });
  }

  if (!preview) {
    setStatus(`Showing ${passes.length} passes for ${sat.name} in ${statusRangeLabel}.`);
  }

  // Keep pass visuals above selected fly-path for cleaner overlap.
  if (typeof passLayer.bringToFront === "function") {
    passLayer.bringToFront();
  }
}

function animate() {
  const now = Date.now();
  const dt = now - lastTick;
  lastTick = now;

  if (playing) {
    simulatedTimeMs += dt * currentSpeedMultiplier();
  }

  updateTimeLabel();
  redrawMarkers();
  requestAnimationFrame(animate);
}

playToggleEl.addEventListener("click", () => {
  playing = !playing;
  if (playing) {
    lastTick = Date.now();
  }
  syncPlayButton();
  const speedFactor = currentSpeedMultiplier();
  setStatus(playing ? `Simulation running at ${speedFactor}x.` : "Simulation paused.");
});

speedSelectEl.addEventListener("change", () => {
  speed = currentSpeedMultiplier();
  if (playing) {
    setStatus(`Simulation speed set to ${speed}x.`);
  }
});

if (timelineEl) {
  let jogActive = false;
  let jogLastX = 0;
  let jogCarryPx = 0;
  let jogVisualOffset = 0;

  const applyJogSteps = (steps) => {
    if (!steps) {
      return;
    }
    const speedFactor = currentSpeedMultiplier();
    simulatedTimeMs += steps * TIMELINE_JOG_STEP_MS * speedFactor;
    redrawMarkers();
    updateTimeLabel();
  };

  const pushJogDeltaPx = (deltaPx) => {
    jogCarryPx += deltaPx;
    const steps = Math.trunc(jogCarryPx / TIMELINE_JOG_PX_PER_STEP);
    if (steps !== 0) {
      jogCarryPx -= steps * TIMELINE_JOG_PX_PER_STEP;
      applyJogSteps(steps);
    }

    jogVisualOffset = (jogVisualOffset + deltaPx) % 2000;
    timelineEl.style.setProperty("--jog-offset", `${jogVisualOffset}px`);
  };

  timelineEl.addEventListener("pointerdown", (event) => {
    jogActive = true;
    jogLastX = event.clientX;
    jogCarryPx = 0;
    timelineEl.setPointerCapture(event.pointerId);
    timelineEl.focus();
  });

  timelineEl.addEventListener("pointermove", (event) => {
    if (!jogActive) {
      return;
    }
    const dx = event.clientX - jogLastX;
    jogLastX = event.clientX;
    pushJogDeltaPx(dx);
  });

  const stopJog = () => {
    jogActive = false;
    jogCarryPx = 0;
  };

  timelineEl.addEventListener("pointerup", stopJog);
  timelineEl.addEventListener("pointercancel", stopJog);
  timelineEl.addEventListener("lostpointercapture", stopJog);

  timelineEl.addEventListener("wheel", (event) => {
    event.preventDefault();
    pushJogDeltaPx(-event.deltaY * 0.15);
  }, { passive: false });

  timelineEl.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      applyJogSteps(1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      applyJogSteps(-1);
    }
  });
}

if (resetTimeEl) {
  resetTimeEl.addEventListener("click", () => {
    simulatedTimeMs = Date.now();
    playing = true;
    syncPlayButton();
    timelineEl?.style.setProperty("--jog-offset", "0px");
    redrawMarkers(true);
    renderPasses();
    updateTimeLabel();
    setStatus("Live time resumed.");
  });
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveTab(btn.dataset.tab);
  });
});

if (computePassesEl) {
  computePassesEl.addEventListener("click", renderPasses);
}
searchLocationEl.addEventListener("click", searchObserverLocation);
if (resetLocationEl) {
  resetLocationEl.addEventListener("click", resetObserverLocation);
}
if (saveProviderSettingsEl) {
  saveProviderSettingsEl.addEventListener("click", async () => {
    const identity = spaceTrackIdentityEl ? spaceTrackIdentityEl.value.trim() : "";
    const password = spaceTrackPasswordEl ? spaceTrackPasswordEl.value : "";
    writeProviderCredentials(identity, password);
    updateProviderStatus();
    setStatus("Provider settings saved. Reloading satellite feeds...");
    await loadSatellites();
    redrawMarkers(true);
  });
}

if (locationResultsEl) {
  locationResultsEl.addEventListener("change", () => {
    const idx = Number(locationResultsEl.value);
    if (!Number.isFinite(idx) || !locationCandidates[idx]) {
      return;
    }
    applyLocationCandidate(locationCandidates[idx]);
  });
}

if (locationQueryEl) {
  locationQueryEl.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveLocationSuggestActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveLocationSuggestActive(-1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      renderLocationSuggestions([]);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const suggested =
        getActiveLocationSuggestion() ||
        findSuggestedLocationByLabel(locationQueryEl.value) ||
        locationSuggestCandidates[0] ||
        null;
      if (suggested) {
        applyLocationCandidate(suggested);
        renderLocationSuggestions([]);
        return;
      }
      searchObserverLocation();
    }
  });

  locationQueryEl.addEventListener("input", () => {
    if (locationSuggestDebounce) {
      clearTimeout(locationSuggestDebounce);
    }
    const text = locationQueryEl.value;
    if (!text.trim()) {
      renderLocationSuggestions([]);
      return;
    }
    locationSuggestDebounce = setTimeout(async () => {
      const items = await fetchLocationSuggestions(text);
      renderLocationSuggestions(items);
    }, 220);
  });

  locationQueryEl.addEventListener("change", () => {
    const suggested = findSuggestedLocationByLabel(locationQueryEl.value);
    if (suggested) {
      applyLocationCandidate(suggested);
      renderLocationSuggestions([]);
    }
  });

  locationQueryEl.addEventListener("focus", async () => {
    const text = locationQueryEl.value.trim();
    if (!text) {
      renderLocationSuggestions([]);
      return;
    }
    if (locationSuggestCandidates.length) {
      renderLocationSuggestions(locationSuggestCandidates);
      return;
    }
    const items = await fetchLocationSuggestions(text);
    renderLocationSuggestions(items);
  });

  locationQueryEl.addEventListener("blur", () => {
    setTimeout(() => renderLocationSuggestions([]), 120);
  });

  const onLocationSuggestWheel = (event) => {
    if (!locationSuggestCandidates.length) {
      return;
    }
    event.preventDefault();
    moveLocationSuggestActive(event.deltaY >= 0 ? 1 : -1);
  };
  locationQueryEl.addEventListener("wheel", onLocationSuggestWheel, { passive: false });
  if (locationSuggestBoxEl) {
    locationSuggestBoxEl.addEventListener("wheel", onLocationSuggestWheel, { passive: false });
  }
}

[observerLatEl, observerLonEl].forEach((el) => {
  el.addEventListener("change", () => {
    const coords = observerCoords();
    updateObserverMarker();
    updateComputePassesState();
    updateLocationSummary();
    redrawMarkers(true);
    updateObserverAltitudeFromCoords(coords, true);
    renderPasses();
    writeStoredObserverLocation();
  });
});

observerAltEl.addEventListener("change", () => {
  updateObserverMarker();
  updateComputePassesState();
  updateLocationSummary();
  redrawMarkers(true);
  renderPasses();
  writeStoredObserverLocation();
});

if (allLosToggleEl) {
  allLosToggleEl.addEventListener("change", () => {
    allLosEnabled = Boolean(allLosToggleEl.checked);
    writeAllLosEnabled(allLosEnabled);
    renderAllLosCircles(true);
  });
}

if (losOnlyToggleEl) {
  losOnlyToggleEl.addEventListener("change", () => {
    losOnlyEnabled = Boolean(losOnlyToggleEl.checked);
    writeLosOnlyEnabled(losOnlyEnabled);
    refreshSatelliteSelect();
    redrawMarkers(true);
    renderPasses();
  });
}

const onShowPassesToggleChange = (enabled) => {
  showPassesOnMap = Boolean(enabled);
  writeShowPassesOnMap(showPassesOnMap);
  syncShowPassesToggles();
  renderPasses();
};

if (showPassesToggleEl) {
  showPassesToggleEl.addEventListener("change", () => {
    onShowPassesToggleChange(showPassesToggleEl.checked);
  });
}

if (showPassesTogglePassesEl) {
  showPassesTogglePassesEl.addEventListener("change", () => {
    onShowPassesToggleChange(showPassesTogglePassesEl.checked);
  });
}

if (maxAltitudeToggleEl) {
  maxAltitudeToggleEl.addEventListener("change", () => {
    maxAltitudeEnabled = Boolean(maxAltitudeToggleEl.checked);
    writeMaxAltitudeEnabled(maxAltitudeEnabled);
    syncMaxAltitudeControl();
    refreshSatelliteSelect();
    redrawMarkers(true);
    renderPasses();
  });
}

if (maxAltitudeInputEl) {
  maxAltitudeInputEl.addEventListener("change", () => {
    applyMaxAltitudeInput();
    refreshSatelliteSelect();
    redrawMarkers(true);
    renderPasses();
  });

  maxAltitudeInputEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    applyMaxAltitudeInput();
    refreshSatelliteSelect();
    redrawMarkers(true);
    renderPasses();
  });
}

if (passesDaysSelectEl) {
  passesDaysSelectEl.addEventListener("change", () => {
    renderPasses();
  });
}

if (locationFilterDetailsEl) {
  locationFilterDetailsEl.addEventListener("toggle", () => {
    updateLocationSummary();
    layoutSidebarSections();
  });
}

window.addEventListener("resize", layoutSidebarSections);
window.addEventListener("resize", () => {
  if (window.innerWidth > 920) {
    setSidebarCollapsed(false);
  }
});

if (sidebarToggleEl) {
  sidebarToggleEl.addEventListener("click", () => {
    const collapsed = !document.body.classList.contains("sidebar-collapsed");
    if (!collapsed && window.matchMedia("(max-width: 680px)").matches && document.body.classList.contains("sat-info-open")) {
      setSatInfoVisible(false);
    }
    setSidebarCollapsed(collapsed);
  });
}

if (satComboInputEl) {
  satComboInputEl.addEventListener("input", () => {
    delete satComboInputEl.dataset.selectedSatId;
    renderSatComboSuggestions(findPassSatelliteMatches(satComboInputEl.value));
    selectedPassSatId = resolvePassSatelliteIdFromInput();
    renderPasses();
  });

  satComboInputEl.addEventListener("change", () => {
    selectedPassSatId = resolvePassSatelliteIdFromInput();
    const sat = satellites.find((item) => item.id === selectedPassSatId);
    if (sat) {
      satComboInputEl.value = satDisplayLabel(sat);
      satComboInputEl.dataset.selectedSatId = sat.id;
    } else {
      delete satComboInputEl.dataset.selectedSatId;
    }
    clearSatComboSuggestions();
    renderPasses();
  });

  satComboInputEl.addEventListener("focus", () => {
    renderSatComboSuggestions(findPassSatelliteMatches(satComboInputEl.value));
  });

  satComboInputEl.addEventListener("blur", () => {
    setTimeout(() => clearSatComboSuggestions(), 120);
  });

  satComboInputEl.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSatComboSuggestActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSatComboSuggestActive(-1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      clearSatComboSuggestions();
      return;
    }
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const selected = getActiveSatComboSuggestion();
    if (selected) {
      setPassSatelliteInputById(selected.id);
      clearSatComboSuggestions();
    }
    renderPasses();
  });

  const onSatComboWheel = (event) => {
    if (!satComboSuggestCandidates.length) {
      return;
    }
    event.preventDefault();
    moveSatComboSuggestActive(event.deltaY >= 0 ? 1 : -1);
  };
  satComboInputEl.addEventListener("wheel", onSatComboWheel, { passive: false });
  if (satComboSuggestBoxEl) {
    satComboSuggestBoxEl.addEventListener("wheel", onSatComboWheel, { passive: false });
  }
}

if (satInfoEl) {
  satInfoEl.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const watchBtn = target.closest("#sat-watch-toggle");
    if (watchBtn) {
      const satId = watchBtn.getAttribute("data-sat-id") || selectedSatId || "";
      const tracked = toggleTrackedSatellite(satId);
      buildFilterControls();
      redrawMarkers(true);
      const sat = satellites.find((item) => item.id === satId);
      if (sat) {
        renderSatInfo(sat, satInfoCache.get(sat.id) || {});
        setStatus(tracked ? `${sat.name} added to Tracked.` : `${sat.name} removed from Tracked.`);
      }
      return;
    }
    const shareCopyBtn = target.closest("#sat-share-copy");
    if (shareCopyBtn) {
      const satId = shareCopyBtn.getAttribute("data-sat-id") || selectedSatId || "";
      const shareUrl = buildShareViewUrl(satId);
      const copied = await copyTextToClipboard(shareUrl);
      setStatus(copied ? "Share link copied." : "Could not copy share link automatically.");
      return;
    }
    if (!target.closest("#sat-info-close")) {
      return;
    }
    clearActiveSatelliteSelection(false);
    setStatus("Satellite selection cleared.");
  });
}

if (geoPermissionBtnEl) {
  geoPermissionBtnEl.addEventListener("click", async () => {
    setStatus("Requesting browser location permission...", { loading: true });
    try {
      const geo = await getBrowserGeolocation();
      const resolved = (await reverseLookupLocationName(geo.lat, geo.lon)) || {
        lat: String(geo.lat),
        lon: String(geo.lon),
        name: "Detected location",
        state: "",
        country: ""
      };
      if (locationQueryEl && resolved.name) {
        locationQueryEl.value = resolved.name;
      }
      let nearby = [];
      try {
        nearby = await fetchNearbySettlements(Number(resolved.lat), Number(resolved.lon), 10);
      } catch (error) {
        // Nearby lookup is optional.
      }

      const merged = mergeUniqueLocations([resolved, ...nearby]);
      populateLocationResults(merged);
      setLocationResultsVisible(true);
      applyLocationCandidate(merged[0]);
      setGeoPermissionPopupVisible(false);
      setStatus(`Detected location: ${formatLocationLabel(merged[0])}.`);
    } catch (error) {
      setGeoPermissionPopupVisible(true);
      setStatus("Location permission not granted. You can still set location manually.");
    }
  });
}

if (satSearchInputEl) {
  satSearchInputEl.addEventListener("input", () => {
    const query = satSearchInputEl.value.trim();
    if (!query) {
      clearSatelliteSearchSuggestions();
      clearSatelliteSearchFilter();
      return;
    }

    selectedSearchSatId = null;
    const matches = findSatelliteSearchMatches(query);
    renderSatelliteSearchSuggestions(matches);
  });

  satSearchInputEl.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSatSearchActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSatSearchActive(-1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      clearSatelliteSearchSuggestions();
      return;
    }
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const activeSuggestion = getActiveSatSearchSuggestion();
    if (activeSuggestion) {
      applySatelliteSearchSelection(activeSuggestion);
      return;
    }
    const matches = findSatelliteSearchMatches(satSearchInputEl.value);
    if (matches.length) {
      applySatelliteSearchSelection(matches[0]);
    }
  });

  satSearchInputEl.addEventListener("focus", () => {
    const query = satSearchInputEl.value.trim();
    if (!query) {
      return;
    }
    renderSatelliteSearchSuggestions(findSatelliteSearchMatches(query));
  });

  const onSatSearchWheel = (event) => {
    if (!satSearchCandidates.length) {
      return;
    }
    event.preventDefault();
    moveSatSearchActive(event.deltaY >= 0 ? 1 : -1);
  };
  satSearchInputEl.addEventListener("wheel", onSatSearchWheel, { passive: false });
  if (satSearchSuggestionsEl) {
    satSearchSuggestionsEl.addEventListener("wheel", onSatSearchWheel, { passive: false });
  }
}

if (timeFormatSelectEl) {
  timeFormatSelectEl.addEventListener("change", () => {
    timeFormat = timeFormatSelectEl.value === "12h" ? "12h" : "24h";
    writeTimeFormat(timeFormat);
    updateTimeLabel();
    renderPasses();
    setStatus(`Time format set to ${timeFormat === "12h" ? "12-hour" : "24-hour"}.`);
  });
}

document.addEventListener("click", (event) => {
  const target = event.target;

  if (satSearchInputEl && satSearchSuggestionsEl) {
    const insideSatSearch =
      target instanceof Node &&
      (satSearchInputEl.contains(target) || satSearchSuggestionsEl.contains(target));
    if (!insideSatSearch) {
      clearSatelliteSearchSuggestions();
    }
  }

  if (satComboInputEl && satComboSuggestBoxEl) {
    const insideSatCombo =
      target instanceof Node &&
      (satComboInputEl.contains(target) || satComboSuggestBoxEl.contains(target));
    if (!insideSatCombo) {
      clearSatComboSuggestions();
    }
  }

  if (locationQueryEl && locationSuggestBoxEl) {
    const insideLocationSuggest =
      target instanceof Node &&
      (locationQueryEl.contains(target) || locationSuggestBoxEl.contains(target));
    if (!insideLocationSuggest) {
      renderLocationSuggestions([]);
    }
  }
});

async function bootstrap() {
  const sharedViewState = readShareViewStateFromUrl();
  setSidebarCollapsed(false);
  setActiveTab("filters");
  applyVerticalFitConstraints(true);
  simulatedTimeMs = Date.now();
  timeFormat = readTimeFormat();
  syncTimeFormatControl();
  selectedCategories = readSelectedCategories();
  writeSelectedCategories();
  trackedSatIds = readTrackedSatIds();
  const initialized = readPrefsInitialized();
  if (!initialized) {
    allLosEnabled = false;
    losOnlyEnabled = false;
    maxAltitudeEnabled = false;
    writeAllLosEnabled(false);
    writeLosOnlyEnabled(false);
    writeShowPassesOnMap(true);
    writeMaxAltitudeEnabled(false);
    writePrefsInitialized();
  } else {
    allLosEnabled = readAllLosEnabled();
    losOnlyEnabled = readLosOnlyEnabled();
    showPassesOnMap = readShowPassesOnMap();
    maxAltitudeEnabled = readMaxAltitudeEnabled();
  }
  maxSatelliteAltitudeKm = readMaxSatelliteAltitudeKm();
  syncMaxAltitudeControl();
  if (allLosToggleEl) {
    allLosToggleEl.checked = allLosEnabled;
  }
  if (losOnlyToggleEl) {
    losOnlyToggleEl.checked = losOnlyEnabled;
  }
  if (sharedViewState) {
    applySharedViewStateEarly(sharedViewState);
  }
  syncShowPassesToggles();
  const storedObserver = readStoredObserverLocation();
  if (storedObserver && !sharedViewState?.observer) {
    observerLatEl.value = storedObserver.lat.toFixed(4);
    observerLonEl.value = storedObserver.lon.toFixed(4);
    observerAltEl.value = storedObserver.alt === null ? "" : String(storedObserver.alt);
    if (locationQueryEl && storedObserver.name) {
      locationQueryEl.value = storedObserver.name;
    }
    updateObserverMarker();
  }
  setSatInfoVisible(false);
  setGeoPermissionPopupVisible(false);
  const creds = readProviderCredentials();
  if (spaceTrackIdentityEl) {
    spaceTrackIdentityEl.value = creds.identity;
  }
  if (spaceTrackPasswordEl) {
    spaceTrackPasswordEl.value = creds.password;
  }
  updateProviderStatus();
  setLocationResultsVisible(false);
  updateComputePassesState();
  updateLocationSummary();
  layoutSidebarSections();
  const cachedSatellites = readSatelliteSnapshot();
  const cachedTleSatellites = cachedSatellites.length ? [] : buildSatellitesFromTleCache();
  const warmStartSatellites = cachedSatellites.length ? cachedSatellites : cachedTleSatellites;
  if (warmStartSatellites.length) {
    satellites = warmStartSatellites;
    buildFilterControls();
    refreshSatelliteSelect();
    redrawMarkers(true);
  }
  await loadSatellites({ showLoading: !warmStartSatellites.length });
  redrawMarkers(true);
  if (sharedViewState) {
    await applySharedViewStateLate(sharedViewState);
  }
  updateTimeLabel();
  syncPlayButton();
  passesListEl.innerHTML = "";
  setStatus("Choose your observer location to calculate passes.");
  requestAnimationFrame(animate);
}

bootstrap();
