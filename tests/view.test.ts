import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeShare,
  defaultView,
  initialView,
  normalizeView,
  saveView,
  shareUrl,
  validateObserver,
  viewReducer,
} from '../src/state/view';

const now = Date.parse('2024-03-01T12:00:00Z');
const base = () => defaultView(now);
const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
let stored: Map<string, string>;
beforeEach(() => {
  stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  vi.stubGlobal('window', { location: { href: 'https://example.test/tracker?existing=keep#map' } });
});
afterEach(() => vi.unstubAllGlobals());

describe('view validation and sharing', () => {
  it('preserves an explicitly empty category selection through a Unicode share URL', () => {
    const state = {
      ...base(),
      categories: [],
      observer: { lat: 54.68, lon: 25.28, alt: 120, name: 'Vilnius, Žvėrynas 🛰️' },
      playing: false,
    };
    const url = new URL(shareUrl(state, now, window.location.href));
    expect(url.searchParams.get('existing')).toBe('keep');
    expect(url.hash).toBe('#map');
    expect(decodeShare(url.searchParams.get('view')!, base())).toEqual(state);
  });
  it('retains valid filter keys and NORAD IDs, deduplicating untrusted input', () => {
    const result = normalizeView(
      {
        version: 2,
        categories: ['iss', 'iss', 'tracked', 'amateur_selected', 'invalid', 1],
        tracked: ['NORAD-25544', 'NORAD-25544', 'junk'],
        selectedNorad: '25544',
        searchNorad: 25544,
      },
      base(),
    );
    expect(result.categories).toEqual(['iss', 'tracked', 'amateur_selected']);
    expect(result.tracked).toEqual(['NORAD-25544']);
    expect(result.selectedNorad).toBe('25544');
    expect(result.searchNorad).toBeNull();
  });
  it('rejects malformed types, invalid versions, dates, ranges, and map values', () => {
    expect(normalizeView({ version: 99 }, base())).toEqual(base());
    const result = normalizeView(
      {
        version: 2,
        passRange: 3,
        tab: ['settings'],
        simulatedTimeMs: Infinity,
        speed: 0,
        maxAltitudeKm: null,
        playing: 'false',
        map: { lat: 95, lon: 0, zoom: 4 },
        observer: { lat: null, lon: 0 },
      },
      base(),
    );
    expect(result).toEqual(base());
    for (const value of [
      '%',
      'a',
      encode({ version: 4 }),
      encode(null),
      encode([]),
      'a'.repeat(24001),
    ])
      expect(decodeShare(value, base())).toBeNull();
  });
  it('validates observer coordinates without coercing missing values to zero', () => {
    expect(validateObserver({ lat: '', lon: null })).toBeNull();
    expect(validateObserver({ lat: 91, lon: 0 })).toBeNull();
    expect(validateObserver({ lat: 0, lon: 181 })).toBeNull();
    expect(validateObserver({ lat: 0, lon: 0, alt: null })).toEqual({
      lat: 0,
      lon: 0,
      alt: 0,
      name: '',
    });
    expect(validateObserver({ lat: 0, lon: 0, alt: -400 })?.alt).toBe(-400);
  });
  it('migrates the actual nested v1 share schema', () => {
    const result = decodeShare(
      encode({
        version: 1,
        tab: 'passes',
        categories: [],
        observer: { lat: 54, lon: 25, alt: 140, name: 'Vilnius' },
        filters: {
          allLosEnabled: true,
          losOnlyEnabled: true,
          showPassesOnMap: false,
          maxAltitudeEnabled: true,
          maxAltitudeKm: 900,
        },
        time: { simulatedTimeMs: now, speed: 60, playing: false, format: '12h' },
        passes: { range: 'upcoming5', selectedNorad: '25544' },
        selected: { norad: '25544', searchNorad: '43017' },
        map: { lat: 54, lon: 385, zoom: 5 },
      }),
      base(),
    );
    expect(result).toMatchObject({
      version: 2,
      tab: 'passes',
      categories: [],
      allLosEnabled: true,
      losOnlyEnabled: true,
      showPassesOnMap: false,
      maxAltitudeEnabled: true,
      maxAltitudeKm: 900,
      simulatedTimeMs: now,
      speed: 60,
      playing: false,
      timeFormat: '12h',
      passRange: 'upcoming5',
      selectedNorad: '25544',
      searchNorad: '43017',
      passNorad: '25544',
      map: { lat: 54, lon: 385, zoom: 5 },
    });
  });
  it('keeps category and tracked toggles immutable and synchronizes selection', () => {
    const state = { ...base(), categories: [] };
    const selected = viewReducer(state, { type: 'toggleCategory', category: 'iss' });
    expect(state.categories).toEqual([]);
    expect(selected.categories).toEqual(['iss']);
    expect(viewReducer(selected, { type: 'toggleCategory', category: 'iss' }).categories).toEqual(
      [],
    );
    expect(viewReducer(state, { type: 'select', norad: '25544', search: true })).toMatchObject({
      selectedNorad: '25544',
      passNorad: '25544',
      searchNorad: '25544',
    });
  });
});

describe('storage migration', () => {
  it('preserves historical filter defaults (Starlink disabled, special filters enabled)', () => {
    expect(initialView().categories).not.toContain('starlink');
    expect(initialView().categories).toEqual(
      expect.arrayContaining(['tracked', 'amateur_selected', 'iss']),
    );
  });
  it('reads exact original storage keys and formats, removing obsolete credentials', () => {
    stored.set('satapp_category_filters_enabled', '[]');
    stored.set('satapp_tracked_sat_ids', '["NORAD-25544"]');
    stored.set('satapp_observer_location', '{"lat":54,"lon":25,"alt":140,"name":"Vilnius"}');
    stored.set('satapp_all_los_enabled', '1');
    stored.set('satapp_los_only_enabled', '1');
    stored.set('satapp_show_passes_on_map', '0');
    stored.set('satapp_max_altitude_enabled', '1');
    stored.set('satapp_max_altitude_km', '800');
    stored.set('satapp_time_format', '12h');
    stored.set('satapp_space_track_identity', 'old user');
    stored.set('satapp_space_track_password', 'old password');
    expect(initialView()).toMatchObject({
      version: 2,
      categories: [],
      tracked: ['NORAD-25544'],
      observer: { lat: 54, lon: 25, alt: 140, name: 'Vilnius' },
      allLosEnabled: true,
      losOnlyEnabled: true,
      showPassesOnMap: false,
      maxAltitudeEnabled: true,
      maxAltitudeKm: 800,
      timeFormat: '12h',
    });
    expect(stored.has('satapp_space_track_identity')).toBe(false);
    expect(stored.has('satapp_space_track_password')).toBe(false);
  });
  it('retains preferences across reloads while resetting the live clock, with URL taking precedence', () => {
    const state = { ...base(), categories: [], playing: false, speed: 60 };
    saveView(state);
    expect(initialView()).toMatchObject({ categories: [], playing: true, speed: 60 });
    expect(initialView().simulatedTimeMs).toBeGreaterThan(now);
    window.location.href = shareUrl({ ...state, categories: ['iss'] }, now);
    expect(initialView()).toEqual({ ...state, categories: ['iss'] });
  });
  it('falls back to legacy values when newer data is corrupt and survives denied storage', () => {
    stored.set('satapp_view_v2', '{"version":99}');
    stored.set('satapp_time_format', '12h');
    expect(initialView().timeFormat).toBe('12h');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(() => initialView()).not.toThrow();
    expect(() => saveView(base())).not.toThrow();
  });
});

describe('pass watchlist state', () => {
  it.each(['3h', '5h', '12h'] as const)(
    'preserves %s ranges through storage and sharing',
    (passRange) => {
      const state = normalizeView({ version: 2, passRange }, base());
      expect(state.passRange).toBe(passRange);
      saveView(state);
      expect(initialView().passRange).toBe(passRange);
      const url = new URL(shareUrl(state, now, window.location.href));
      expect(decodeShare(url.searchParams.get('view')!, base())?.passRange).toBe(passRange);
    },
  );
  it('migrates old v1/v2 pass selection only when a watchlist is absent', () => {
    expect(normalizeView({ version: 2, passNorad: '25544' }, base()).passWatchlist).toEqual([
      '25544',
    ]);
    expect(
      normalizeView({ version: 1, passes: { selectedNorad: '43017' } }, base()).passWatchlist,
    ).toEqual(['43017']);
    expect(
      normalizeView({ version: 2, passNorad: '25544', passWatchlist: [] }, base()).passWatchlist,
    ).toEqual([]);
    expect(
      normalizeView({ version: 1, passes: { selectedNorad: '25544' }, passWatchlist: [] }, base())
        .passWatchlist,
    ).toEqual([]);
    expect(
      normalizeView({ version: 2, passNorad: '25544', passWatchlist: null }, base()).passWatchlist,
    ).toEqual([]);
  });
  it('validates/deduplicates IDs and preserves the list through storage and sharing', () => {
    const state = normalizeView(
      { version: 2, passWatchlist: ['25544', '43017', '25544', 42, 'NORAD-1', '-2'] },
      base(),
    );
    expect(state.passWatchlist).toEqual(['25544', '43017']);
    saveView(state);
    expect(initialView().passWatchlist).toEqual(state.passWatchlist);
    const url = new URL(shareUrl(state, now, window.location.href));
    expect(decodeShare(url.searchParams.get('view')!, base())?.passWatchlist).toEqual(
      state.passWatchlist,
    );
  });
  it('keeps map/detail selection independent of the watchlist', () => {
    const state = { ...base(), passWatchlist: ['25544', '43017'] };
    const selected = viewReducer(state, { type: 'select', norad: '12345', search: true });
    expect(selected.selectedNorad).toBe('12345');
    expect(selected.passWatchlist).toEqual(['25544', '43017']);
    expect(viewReducer(selected, { type: 'select', norad: null }).passWatchlist).toEqual(
      state.passWatchlist,
    );
    const empty = { ...base(), passWatchlist: [] };
    expect(viewReducer(empty, { type: 'select', norad: '25544' }).passWatchlist).toEqual([]);
  });
});
