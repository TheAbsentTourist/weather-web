# VERIFY — weather-hazards 0.1.4

Date: 2026-09-03 (pending live smoke)

## Install
- Version: **0.1.4** in package.json, plugin.json, server initialize `serverInfo`, UA strings, README, CHANGELOG-0.1.4.md, this file
- Default test point: Austin, TX 30.2672, -97.7431

## Checks
Live smoke results will replace this placeholder after `node --check server.mjs`, `node scripts/smoke.mjs`, and `WEATHER_OPTIONAL=1 node scripts/smoke.mjs`.

## Tools
Core (8): nws_forecast, nws_alerts, usgs_quakes, nhc_storms, jtwc_storms, swpc_snapshot, meteoalarm_alerts, firms_hotspots
Optional (4): eonet_events, gdacs_events, gvp_weekly, open_meteo_forecast

## Notes
- SYNTHESIS.md deleted
- No Big Stone Gap / 36.86 / -82.78
- FIRMS kml is keyless; missing_data stays keyed
