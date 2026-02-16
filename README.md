# Satellite Sky Tracker

A browser-based satellite tracking app with:
- Category filters: ISS, amateur radio, Starlink, weather, and other active satellites
- Live moving satellite markers on a world map
- Pass prediction over a chosen observer location
- Time controls to simulate past/future satellite motion

## Run
Install dependencies and start the app server:

```bash
npm install
npm run dev
```

Then open:

`http://localhost:8080`

## Radio API
Backend endpoint:

`GET /api/sat/:norad/radio`

Example request:

```bash
curl http://localhost:8080/api/sat/25544/radio
```

Example response:

```json
{
  "norad": 25544,
  "satName": "ISS",
  "source": {
    "satnogs": true,
    "amsat": true
  },
  "transmitters": [
    {
      "id": 1234,
      "label": "CW Beacon",
      "typeHint": "beacon",
      "uplink": {
        "low": null,
        "high": null,
        "unit": "Hz"
      },
      "downlink": {
        "low": 145800000,
        "high": 145800000,
        "unit": "Hz"
      },
      "beacon": {
        "low": null,
        "high": null,
        "unit": "Hz"
      },
      "mode": "CW",
      "callsign": "RS0ISS",
      "status": "Active",
      "service": null,
      "baud": null,
      "invert": null,
      "alive": true,
      "notes": null
    }
  ],
  "status": {
    "provider": "amsat",
    "lastReportTime": "2026-02-14T10:22:00.000Z",
    "lastReport": "Operational",
    "recentReportsCount": 4
  },
  "fetchedAt": "2026-02-14T10:25:21.000Z"
}
```

## Notes
- Satellite data is loaded from CelesTrak TLE feeds at runtime.
- Radio info is normalized through backend `/api/sat/:norad/radio` (SatNOGS + optional AMSAT mapping).
- Additional CSV radio rows can be loaded via `AMSAT_FREQ_CSV_PATH`.
- Starlink and active groups are capped for browser performance.

## Release notes

### Original release
- Interactive world map with live satellite movement from TLE data.
- Category-based filtering (ISS, Amateur Radio, Starlink, Weather, Military/Active groups).
- Satellite selection with orbit path rendering.
- Observer location workflow with pass prediction and pass list.
- Time simulation controls (play/pause, speed, jog, reset).
- Satellite info popup with orbital metadata and amateur radio transmitter data.

### Today (2026-02-16)
- Improved LOS/pass alignment:
  - Pass windows now use a footprint-consistent LOS boundary check.
  - Reduced mismatch cases where pass track ended too early relative to LOS footprint.
- Added shareable deep-link view:
  - Share action in satellite popup header (chain icon).
  - Encodes current view state in URL (`?view=...`) and restores on open.
  - Includes map view, filters, observer, time state, selected satellite, and pass settings.
  - Fixed selected satellite auto-open when opening a shared link.
- Satellite info popup UX updates:
  - Popup header now shows the satellite name directly.
  - Removed duplicate satellite name row.
- Mobile/tablet UX updates:
  - Added responsive sidebar toggle button for tablet/mobile.
  - Toggle icon states fixed (menu=open action, X=close action) and aligned vertically.
  - Smartphone sidebar now uses full-height content flow for easier scrolling.
  - Smartphone satellite info changed to bottom-sheet style (opens from bottom, ~50% height).
  - Map zoom controls now shift upward when the mobile bottom sheet is open.
  - When sidebar is opened on mobile/tablet, map zoom controls are hidden.
  - Opening sidebar while bottom sheet is open now auto-closes the sheet to avoid overlap conflicts.
- Notification/marketing cleanup:
  - Removed “Already loving this tracker” toast and coffee banner/action entirely.
