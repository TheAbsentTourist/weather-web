# VERIFY — weather-web 0.1.10

Date: 2026-09-04 UTC

## Install
- Workspace: `/workspace`
- Version: **0.1.10** in package.json, plugin.json, `.cursor-plugin/plugin.json`, server initialize `serverInfo`, UA strings, README, CHANGELOG-0.1.10.md, smoke clientInfo, this file
- Package / plugin / MCP server id: `weather-web` (renamed from `weather-hazards`)
- Default test point: Austin, TX 30.2672, -97.7431
- Path intent: `~/.cursor/plugins/local/weather-web` (real directory, not a symlink from outside that folder)

## Checks
| Check | Result |
|---|---|
| `node --check server.mjs` | pending live run |
| `node scripts/mcp-path-test.mjs` | pending live run |
| Core smoke (`scripts/smoke.mjs`) | pending live run |
| FIRMS without key | expect `config_error` on csv; kml keyless |
| `.cursor-plugin/plugin.json` | `name` `weather-web`, `displayName` Weather Web; `FIRMS_MAP_KEY` + four `WEATHER_ENABLE_*`; **no** `WEATHER_OPTIONAL` in variables |
| Shipped `mcp.json` | server key `weather-web`; `node` + `["./server.mjs"]` + `cwd` `"./"`; `${WEATHER_OPTIONAL}` kept for CLI/host |
| Skill | `skills/weather-web/SKILL.md` frontmatter `name: weather-web` |
| No leftover package-id `weather-hazards` in manifests / mcp / serverInfo / smoke / install docs | pending grep |
| No EDR / USGS Water / GIS RSS tool | unchanged |

## Configure schema

Plugins → Configure is FIRMS MAP_KEY plus per-source toggles only. Master `WEATHER_OPTIONAL` is omitted from the UI schema; env / `$PLUGIN_DATA/config.json` / CLI still honor it.

## IDE note
Reload Window / Customize to see the plugin. Set `FIRMS_MAP_KEY` and per-source `WEATHER_ENABLE_*` under Plugins → Configure. This environment cannot prove the Configure UI click or Windows Cursor plugin spawn.
