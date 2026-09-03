# VERIFY — weather-hazards 0.1.6

Date: 2026-09-03 UTC

## Install
- Workspace: `/workspace`
- Version: **0.1.6** in package.json, plugin.json, `.cursor-plugin/plugin.json`, server initialize `serverInfo`, UA strings, README, CHANGELOG-0.1.6.md, smoke clientInfo, this file
- Default test point: Austin, TX 30.2672, -97.7431
- Path intent: `~/.cursor/plugins/local/weather-hazards` (real directory, not a symlink from outside that folder)

## Checks
| Check | Result |
|---|---|
| `node --check server.mjs` | **PASS** |
| `node scripts/mcp-path-test.mjs` | **PASS** — portable `node` + `["./server.mjs"]` + `cwd` `"./"`; `FIRMS_MAP_KEY` + master `WEATHER_OPTIONAL` + four `WEATHER_ENABLE_*` in Configure variables; every `${VAR}` in mcp.json env declared |
| Core smoke (`scripts/smoke.mjs`) | **PASS** — see lines below |
| `WEATHER_OPTIONAL=1` extended smoke | **PASS** — FIRMS csv `config_error`; optional tools listed |
| FIRMS without key | `config_error` on csv; kml keyless **PASS** |
| Shipped `mcp.json` | `node` + `["./server.mjs"]` + `cwd` `"./"`; `${WEATHER_OPTIONAL}` kept for CLI/host |
| No EDR / USGS Water / GIS RSS tool | unchanged |

## Configure schema

Plugins → Configure: `FIRMS_MAP_KEY`, master **Enable optional tools** (`WEATHER_OPTIONAL`), plus per-source `WEATHER_ENABLE_*` finer toggles. None required. This environment cannot prove the Configure UI click.

## Core smoke PASS lines (live, not invented)

```
PASS firms_hotspots days schema CSV 1–5 (default 1); also maps kml date_span
PASS nws_forecast Austin, TX Slight Chance Showers And Thunderstorms
PASS usgs_quakes count= 5
PASS nhc_storms count= 3 Karina,Marie,Lowell
PASS jtwc_storms count= 2 Saudel,Krovanh
PASS nws_forecast hourly 3 2026-09-03T13:00:00-05:00
PASS nws_forecast afd EWX KEWX chars= 6883
PASS jtwc include_invests count= 3 97W
PASS jtwc include_advisories count= 2
PASS nws_alerts count= 0 point= 30.2672,-97.7431
PASS swpc_snapshot scales current,forecast_1,forecast_2
PASS meteoalarm_alerts country= germany count= 5
PASS firms_hotspots kml region= usa_contiguous_and_hawaii bytes= 215890
tools: nws_forecast, nws_alerts, usgs_quakes, nhc_storms, jtwc_storms, swpc_snapshot, meteoalarm_alerts, firms_hotspots
protocolVersion: 2024-11-05
mode: core
PASS smoke
```

## Extended smoke (FIRMS no-key + optional tools)

```
PASS firms_hotspots config_error (no invented key)
PASS eonet_events count= 5
PASS gdacs_events mode= rss_full count= 5
PASS gvp_weekly format= rss count= 5 total= 26
PASS open_meteo_forecast name= Austin, Texas, United States current= 36.6 hourly= 48
mode: extended
PASS smoke
```

Austin nws_alerts count=0 is a live empty active set. Shape was OfficialAlertList.

## Tools
Core (8): nws_forecast, nws_alerts, usgs_quakes, nhc_storms, jtwc_storms, swpc_snapshot, meteoalarm_alerts, firms_hotspots
Optional (4): eonet_events, gdacs_events, gvp_weekly, open_meteo_forecast

## IDE note
Reload Window / Customize to see the plugin. Set `FIRMS_MAP_KEY` and flip **Enable optional tools** (or per-source `WEATHER_ENABLE_*`) under Plugins → Configure. This environment cannot prove the Configure UI click or Windows Cursor plugin spawn.
