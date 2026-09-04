# CHANGELOG — weather-web 0.1.1

Date: 2026-09-03 America/New_York

A+C extensions land as **modes/flags on existing SOURCE_REGISTRY tools**. Tool count is unchanged (core 7 + optional 4). No MeteoAlarm EDR/MQTT, no invented FIRMS key, no USGS Water / NHC GIS RSS tool / EONET earthquakes / Europe Atom / JTWC.

## Global

- Version **0.1.1** (`package.json`, `plugin.json`, `serverInfo`, README, VERIFY).
- Identifying User-Agent on **every** fetch: `WeatherHazardsPlugin/0.1.1 (contact: chucktastictime@gmail.com)`.
- `confidence_tier` unchanged: NWS/MeteoAlarm/NHC=official; USGS=catalog; SWPC/GDACS/GVP=specialist; FIRMS/Open-Meteo=overlay; EONET=catalog.

## A — existing tools

1. **nws_forecast** `product`: `periods` (default) | `hourly` | `grid` | `observation`. Follows `/points` links; observation uses first station `/observations/latest` as slim `Observation`.
2. **nws_alerts** optional `event`, `zone`, `status` on `/alerts/active` (still supports point lat/lon and area).
3. **usgs_quakes** `feed` hour|day|week|month|significant_*|4.5_*|query; `eventid` → `detail/{id}.geojson`; `meta` count|catalogs|contributors via FDSN.
4. **swpc_snapshot** `include_indices` (Kp now+forecast + 10cm flux), `include_aurora` (ovation summarized; default false), `include_icao`.
5. **gvp_weekly** `mode` weekly|lookup. Weekly prefers WeeklyVolcanoCAP.xml. Lookup = WFS Holocene_Volcanoes GeoJSON filtered by `name`/`country` with `maxFeatures` cap.
6. **open_meteo_forecast** `name` geocodes first; `hourly` bool; current weather always requested; TERMS non-commercial note on payload.
7. **firms_hotspots** km `bboxFromPoint(lat,lon,radius_km)` instead of ±2°; `mode` csv (default) | kml | status | availability. kml is keyless regional footprint. status/availability require MAP_KEY and return `config_error` without one.
8. **gdacs_events** `mode` rss_24h (default) | rss_full | events4app | search. events4app uses **lowercase** path `/geteventlist/events4app`.

## C — also

9. **eonet_events** `format` json|geojson; `include_layers`; earthquakes still refused/stripped.
10. **nhc_storms** `include_advisories` fetches index-at.xml / index-ep.xml / index-cp.xml, attaches slim advisory items (not a GIS RSS tool).
11–14. Covered by FIRMS kml, SWPC aurora/icao, Open-Meteo hourly, USGS FDSN meta, GDACS rss_full above.

## Docs / smoke

- README tool tables, TERMS, SKILL.md when-to-use flags.
- MeteoAlarm WebSub is **not** a tool; README/TERMS note that clients may WebSub the per-country Atom URLs.
- `scripts/smoke.mjs`: core 3 checks + A check `nws_forecast product=hourly`; `WEATHER_OPTIONAL=1` (or `--extended`) runs the A+C suite.

## Not in 0.1.1

- MeteoAlarm EDR / MQTT / WebSub tool
- JTWC (B, separate)
- USGS Water, NHC GIS RSS as its own tool, EONET earthquakes, Europe-wide Atom
