# VERIFY — weather-hazards 0.1.5

Date: 2026-09-03 UTC

## Install
- Workspace: `/workspace`
- Version: **0.1.5** in package.json, plugin.json, server initialize `serverInfo`, UA strings, README, CHANGELOG-0.1.5.md, smoke clientInfo, this file
- Default test point: Austin, TX 30.2672, -97.7431
- Path intent: `~/.cursor/plugins/local/weather-hazards` (real directory, not a symlink from outside that folder)

## Checks
| Check | Result |
|---|---|
| `node --check server.mjs` | **PASS** |
| `node scripts/mcp-path-test.mjs` | **PASS** — `node` + `["./server.mjs"]` + `cwd` `"./"`; no `${PLUGIN_ROOT}`; no `C:\Users` / `Program Files` |
| Core smoke (`scripts/smoke.mjs`) | **PASS** — see lines below |
| `WEATHER_OPTIONAL=1` extended smoke | not re-run (cwd/docs patch; tools unchanged from 0.1.4) |
| FIRMS without key | `config_error` on csv; kml keyless **PASS** |
| Shipped `mcp.json` | `node` + `["./server.mjs"]` + `cwd` `"./"`; no `${PLUGIN_ROOT}`; no machine-absolute paths |
| No EDR / USGS Water / GIS RSS tool | unchanged |

## mcp.json spawn shape

Public file stays portable. Cursor Windows host bugs (cwd = home, unexpanded `${PLUGIN_ROOT}`, `cwd: "${PLUGIN_ROOT}"` ENOENT) are in [docs/cursor-windows-mcp-spawn.md](docs/cursor-windows-mcp-spawn.md). User workaround is `%USERPROFILE%\.cursor\mcp.json` with absolute paths — not committed here.

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
PASS firms_hotspots kml region= usa_contiguous_and_hawaii bytes= 270743
tools: nws_forecast, nws_alerts, usgs_quakes, nhc_storms, jtwc_storms, swpc_snapshot, meteoalarm_alerts, firms_hotspots
protocolVersion: 2024-11-05
mode: core
PASS smoke
```

Austin nws_alerts count=0 is a live empty active set. Shape was OfficialAlertList.

## Tools
Core (8): nws_forecast, nws_alerts, usgs_quakes, nhc_storms, jtwc_storms, swpc_snapshot, meteoalarm_alerts, firms_hotspots
Optional (4): eonet_events, gdacs_events, gvp_weekly, open_meteo_forecast

## IDE note
Reload Window / Customize to see the plugin. Set `FIRMS_MAP_KEY` and optionally `WEATHER_OPTIONAL=1` in MCP env. This environment cannot prove the Customize UI click or Windows Cursor plugin spawn.
