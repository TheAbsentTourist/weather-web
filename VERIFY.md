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
| `node --check server.mjs` | pending live re-run |
| `node scripts/mcp-path-test.mjs` | pending live re-run |
| Core smoke (`scripts/smoke.mjs`) | pending live re-run (same tools as 0.1.4) |
| `WEATHER_OPTIONAL=1` extended smoke | not required for this cwd/docs patch |
| FIRMS without key | `config_error` on csv; kml keyless (unchanged) |
| Shipped `mcp.json` | `node` + `["./server.mjs"]` + `cwd` `"./"`; no `${PLUGIN_ROOT}`; no `C:\Users` / `Program Files` |
| No EDR / USGS Water / GIS RSS tool | unchanged |

## mcp.json spawn shape

Public file stays portable. Cursor Windows host bugs (cwd = home, unexpanded `${PLUGIN_ROOT}`, `cwd: "${PLUGIN_ROOT}"` ENOENT) are in [docs/cursor-windows-mcp-spawn.md](docs/cursor-windows-mcp-spawn.md). User workaround is `%USERPROFILE%\.cursor\mcp.json` with absolute paths — not committed here.

## Tools
Core (8): nws_forecast, nws_alerts, usgs_quakes, nhc_storms, jtwc_storms, swpc_snapshot, meteoalarm_alerts, firms_hotspots
Optional (4): eonet_events, gdacs_events, gvp_weekly, open_meteo_forecast

## IDE note
Reload Window / Customize to see the plugin. Set `FIRMS_MAP_KEY` and optionally `WEATHER_OPTIONAL=1` in MCP env. This environment cannot prove the Customize UI click or Windows Cursor plugin spawn.
