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
| `node --check server.mjs` | pending live run |
| `node scripts/mcp-path-test.mjs` | pending live run |
| Core smoke (`scripts/smoke.mjs`) | pending live run |
| FIRMS without key | expect `config_error` on csv; kml keyless |
| `.cursor-plugin/plugin.json` | `FIRMS_MAP_KEY` + four `WEATHER_ENABLE_*`; **no** `WEATHER_OPTIONAL` in variables |
| Shipped `mcp.json` | `node` + `["./server.mjs"]` + `cwd` `"./"`; `${WEATHER_OPTIONAL}` kept for CLI/host |
| No EDR / USGS Water / GIS RSS tool | unchanged |

## Configure schema

Plugins → Configure is FIRMS MAP_KEY plus per-source toggles only. Master `WEATHER_OPTIONAL` is omitted from the UI schema; env / `$PLUGIN_DATA/config.json` / CLI still honor it.

## IDE note
Reload Window / Customize to see the plugin. Set `FIRMS_MAP_KEY` and per-source `WEATHER_ENABLE_*` under Plugins → Configure. This environment cannot prove the Configure UI click or Windows Cursor plugin spawn.
