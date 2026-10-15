# VERIFY — weather-web 0.1.11

Date: 2026-10-15 (America/New_York, EDT)

## Install
- Workspace: `/workspace/weather-hazards` (git clone of TheAbsentTourist/weather-web)
- Install: `~/.cursor/plugins/local/weather-web` (real directory via `cp -a`, not a symlink; `.git` excluded)
- Version: **0.1.11** in package.json, plugin.json, `.cursor-plugin/plugin.json`, server `serverInfo`, UA strings, README changelog link, CHANGELOG-0.1.11.md, smoke clientInfo, this file

## Review Remy fixes (0.1.11)
| Item | Fix |
|---|---|
| Root `plugin.json` undeclared `logo` fails agent-plugins.org 1.0.0 schema | Removed; root validates PASS; negative control (root + `logo`) rejected |
| Marketplace logotype needs a 1:1 logo with a background plate | `assets/logo-plate.png` 1024x1024 RGB (no alpha); `.cursor-plugin/plugin.json` `logo` points to it; `assets/logo.png` kept for README |
| Privacy / security docs (steam-web parity) | Added `PRIVACY.md`, `SECURITY.md`; linked from README (TERMS.md already present) |
| `package.json` metadata | Added `bugs` (issues URL + email), `author.url`, `#readme` homepage |
| Stale VERIFY / README changelog link | Refreshed this file; README links CHANGELOG-0.1.11.md |

## Checks
| Check | Result |
|---|---|
| `plugin.json` vs agent-plugins.org 1.0.0 plugin schema (workspace + installed) | PASS |
| `mcp.json` vs agent-plugins.org 1.0.0 mcp schema (workspace + installed) | PASS |
| Negative control: root `plugin.json` + `logo` | PASS (rejected) |
| `node --check server.mjs` (workspace + installed) | PASS |
| `node scripts/mcp-path-test.mjs` (workspace + installed) | PASS |
| Core live smoke `npm run smoke` (workspace + installed) | PASS (13 tool checks, 8 core tools, serverInfo 0.1.11) |
| Workspace vs installed MD5 | PASS (identical) |
| Plated logo raw URL after push | see commit / report |
| `loadUserLocalPlugins` | SKIP (`@anysphere/cursor-plugins` not on npm) |
| Cursor Configure UI / Windows spawn | NOT PROVEN on this machine |

## Configure schema

Plugins → Configure is FIRMS MAP_KEY plus per-source `WEATHER_ENABLE_*` toggles. Master `WEATHER_OPTIONAL` is env / `$PLUGIN_DATA/config.json` / CLI only.
