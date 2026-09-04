# CHANGELOG — weather-web 0.1.3

Date: 2026-09-03 America/New_York

## Summary

Bugfixes first, then top-5 adds as **flags/fields on existing SOURCE_REGISTRY tools**. No new mega-tools. No GIS RSS tool. No EDR/Water.

## Global

- Version **0.1.3** (`package.json`, `plugin.json`, `serverInfo`, UA strings, README, VERIFY, this file).
- Default User-Agent: `WeatherHazardsPlugin/0.1.3 (contact: chucktastictime@gmail.com)`.
- JTWC UA: `Mozilla/5.0 (compatible; WeatherHazardsPlugin/0.1.3; +https://github.com/TheAbsentTourist/weather-hazards)`.

## Phase A — bugfixes

- **gvp_weekly CAP:** map each `<info>` child (~26 volcanoes). Use the wrapper `<alert>` only as envelope for `identifier`/`sent`. Fall back to `<alert>` blocks if no `<info>`.
- **firms_hotspots CSV:** clamp `DAY_RANGE` to **1–5** (Area API max). Schema description updated. KML `7d` path unchanged.
- **gdacs_events SEARCH:** send `fromDate`/`toDate` on the wire (honored). Accept `fromDate`/`toDate` plus aliases `fromdate`/`todate`/`fromdatetime`/`todatetime`. Do **not** send ignored `fromdatetime` as the query key.

## Phase B — top-5 adds (existing tools)

- **jtwc_storms:** `include_advisories` (slim ABPW/ABIO); `include_invests` (ABPW disturbance → `TropicalStorm` `classification=INVEST`). STWA RSS item is no longer skipped when these flags are set. Named TCs are not re-parsed from ABPW.
- **nws_alerts:** query params `severity`, `urgency`, `region`, plus `limit`. Filters without lat/lon skip the default Austin point.
- **nws_forecast:** `product=afd` (optional `hwo`) — after `/points` use CWA as `location=` on `/products?type=AFD&location={cwa}` (**MRX** not KMRX); return latest `productText` slimmed as `NwsTextProduct`.
- **usgs_quakes:** keep PAGER fields on `QuakeEvent`: `alert`, `mmi`, `cdi`, `felt`. Feed variants `2.5_*` and `1.0_*`.
- **nhc_storms:** attach discussion/cone/track/bestTrack/graphics URL fields already on CurrentStorms.json. `include_outlook` parses `gtwo.xml` slim items. Not a GIS RSS tool.
- **swpc_snapshot:** `include_events` summarizes `edited_events.json` (type counts + recent FLA/XRA). `include_xrays` returns GOES 6-hour latest/peak sample (not 716 rows).

## Docs / smoke

- `scripts/smoke.mjs`: core plus AFD, JTWC invests, FIRMS schema; extended GVP count>1, USGS `alert` field, SWPC `include_events`, NHC outlook.
- TERMS: ABPW/JTWC USG disclaimer unchanged (already present).

## Not in 0.1.3

- MeteoAlarm EDR / MQTT / WebSub tool
- USGS Water, NHC GIS RSS as its own tool, EONET earthquakes
- Invented FIRMS MAP_KEY
