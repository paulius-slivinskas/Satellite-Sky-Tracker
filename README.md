# Satellite Sky Tracker

Satellite tracking, orbit paths, observer line of sight (LOS), pass prediction, and radio information on a Leaflet world map. The client uses React, TypeScript, Vite, HeroUI, and Google Sans from Google Fonts. Orbit propagation uses `satellite.js`; Express serves the radio API and production assets.

## Development

Use Node **22.12 or newer** (`.nvmrc` records the project version).

```bash
npm ci
npm run dev
```

Open **http://localhost:5173**. Vite serves the React client and proxies `/api` requests to the Express process on port 8080. Both processes start with `npm run dev`; `npm run dev:client` starts only Vite.

## Production

```bash
npm ci
npm run build
npm start
```

Open **http://localhost:8080**. Build before starting: Express serves the generated `dist/` assets, not TypeScript source. Static serving is restricted to `dist/` and optional `public/`; the repository root is not published.

Optional environment variables:

| Variable              | Purpose                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `PORT`                | Express port (default `8080`; update the Vite API proxy if changing it during development).                         |
| `REDIS_URL`           | Optional radio cache. Without Redis, the server uses a bounded in-memory cache; Redis failures fall back to memory. |
| `AMSAT_FREQ_CSV_PATH` | Path to additional radio-frequency CSV data loaded by the server.                                                   |

## Code organization

| Location                                    | Responsibility                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/App.tsx`, `src/components/`            | React interface and HeroUI controls.                                              |
| `src/state/`                                | View state, reducers, simulation hooks, persistence, and shared URL validation.   |
| `src/domain/`                               | TLE parsing, orbit math, pass prediction, category definitions, and shared types. |
| `src/domain/passes.worker.ts`               | Pass calculations outside the UI thread.                                          |
| `src/map/`                                  | Leaflet rendering and interaction.                                                |
| `src/data/`                                 | External requests, catalog loading, radio/location lookups, and browser storage.  |
| `server.js`, `services/`, `lib/`, `config/` | Radio API, normalization, cache, and configured radio data.                       |
| `tests/`                                    | Deterministic unit, server, and browser regression coverage.                      |

React owns application state. Leaflet owns map layers through the map adapter. Orbit functions receive the observer, altitude, and time explicitly, without reading DOM controls. Pass prediction retains the original five-second elevation search and two-second footprint-boundary sampling.

Passes has a dedicated satellite watchlist, edited in a HeroUI modal with category browsing, name/NORAD search, checkboxes, and a selected bucket. Remove individual satellites by unchecking them or using the bucket's remove button; Clear list empties the draft. Apply saves the draft and recalculates from the current simulation time; Cancel, Escape, and dismissal discard changes. The watchlist persists across reloads and shared links independently of map filters, tracked favorites, and satellite details. Legacy single-satellite pass selections migrate to a one-item watchlist.

One worker merges all watchlist passes chronologically. Time ranges cover the next 3/5/12/24/48/72 hours from the calculation anchor; next 3/5 means that many events across the whole watchlist within a 72-hour search. A range selects overlapping events; a pass crossing a range edge is completed through its actual horizon crossing, including its full peak. Edge searches are bounded to one orbital period (30 minutes to 24 hours); unknown boundaries are explicitly labeled instead of presented as rise/set times. All resulting paths appear on the map even when their satellite categories are hidden. Cards identify the satellite; hovering or focusing a pass highlights its path. For more than five events, time labels appear on focus to reduce overlap. A dashed incoming route connects each watchlist satellite to its nearest future LOS entry only; it disappears during that pass and advances to the next one after LOS ends. It uses the same color and focus highlighting as the solid pass. Satellites missing orbital data remain in the editable watchlist with a warning and are excluded from prediction until data returns.

Moving satellite dots use fractional-pixel projection and animation-frame interpolation between 250 ms propagation samples. The map and time controls share a continuous clock so pause and time changes stay aligned. Dashed orbit and approach tracks cache geometry on an anchored time grid. Their visible ends are trimmed with a matching dash offset, so the pattern stays stationary without SVG masks. Panning reuses projected geometry and skips drawing offscreen track segments.

The basemap uses MapLibre with OpenFreeMap vector tiles beneath the Leaflet satellite layers. Its minimal style shows uniform land, water, roads, borders, and place names, with native light/dark palettes and visible attribution. MapLibre's worker is bundled by Vite. Zoom-out is limited by viewport height, and vertical panning stays inside the Mercator world, including after resize; horizontal world wrapping remains available. Location autocomplete uses Photon; elevation uses Open-Meteo.

The bottom-right map controls form one vertical stack: theme, layers, zoom in, and zoom out. All four use matching 44 px buttons with 8 px gaps. The sun/moon button switches the entire interface and basemap between light and dark themes. The preference is stored separately as `satapp_theme`, applied before the initial paint, and kept out of shared tracking links.

The layer button above the zoom controls opens a visual picker. Minimal is the original quiet map. Atlas is an original paper/ink palette with soft woodland fills and outlined roads; Blueprint uses a blue technical palette, coastlines, and a geographic grid at world scales. Each has independently defined light/dark colors. These are local styles over OpenFreeMap's OpenMapTiles data, not hosted Stamen or Protomaps styles. Layer preference is stored as `satapp_map_layer`; changing styles preserves the map view, satellite selection, and overlays.

Satellite uses **EOX Sentinel-2 Cloudless 2016**, a roughly 10 m imagery mosaic, with place labels and a dimmer night rendering. It is historical imagery, not a live image or recent aerial survey. The free EOX WMTS endpoint is rate limited and has no availability guarantee. The 2016 product is CC BY 4.0; newer EOX vintages have different usage conditions. Required EOX, Copernicus, and license attribution is shown on the map. See [EOX service information](https://maps.eox.at/), [product licensing](https://cloudless.eox.at/pricing), and [WMTS metadata](https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml).

## Data and saved views

The Passes panel includes a **Pass notifications** toggle and separate **Test entering** and **Test peak** buttons. Each watched pass has two real-time alerts: entry above the horizon (two rising notes) and maximum elevation at the trajectory's peak marker (a distinct three-note sequence). Horizon crossings are sampled every second; peaks use rolling three-hour real-time predictions refreshed hourly, preserving the displayed marker's exact time for matching passes. Both work independently of paused/accelerated simulation and the selected prediction range. Alerts appear in-page for 30 seconds and as desktop notifications when permission is granted. Either test button unlocks audio and requests desktop permission from a user gesture. Denied or unsupported desktop notifications do not suppress in-page alerts. The preference is saved locally, outside shared URLs. Keep the page open and the device awake: this is not a background push service. Past events at initial load and stale events after long sleep do not generate catch-up alerts.

Satellite search and pass selection resolve alternate names by NORAD ID, ignoring case, spacing, and punctuation. Queries such as `AO-91`, `Fox 1B`, and `CAS-3H / LilacSat-2` find their catalog objects. Additional names appear in results, the watchlist editor, and satellite details. The bundled `src/data/satellite-names.json` index combines SatNOGS names with the local AMSAT frequency CSV; it works offline and does not add satellites without orbital data. It covers names recorded by those sources, not every possible nickname. Refresh it with `npm run update:satellite-names`, then rebuild. The snapshot records its source URLs and fetch time; refresh failures leave the previous file intact.

CelesTrak TLE feeds and SATCAT details go through same-origin `/api/celestrak/elements` and `/api/celestrak/satcat` routes. Browsers never fetch CelesTrak directly. One server service serializes upstream requests, deduplicates concurrent requests, and stores validated responses plus attempt deadlines in `.cache/celestrak/cache.json` (override with `CELESTRAK_CACHE_DIR`). Keep this directory on durable storage when deploying; the cache is shared by all visitors served by that Node process and survives restarts.

Each resource is downloaded at most once every seven days. The running server checks known cache entries hourly and refreshes those due; cold or overdue entries can also be loaded on demand. The browser checks hourly while open and reuses its weekly local cache. Reload, Retry, and Check saved data do not force an upstream refresh. HTTP 403/429 pauses all CelesTrak requests for at least seven days (longer if requested by Retry-After), with that pause persisted across restarts. Other failures also retain the per-resource weekly retry deadline.

Responses are validated before atomically replacing saved data. Empty, malformed, failed, or blocked responses never replace the last valid payload. Retained browser and server orbital data is not discarded merely because it is old; the interface warns about overdue feeds and TLE epochs more than seven days from the current date. ISS can still use the independent SatNOGS fallback. A completely new installation with no saved data still needs one successful download; caching cannot reconstruct data that was never received.

HeroUI Alert notifications distinguish loading, provider throttling, partial feed failures, no usable data, and old orbital elements. Location, pass calculation, radio, and share feedback use the same Alert wrapper. Non-loading alerts have a HeroUI close button and neutral action buttons. A dismissed catalog issue stays hidden for that tab session, including reloads and background checks; a different issue or a recurrence after recovery is shown again. Detailed catalog errors and affected categories remain available separately from orbital age, so old elements are not described as a network outage.

The radio endpoint is `GET /api/sat/:norad/radio`, for example:

```bash
curl http://localhost:8080/api/sat/25544/radio
```

Responses contain normalized transmitter frequency ranges in Hz, source metadata, status, and fetch time. Frequencies absent from a source remain `null` rather than becoming zero. SatNOGS metadata, optional AMSAT status, CSV rows, and configured radio rows are combined on the server.

Preferences are stored as `satapp_view_v2`. Existing category, tracked-satellite, observer, LOS, altitude, and time-format preferences are migrated from their original browser keys. Obsolete browser-stored Space-Track credentials are removed. Normal reloads restart the live clock; `?view=...` links restore their encoded simulation state, including an empty category selection. Both the original nested version-1 links and version-2 links are accepted.

## Validation

```bash
npm run typecheck
npm test
npm run build
```

`npm run check` runs all three. Use `npm run format` to apply the shared formatter and `npm run format:check` to verify it. Browser regressions use Playwright:

```bash
npx playwright install chromium
npm run test:e2e
```

The Playwright configuration builds the app, starts Express on port 4173, and exercises the production bundle in desktop and mobile Chromium layouts. Tests use fixed fixtures and intercepted external responses, so successful tests do not verify current availability or accuracy of third-party feeds. Google Fonts, map tiles, and live data still require their respective services in normal use.

Domain tests cover a fixed historical TLE, original pass-timing parity, horizon and LOS boundaries, observer-altitude units, the date line, invalid propagation, and bounded track sampling. State tests cover malformed shared views, legacy migrations, and empty-category round trips. GitHub Actions runs type checking, unit tests, production build, and browser tests; browser failure artifacts are retained for inspection.
