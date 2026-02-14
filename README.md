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
