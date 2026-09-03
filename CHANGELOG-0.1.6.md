# CHANGELOG — weather-hazards 0.1.6

Date: 2026-09-03

## Summary

Cursor **Plugins → Configure** for NASA FIRMS `MAP_KEY`, a master **Enable optional tools** toggle (`WEATHER_OPTIONAL`), and per-source `WEATHER_ENABLE_*` finer control, matching steam-web. Dual manifest: root Agent `plugin.json` kept; Cursor `.cursor-plugin/plugin.json` added. No invented FIRMS key. No marketplace submit.

## Global

- Version **0.1.6** (`package.json`, root `plugin.json`, `.cursor-plugin/plugin.json`, `serverInfo`, UA strings, smoke clientInfo, README, VERIFY, this file).
- Default User-Agent: `WeatherHazardsPlugin/0.1.6 (contact: chucktastictime@gmail.com)`.
- JTWC UA: `Mozilla/5.0 (compatible; WeatherHazardsPlugin/0.1.6; +https://github.com/TheAbsentTourist/weather-web)`.

## Plugins → Configure

- **`.cursor-plugin/plugin.json`:** Cursor Plugin manifest (`displayName` Weather Hazards). `mcpServers`: `"./mcp.json"`. `variables` JSON Schema (none required): `FIRMS_MAP_KEY` (string); primary `WEATHER_OPTIONAL` toggle (`enum` `""` / `"1"`, title **Enable optional tools (EONET, GDACS, GVP, Open-Meteo)**); per-source finer toggles `WEATHER_ENABLE_EONET` / `WEATHER_ENABLE_GDACS` / `WEATHER_ENABLE_GVP` / `WEATHER_ENABLE_OPEN_METEO` (same enum, titles like **Enable EONET only**). String enum (steam-web style) so `${VAR}` substitutes into mcp.json env. No logo (no assets). No secret values.
- **`config.example.json`:** empty placeholders. Copy to `$PLUGIN_DATA/config.json`; do not commit a real MAP_KEY.
- **`server.mjs`:** load creds from `process.env` first, then `$PLUGIN_DATA/config.json` (steam-web helper). `requireFirmsKey` and optional flags use that helper. Boolean `true` / `"1"` / `"true"` count as enabled. Empty key → existing `config_error` with FIRMS signup URL.
- **`mcp.json`:** unchanged portable spawn (`node` + `["./server.mjs"]` + `"cwd": "./"`) and `${WEATHER_OPTIONAL}` / `${WEATHER_ENABLE_*}` placeholders.
- **README:** optional tools stay off until the Configure toggle (or `WEATHER_OPTIONAL=1`).

## Tests

- `scripts/mcp-path-test.mjs`: assert `.cursor-plugin/plugin.json` declares `FIRMS_MAP_KEY`, master `WEATHER_OPTIONAL`, and the four `WEATHER_ENABLE_*` toggles; every `${VAR}` in `mcp.json` env appears in `variables.properties`.
- Smoke still expects FIRMS csv without a key → `config_error`.

## Not in 0.1.6

- Marketplace submit
- Making `FIRMS_MAP_KEY` or optional toggles required (would break NWS-only installs)
- Removing `cwd` `"./"` from `mcp.json`
