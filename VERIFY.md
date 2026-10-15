# VERIFY — weather-web 0.1.12

Date: 2026-10-15 (America/New_York, EDT), 0.1.12 pre-submission pass

## Install
- Workspace: `/workspace/weather-hazards` (git clone of TheAbsentTourist/weather-web)
- Install: `~/.cursor/plugins/local/weather-web` (real directory via `cp -a`, not a symlink; `.git` excluded)
- Version: **0.1.12** in package.json, plugin.json, `.cursor-plugin/plugin.json`, server `serverInfo`, UA strings, README changelog link, CHANGELOG-0.1.12.md, smoke clientInfo, this file

## Review Remy fixes (0.1.12)
| Item | Fix |
|---|---|
| Root `plugin.json` undeclared `logo` fails agent-plugins.org 1.0.0 schema | Removed; root validates PASS; negative control (root + `logo`) rejected |
| Marketplace logotype needs a 1:1 logo with a background plate | `assets/logo-plate.png` 1024x1024 RGB (no alpha); `.cursor-plugin/plugin.json` `logo` points to it; `assets/logo.png` kept for README |
| Privacy / security docs (steam-web parity) | Added `PRIVACY.md`, `SECURITY.md`; linked from README (TERMS.md already present) |
| `package.json` metadata | Added `bugs` (issues URL + email), `author.url`, `#readme` homepage |
| Stale VERIFY / README changelog link | Refreshed this file; README links CHANGELOG-0.1.12.md |

## Checks
| Check | Result |
|---|---|
| `plugin.json` vs agent-plugins.org 1.0.0 plugin schema (workspace + installed) | PASS |
| `mcp.json` vs agent-plugins.org 1.0.0 mcp schema (workspace + installed) | PASS |
| Negative control: root `plugin.json` + `logo` | PASS (rejected) |
| `.cursor-plugin/plugin.json` vs documented Cursor field table (no published JSON schema): name format, semver, author.name, relative existing logo/mcpServers paths, allowed variable keywords, every `mcp.json` `${VAR}` declared | PASS (`displayName` is not in the doc table; kept, common in Cursor plugins) |
| Doc links (curl) | PASS except bot-blocked 403s (volcano.si.edu) and historical UA strings in CHANGELOG-0.1.2/0.1.3 naming the old repo; the `{country}` MeteoAlarm template is a placeholder |
| Secrets / personal paths in tracked files | PASS (none; only `C:\Users\<you>` examples) |
| `node --check server.mjs` (workspace + installed) | PASS |
| `node scripts/mcp-path-test.mjs` (workspace + installed) | PASS |
| Core live smoke `npm run smoke` (workspace + installed) | PASS (13 tool checks, 8 core tools, serverInfo 0.1.12) |
| Workspace vs installed MD5 | PASS (identical) |
| Plated logo raw URL after push (`https://raw.githubusercontent.com/TheAbsentTourist/weather-web/main/assets/logo-plate.png`) | PASS (HTTP 200, image/png, MD5 matches committed file) |
| `loadUserLocalPlugins` | SKIP (`@anysphere/cursor-plugins` not on npm) |
| Cursor Configure UI / Windows spawn | NOT PROVEN on this machine |

## Configure schema

Plugins → Configure is FIRMS MAP_KEY plus per-source `WEATHER_ENABLE_*` toggles. Master `WEATHER_OPTIONAL` is env / `$PLUGIN_DATA/config.json` / CLI only.
