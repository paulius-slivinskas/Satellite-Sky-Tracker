import { FILTER_CONFIG } from '../domain/config';
import type { Observer, ViewState } from '../domain/types';
import { readStored, writeStored } from '../data/storage';
const KEY = 'satapp_view_v2';
function readLegacyTimeFormat() {
  try {
    return localStorage.getItem('satapp_time_format') === '12h' ? '12h' : '24h';
  } catch {
    return '24h';
  }
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const norad = (value: unknown) =>
  typeof value === 'string' && /^\d{1,9}$/.test(value) ? value : null;
export function defaultView(now = Date.now()): ViewState {
  return {
    version: 2,
    tab: 'filters',
    categories: FILTER_CONFIG.filter((c) => c.key !== 'starlink').map((c) => c.key),
    tracked: [],
    observer: null,
    selectedNorad: null,
    searchNorad: null,
    passNorad: null,
    passWatchlist: [],
    allLosEnabled: false,
    losOnlyEnabled: false,
    showPassesOnMap: true,
    maxAltitudeEnabled: false,
    maxAltitudeKm: 5000,
    timeFormat: '24h',
    speed: 1,
    playing: true,
    simulatedTimeMs: now,
    passRange: '1',
    map: { lat: 15, lon: 0, zoom: 3 },
  };
}
export function validateObserver(value: unknown): Observer | null {
  const o = object(value);
  if (!finite(o.lat) || !finite(o.lon) || o.lat < -90 || o.lat > 90 || o.lon < -180 || o.lon > 180)
    return null;
  return {
    lat: o.lat,
    lon: o.lon,
    alt: finite(o.alt) && o.alt >= -500 && o.alt <= 100000 ? o.alt : 0,
    name: typeof o.name === 'string' ? o.name.slice(0, 300) : '',
  };
}
export function normalizeView(value: unknown, base = defaultView()): ViewState {
  let raw = object(value);
  if (raw.version !== 1 && raw.version !== 2) return base;
  if (raw.version === 1) {
    const time = object(raw.time),
      passes = object(raw.passes),
      selected = object(raw.selected);
    raw = {
      ...raw,
      ...object(raw.filters),
      ...time,
      timeFormat: time.format,
      passRange: passes.range,
      selectedNorad: selected.norad,
      searchNorad: selected.searchNorad,
      passNorad: passes.selectedNorad,
    };
  }
  const result = { ...base };
  const categories = new Set(FILTER_CONFIG.map((c) => c.key));
  if (Array.isArray(raw.categories))
    result.categories = [
      ...new Set(
        raw.categories.filter(
          (key): key is string => typeof key === 'string' && categories.has(key),
        ),
      ),
    ];
  if (Array.isArray(raw.tracked))
    result.tracked = [
      ...new Set(
        raw.tracked.filter(
          (id): id is string => typeof id === 'string' && /^NORAD-\d{1,9}$/.test(id),
        ),
      ),
    ];
  if ('observer' in raw) result.observer = validateObserver(raw.observer);
  for (const key of ['selectedNorad', 'searchNorad', 'passNorad'] as const)
    if (key in raw) result[key] = norad(raw[key]);
  if ('passWatchlist' in raw) {
    result.passWatchlist = Array.isArray(raw.passWatchlist)
      ? [...new Set(raw.passWatchlist.filter((value): value is string => norad(value) !== null))]
      : [];
  } else if ('passNorad' in raw) {
    const legacyPass = norad(raw.passNorad);
    result.passWatchlist = legacyPass ? [legacyPass] : [];
  }
  for (const key of [
    'allLosEnabled',
    'losOnlyEnabled',
    'showPassesOnMap',
    'maxAltitudeEnabled',
    'playing',
  ] as const)
    if (typeof raw[key] === 'boolean') result[key] = raw[key];
  if (typeof raw.tab === 'string' && ['filters', 'time', 'passes', 'settings'].includes(raw.tab))
    result.tab = raw.tab as ViewState['tab'];
  if (
    typeof raw.passRange === 'string' &&
    ['3h', '5h', '12h', '1', '2', '3', 'upcoming3', 'upcoming5'].includes(raw.passRange)
  )
    result.passRange = raw.passRange as ViewState['passRange'];
  if (raw.timeFormat === '12h' || raw.timeFormat === '24h') result.timeFormat = raw.timeFormat;
  if (finite(raw.maxAltitudeKm) && raw.maxAltitudeKm >= 1 && raw.maxAltitudeKm <= 1000000)
    result.maxAltitudeKm = raw.maxAltitudeKm;
  if (finite(raw.speed) && [1, 10, 60, 300, 900].includes(raw.speed)) result.speed = raw.speed;
  if (finite(raw.simulatedTimeMs) && Math.abs(raw.simulatedTimeMs) <= 8640000000000000)
    result.simulatedTimeMs = raw.simulatedTimeMs;
  const map = object(raw.map);
  if (
    finite(map.lat) &&
    finite(map.lon) &&
    finite(map.zoom) &&
    Math.abs(map.lat) <= 85 &&
    Math.abs(map.lon) <= 1000000 &&
    map.zoom >= 0 &&
    map.zoom <= 12
  )
    result.map = { lat: map.lat, lon: map.lon, zoom: map.zoom };
  return result;
}
export function decodeShare(encoded: string, base = defaultView()): ViewState | null {
  try {
    if (encoded.length > 24000) return null;
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
    );
    const raw = JSON.parse(json);
    return raw?.version === 1 || raw?.version === 2 ? normalizeView(raw, base) : null;
  } catch {
    return null;
  }
}
export function shareUrl(state: ViewState, time: number, href = window.location.href) {
  const bytes = new TextEncoder().encode(JSON.stringify({ ...state, simulatedTimeMs: time }));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const url = new URL(href);
  url.searchParams.set('view', encoded);
  return url.toString();
}
function migrateLegacy(): ViewState {
  const base = defaultView();
  const categories = readStored<unknown>('satapp_category_filters_enabled');
  const tracked = readStored<unknown>('satapp_tracked_sat_ids');
  const oldObserver = readStored<Record<string, unknown>>('satapp_observer_location');
  const observer = oldObserver
    ? { ...oldObserver, alt: oldObserver.alt ?? oldObserver.altMeters ?? 0 }
    : null;
  return normalizeView(
    {
      version: 2,
      timeFormat: readLegacyTimeFormat(),
      categories: categories ?? base.categories,
      tracked: tracked ?? [],
      observer,
      allLosEnabled: readStored('satapp_all_los_enabled') === 1,
      losOnlyEnabled: readStored('satapp_los_only_enabled') === 1,
      showPassesOnMap: readStored('satapp_show_passes_on_map') !== 0,
      maxAltitudeEnabled: readStored('satapp_max_altitude_enabled') === 1,
      maxAltitudeKm: readStored('satapp_max_altitude_km') ?? 5000,
    },
    base,
  );
}
export function initialView(): ViewState {
  const saved = readStored<unknown>(KEY);
  const preferences = normalizeView(saved, migrateLegacy());
  const live = { ...preferences, simulatedTimeMs: Date.now(), playing: true };
  // Credentials from the removed browser-only Space-Track integration must not linger.
  try {
    localStorage.removeItem('satapp_space_track_identity');
    localStorage.removeItem('satapp_space_track_password');
  } catch {
    /* Storage unavailable. */
  }
  const shared = new URL(window.location.href).searchParams.get('view');
  return shared ? (decodeShare(shared, live) ?? live) : live;
}
export function saveView(state: ViewState) {
  writeStored(KEY, state);
}
export type ViewAction =
  | { type: 'patch'; patch: Partial<ViewState> }
  | { type: 'toggleCategory'; category: string }
  | { type: 'toggleTracked'; id: string }
  | { type: 'select'; norad: string | null; search?: boolean };
export function viewReducer(state: ViewState, action: ViewAction): ViewState {
  if (action.type === 'patch') return { ...state, ...action.patch };
  if (action.type === 'select')
    return {
      ...state,
      selectedNorad: action.norad,
      passNorad: action.norad,
      ...(action.search ? { searchNorad: action.norad } : {}),
    };
  const key = action.type === 'toggleCategory' ? 'categories' : 'tracked';
  const value = action.type === 'toggleCategory' ? action.category : action.id;
  return {
    ...state,
    [key]: state[key].includes(value)
      ? state[key].filter((id) => id !== value)
      : [...state[key], value],
  };
}
