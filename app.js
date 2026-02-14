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
const USE_MOCK_DATA = false;

const INITIAL_MAP_CENTER = [15, 0];
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

window.addEventListener("resize", () => {
  map.invalidateSize();
  applyVerticalFitConstraints();
});

const markerLayer = L.layerGroup().addTo(map);
const passLayer = L.layerGroup().addTo(map);
const orbitLayer = L.layerGroup().addTo(map);
const selectedSatLayer = L.layerGroup().addTo(map);
const selectedLosLayer = L.layerGroup().addTo(map);
const observerLayer = L.layerGroup().addTo(map);

const statusEl = document.getElementById("status");
const filtersEl = document.getElementById("filters");
const satCountEl = document.getElementById("sat-count");
const satSearchInputEl = document.getElementById("sat-search-input");
const satSearchSuggestionsEl = document.getElementById("sat-search-suggestions");
const timelineEl = document.getElementById("timeline");
const timeLabelEl = document.getElementById("time-label");
const playToggleEl = document.getElementById("play-toggle");
const speedSelectEl = document.getElementById("speed-select");
const satComboInputEl = document.getElementById("sat-combo-input");
const satComboSuggestBoxEl = document.getElementById("sat-combo-suggest-box");
const passesListEl = document.getElementById("passes-list");
const satInfoEl = document.getElementById("sat-info");
const coffeeBannerEl = document.getElementById("coffee-banner");
const coffeeBannerBtnEl = document.getElementById("coffee-banner-btn");
const geoPermissionPopupEl = document.getElementById("geo-permission-popup");
const geoPermissionBtnEl = document.getElementById("geo-permission-btn");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");
const filtersPanelEl = document.querySelector('.tab-panel[data-panel="filters"]');
const locationQueryEl = document.getElementById("location-query");
const locationSuggestBoxEl = document.getElementById("location-suggest-box");
const searchLocationEl = document.getElementById("search-location");
const locationResultsWrapEl = document.getElementById("location-results-wrap");
const locationResultsEl = document.getElementById("location-results");
const spaceTrackIdentityEl = document.getElementById("spacetrack-identity");
const spaceTrackPasswordEl = document.getElementById("spacetrack-password");
const saveProviderSettingsEl = document.getElementById("save-provider-settings");
const providerStatusEl = document.getElementById("provider-status");

const observerLatEl = document.getElementById("observer-lat");
const observerLonEl = document.getElementById("observer-lon");
const observerAltEl = document.getElementById("observer-alt");
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
  CATEGORY_CONFIG.filter((c) => c.key !== "starlink").map((c) => c.key)
);
let observerMarker = null;
let simulatedTimeMs = Date.now();
let speed = Number(speedSelectEl.value);
let playing = true;
let lastTick = Date.now();
let locationCandidates = [];
let satComboSuggestCandidates = [];
let locationSuggestCandidates = [];
let locationSuggestActiveIndex = -1;
let locationSuggestDebounce = null;
let selectedOrbitSatId = null;
let lastOrbitRenderMs = 0;
let selectedSatId = null;
let selectedSatOutline = null;
let selectedLosCircles = null;
let satInfoRequestToken = 0;
const satInfoCache = new Map();
let activeProviderNotes = [];
let selectedSearchSatId = null;
let selectedPassSatId = "";
let elevationRequestToken = 0;
const elevationCache = new Map();
const statusToastsByKey = new Map();
const statusQueue = [];
let activeStatusToast = null;
let amsatCsvRadioIndex = null;
let amsatCsvRadioLoadPromise = null;

const PROVIDER_KEYS = {
  spaceTrackIdentity: "satapp_space_track_identity",
  spaceTrackPassword: "satapp_space_track_password"
};
const WORLD_COPY_SHIFTS = [-360, 0, 360];

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

function showCoffeeBannerFor10s() {
  if (!coffeeBannerEl) {
    return;
  }
  coffeeBannerEl.classList.remove("hidden");
  coffeeBannerEl.classList.remove("fade-out");

  setTimeout(() => {
    coffeeBannerEl.classList.add("fade-out");
    setTimeout(() => {
      coffeeBannerEl.classList.add("hidden");
      coffeeBannerEl.classList.remove("fade-out");
    }, 1200);
  }, 10000);
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

function scoreSearchMatch(sat, queryUpper) {
  const nameUpper = sat.name.toUpperCase();
  const norad = String(sat.noradId || "");
  if (norad === queryUpper) {
    return 0;
  }
  if (norad.startsWith(queryUpper)) {
    return 1;
  }
  if (nameUpper === queryUpper) {
    return 2;
  }
  if (nameUpper.startsWith(queryUpper)) {
    return 3;
  }
  if (norad.includes(queryUpper)) {
    return 4;
  }
  if (nameUpper.includes(queryUpper)) {
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
  if (!satSearchSuggestionsEl) {
    return;
  }
  satSearchSuggestionsEl.innerHTML = "";
  satSearchSuggestionsEl.classList.remove("show");
}

function renderSatelliteSearchSuggestions(items) {
  if (!satSearchSuggestionsEl) {
    return;
  }

  satSearchSuggestionsEl.innerHTML = "";
  if (!items.length) {
    satSearchSuggestionsEl.classList.remove("show");
    return;
  }

  items.forEach((sat, idx) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "sat-suggest-item";
    if (idx === 0) {
      row.classList.add("active");
    }
    row.innerHTML = `<span>${escapeHtml(sat.name)}</span><span class="sat-suggest-norad">#${escapeHtml(sat.noradId || "N/A")}</span>`;
    row.addEventListener("click", () => applySatelliteSearchSelection(sat));
    satSearchSuggestionsEl.appendChild(row);
  });

  satSearchSuggestionsEl.classList.add("show");
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

function resolvePassSatelliteIdFromInput() {
  const query = String(satComboInputEl?.value || "").trim();
  if (!query) {
    return "";
  }

  const active = visibleSatellites();
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
}

function clearSatComboSuggestions() {
  satComboSuggestCandidates = [];
  if (!satComboSuggestBoxEl) {
    return;
  }
  satComboSuggestBoxEl.innerHTML = "";
  satComboSuggestBoxEl.classList.remove("show");
}

function findPassSatelliteMatches(query, limit = 16) {
  const active = visibleSatellites().slice().sort((a, b) => a.name.localeCompare(b.name));
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
    if (idx === 0) {
      row.classList.add("active");
    }
    row.innerHTML = `<span>${escapeHtml(sat.name)}</span><span class="inline-suggest-meta">#${escapeHtml(sat.noradId || "N/A")}</span>`;
    row.addEventListener("click", () => {
      setPassSatelliteInputById(sat.id);
      clearSatComboSuggestions();
      renderPasses();
    });
    satComboSuggestBoxEl.appendChild(row);
  });
  satComboSuggestBoxEl.classList.add("show");
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
  let mergedRadio = radio || null;
  if (mergedRadio && Array.isArray(mergedRadio.transmitters)) {
    const mergedTransmitters = dedupeRadioTransmitters([...mergedRadio.transmitters, ...localRows]);
    mergedRadio = {
      ...mergedRadio,
      source: {
        ...(mergedRadio.source || {}),
        amsatCsv: Boolean((mergedRadio.source && mergedRadio.source.amsatCsv) || localRows.length)
      },
      transmitters: mergedTransmitters
    };
  } else if (localRows.length) {
    mergedRadio = {
      norad: Number(noradId),
      satName: sat?.name || `NORAD ${noradId}`,
      source: { satnogs: false, amsat: false, amsatCsv: true },
      transmitters: localRows,
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

  satInfoEl.innerHTML = `
    <h3>Satellite Info</h3>
    <p class="sat-name">${escapeHtml(sat.name)}</p>
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

async function fetchTextWithRetry(url, attempts = 3) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
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
      const response = await fetch(url);
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

async function loadSatellites() {
  setFiltersLoadingState(true);
  if (USE_MOCK_DATA) {
    clearStatusToast("sat-load");
    satellites = buildMockSatellites();
    buildFilterControls();
    refreshSatelliteSelect();
    setFiltersLoadingState(false);
    setStatus(`Loaded ${satellites.length} mock satellites.`);
    return;
  }

  setStatus("Loading TLE data from CelesTrak...", {
    loading: true,
    persist: true,
    key: "sat-load"
  });
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

  satellites = Array.from(byKey.values());
  if (selectedSearchSatId && !satellites.some((sat) => sat.id === selectedSearchSatId)) {
    selectedSearchSatId = null;
    if (satSearchInputEl) {
      satSearchInputEl.value = "";
    }
    clearSatelliteSearchSuggestions();
  }
  if (!satellites.length) {
    setFiltersLoadingState(false);
    setStatus("No satellite data loaded. Check network access and reload.");
    return;
  }

  clearStatusToast("sat-load");
  buildFilterControls();
  refreshSatelliteSelect();
  setFiltersLoadingState(false);
  const providerSummary = activeProviderNotes.length ? ` (${activeProviderNotes.join(", ")})` : "";
  setStatus(`Loaded ${satellites.length} satellites${providerSummary}.`);
}

function buildFilterControls() {
  filtersEl.innerHTML = "";
  const countsByCategory = new Map();
  satellites.forEach((sat) => {
    countsByCategory.set(sat.category, (countsByCategory.get(sat.category) || 0) + 1);
  });

  const allRow = document.createElement("div");
  allRow.className = "filter-item";

  const allLabel = document.createElement("span");
  allLabel.className = "filter-label";
  const allText = document.createElement("span");
  allText.className = "filter-name";
  allText.textContent = "All Filters";
  allLabel.appendChild(allText);

  const allToggle = document.createElement("label");
  allToggle.className = "filter-toggle";
  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.className = "filter-toggle-input";
  allInput.id = "toggle-all-filters";
  const allKnob = document.createElement("span");
  allKnob.className = "filter-toggle-slider";

  allInput.addEventListener("change", () => {
    if (allInput.checked) {
      selectedCategories = new Set(CATEGORY_CONFIG.map((cfg) => cfg.key));
    } else {
      selectedCategories = new Set();
    }
    refreshSatelliteSelect();
    redrawMarkers(true);
    buildFilterControls();
  });

  allToggle.appendChild(allInput);
  allToggle.appendChild(allKnob);
  allRow.appendChild(allLabel);
  allRow.appendChild(allToggle);
  filtersEl.appendChild(allRow);

  for (const config of CATEGORY_CONFIG) {
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
    count.textContent = `(${countsByCategory.get(config.key) || 0})`;

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
}

function syncAllFiltersToggleState() {
  const allInput = document.getElementById("toggle-all-filters");
  if (!allInput) {
    return;
  }
  const total = CATEGORY_CONFIG.length;
  const selected = selectedCategories.size;
  allInput.checked = selected === total;
  allInput.indeterminate = selected > 0 && selected < total;
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
  WORLD_COPY_SHIFTS.forEach((shift) => {
    const shifted = points.map((pt) => wrappedLatLng(pt, shift));
    L.polyline(shifted, { ...style, noClip: true }).addTo(layer);
  });
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
  const stepMs = Math.max(20000, Math.floor(periodMs / 120));

  const pastPoints = buildTrackPoints(sat, simMs - halfPeriod, simMs, stepMs);
  const futurePoints = buildTrackPoints(sat, simMs, simMs + halfPeriod, stepMs);

  orbitLayer.clearLayers();
  splitTrackOnDateLine(pastPoints).forEach((segment) => {
    addWrappedPolyline(orbitLayer, segment, {
      color: ACCENT_GREEN,
      weight: 2,
      opacity: 0.25
    });
  });
  splitTrackOnDateLine(futurePoints).forEach((segment) => {
    addWrappedPolyline(orbitLayer, segment, {
      color: ACCENT_GREEN,
      weight: 1,
      opacity: 0.95
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

function visibleSatellites() {
  return satellites.filter((sat) => selectedCategories.has(sat.category));
}

function redrawMarkers(forceRebuild = false) {
  const now = currentSimTime();
  const active = visibleSatellites();

  satCountEl.textContent = selectedSearchSatId
    ? `${active.length} visible (focused satellite highlighted)`
    : `${active.length} visible from selected categories`;

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
    const dimmedBySearchFocus = Boolean(selectedSearchSatId && sat.id !== selectedSearchSatId);
    const satFillOpacity = dimmedBySearchFocus ? 0.225 : 0.9;
    const satHitOpacity = dimmedBySearchFocus ? 0.25 : 0;

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
}

function refreshSatelliteSelect() {
  const active = visibleSatellites();

  if (selectedPassSatId && !active.some((sat) => sat.id === selectedPassSatId)) {
    setPassSatelliteInputById("");
  }

  if (satComboInputEl && document.activeElement === satComboInputEl) {
    renderSatComboSuggestions(findPassSatelliteMatches(satComboInputEl.value));
  }
}

function formatDate(d) {
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
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
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
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
  locationResultsEl.value = "0";
  applyLocationCandidate(merged[0]);
  setGeoPermissionPopupVisible(false);
  setStatus(`Detected location: ${formatLocationLabel(merged[0])}.`);
}

function setLocationResultsVisible(visible) {
  if (!locationResultsWrapEl) {
    return;
  }
  locationResultsWrapEl.hidden = !visible;
  layoutSidebarSections();
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

  const params = new URLSearchParams({
    format: "jsonv2",
    limit: "6",
    addressdetails: "1",
    q
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
  if (!response.ok) {
    return [];
  }
  const rows = await response.json();
  return rows.map((row) => normalizeLocationItem({
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
}

function renderLocationSuggestions(items) {
  locationSuggestCandidates = items;
  locationSuggestActiveIndex = -1;
  if (!locationSuggestBoxEl) {
    return;
  }
  locationSuggestBoxEl.innerHTML = "";
  if (!items.length) {
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
    row.addEventListener("click", () => {
      applyLocationCandidate(item);
      renderLocationSuggestions([]);
    });
    locationSuggestBoxEl.appendChild(row);
  });
  locationSuggestBoxEl.classList.add("show");
  setLocationSuggestActiveIndex(0);
}

function setLocationSuggestActiveIndex(index) {
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
}

function moveLocationSuggestActive(delta) {
  if (!locationSuggestCandidates.length) {
    return;
  }
  if (locationSuggestActiveIndex < 0) {
    setLocationSuggestActiveIndex(delta >= 0 ? 0 : locationSuggestCandidates.length - 1);
    return;
  }
  setLocationSuggestActiveIndex(locationSuggestActiveIndex + delta);
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
  return locationSuggestCandidates.find((item) => formatLocationLabel(item).toLowerCase() === key) || null;
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

function applyLocationCandidate(item) {
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
  map.setView([lat, lon], 10);
  updateObserverAltitudeFromCoords({ lat, lon }, false);
  updateLocationSummary();
  renderPasses();
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
      locationResultsEl.value = "0";
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
    locationResultsEl.value = "0";
    applyLocationCandidate(merged[0]);
  } catch (error) {
    console.error("Location search failed:", error);
    setLocationResultsVisible(false);
    setStatus("Location search failed. Try again in a moment.");
  }
}

function updateTimeLabel() {
  const simTime = currentSimTime();
  const hours = (simulatedTimeMs - Date.now()) / 3600000;
  timeLabelEl.textContent = `Sim time: ${formatDate(simTime)} (${hours.toFixed(1)}h)`;
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

function computeNextPasses(sat, observer, startDate, hoursWindow = 24, minElevationDeg = 10, maxPasses = 1) {
  const passes = [];
  const stepMs = 30 * 1000;
  const end = startDate.getTime() + hoursWindow * 3600000;

  let inPass = false;
  let passStart = null;
  let maxElevation = -90;
  let maxAt = null;

  for (let t = startDate.getTime(); t <= end; t += stepMs) {
    const d = new Date(t);
    const look = getLookAngles(sat, d, observer);
    if (!look) {
      continue;
    }
    const elevDeg = satellite.radiansToDegrees(look.elevation);

    if (!inPass && elevDeg >= minElevationDeg) {
      inPass = true;
      passStart = d;
      maxElevation = elevDeg;
      maxAt = d;
    }

    if (inPass) {
      if (elevDeg > maxElevation) {
        maxElevation = elevDeg;
        maxAt = d;
      }

      if (elevDeg < minElevationDeg) {
        const passEnd = d;
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

function drawPassTrack(sat, from, to) {
  const pts = [];
  const stepMs = 60 * 1000;

  for (let t = from.getTime(); t <= to.getTime(); t += stepMs) {
    const pos = satPositionAt(sat, new Date(t));
    if (pos) {
      pts.push([pos.lat, pos.lon]);
    }
  }

  if (pts.length > 1) {
    addWrappedPolyline(passLayer, pts, { color: sat.color, weight: 2 });
  }
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

function renderPasses() {
  passLayer.clearLayers();
  updateObserverMarker();

  const resolvedSatId = resolvePassSatelliteIdFromInput();
  selectedPassSatId = resolvedSatId;
  const sat = satellites.find((s) => s.id === resolvedSatId);
  if (!sat) {
    passesListEl.innerHTML = "<li>Select a satellite first.</li>";
    return;
  }

  const observer = observerGd();
  if (!observer) {
    passesListEl.innerHTML = "";
    return;
  }
  const simNow = currentSimTime();
  const dayStart = new Date(simNow);
  dayStart.setHours(0, 0, 0, 0);
  const passes = computeNextPasses(sat, observer, dayStart, 24, 10, 128).filter((pass) => {
    return pass.start.toDateString() === simNow.toDateString();
  });

  if (!passes.length) {
    passesListEl.innerHTML = "<li>No passes above 10 degrees in next 24h.</li>";
    return;
  }

  passesListEl.innerHTML = "";
  passes.forEach((pass, index) => {
    const losWindow = findLosWindowForPass(sat, observer, pass);
    const li = document.createElement("li");
    li.className = "pass-item";
    const losStart = losWindow ? formatTimeOnly(losWindow.start) : "N/A";
    const losEnd = losWindow ? formatTimeOnly(losWindow.end) : "N/A";
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
      <div class="pass-row"><span>LOS Appears</span><span>${escapeHtml(losStart)}</span></div>
      <div class="pass-row"><span>LOS Disappears</span><span>${escapeHtml(losEnd)}</span></div>
    `;
    passesListEl.appendChild(li);
  });

  for (const pass of passes) {
    drawPassTrack(
      sat,
      new Date(pass.start.getTime() - 15 * 60 * 1000),
      new Date(pass.end.getTime() + 15 * 60 * 1000)
    );
  }

  setStatus(`Showing ${passes.length} passes for ${sat.name} on ${formatDateOnly(simNow)}.`);
}

function animate() {
  const now = Date.now();
  const dt = now - lastTick;
  lastTick = now;

  if (playing) {
    simulatedTimeMs += dt * speed;
    const hourOffset = (simulatedTimeMs - now) / 3600000;
    const clamped = Math.max(-24, Math.min(72, hourOffset));
    if (clamped !== hourOffset) {
      simulatedTimeMs = now + clamped * 3600000;
      playing = false;
      playToggleEl.textContent = "Play";
    }
    timelineEl.value = ((simulatedTimeMs - now) / 3600000).toFixed(1);
  }

  updateTimeLabel();
  redrawMarkers();
  requestAnimationFrame(animate);
}

playToggleEl.addEventListener("click", () => {
  playing = !playing;
  playToggleEl.textContent = playing ? "Pause" : "Play";
});

speedSelectEl.addEventListener("change", () => {
  speed = Number(speedSelectEl.value);
});

timelineEl.addEventListener("input", () => {
  simulatedTimeMs = Date.now() + Number(timelineEl.value) * 3600000;
  playing = false;
  playToggleEl.textContent = "Play";
  redrawMarkers();
  updateTimeLabel();
});

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveTab(btn.dataset.tab);
  });
});

computePassesEl.addEventListener("click", renderPasses);
searchLocationEl.addEventListener("click", searchObserverLocation);
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

locationResultsEl.addEventListener("change", () => {
  const idx = Number(locationResultsEl.value);
  if (!Number.isFinite(idx) || !locationCandidates[idx]) {
    return;
  }
  applyLocationCandidate(locationCandidates[idx]);
});

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
    updateObserverAltitudeFromCoords(coords, true);
    renderPasses();
  });
});

observerAltEl.addEventListener("change", () => {
  updateObserverMarker();
  updateComputePassesState();
  updateLocationSummary();
  redrawMarkers(true);
  renderPasses();
});

if (locationFilterDetailsEl) {
  locationFilterDetailsEl.addEventListener("toggle", () => {
    updateLocationSummary();
    layoutSidebarSections();
  });
}

window.addEventListener("resize", layoutSidebarSections);

if (satComboInputEl) {
  satComboInputEl.addEventListener("input", () => {
    renderSatComboSuggestions(findPassSatelliteMatches(satComboInputEl.value));
    selectedPassSatId = resolvePassSatelliteIdFromInput();
    renderPasses();
  });

  satComboInputEl.addEventListener("change", () => {
    selectedPassSatId = resolvePassSatelliteIdFromInput();
    const sat = satellites.find((item) => item.id === selectedPassSatId);
    if (sat) {
      satComboInputEl.value = satDisplayLabel(sat);
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
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    const first = satComboSuggestCandidates[0];
    if (first) {
      setPassSatelliteInputById(first.id);
      clearSatComboSuggestions();
    }
    renderPasses();
  });
}

if (satInfoEl) {
  satInfoEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (!target.closest("#sat-info-close")) {
      return;
    }
    clearActiveSatelliteSelection(false);
    setStatus("Satellite selection cleared.");
  });
}

if (coffeeBannerBtnEl) {
  coffeeBannerBtnEl.addEventListener("click", () => {
    window.open("#", "_blank", "noopener,noreferrer");
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
      locationResultsEl.value = "0";
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
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
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
  setActiveTab("filters");
  applyVerticalFitConstraints(true);
  simulatedTimeMs = Date.now();
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
  await loadSatellites();
  redrawMarkers(true);
  updateTimeLabel();
  passesListEl.innerHTML = "";
  setStatus("Choose your observer location to calculate passes.");
  setTimeout(() => {
    setStatus("Already loving this tracker", {
      actionLabel: "Buy me a coffe",
      actionTone: "green",
      actionHref: "#",
      durationMs: 12000
    });
    showCoffeeBannerFor10s();
  }, 38200);
  requestAnimationFrame(animate);
}

bootstrap();
