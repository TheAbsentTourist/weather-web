# CHANGELOG — weather-web 0.1.6

Date: 2026-09-03

## Summary

Cursor **Plugins → Configure** for NASA FIRMS `MAP_KEY` and per-source optional toggles, matching steam-web. Dual manifest: root Agent `plugin.json` kept; Cursor `.cursor-plugin/plugin.json` added. No master `WEATHER_OPTIONAL` toggle in Configure. No invented FIRMS key. No marketplace submit.

## Global

- Version **0.1.6** (`package.json`, root `plugin.json`, `.cursor-plugin/plugin.json`, `serverInfo`, UA strings, smoke clientInfo, README, VERIFY, this file).
- Default User-Agent: `WeatherHazardsPlugin/0.1.6 (contact: chucktastictime@gmail.com)`.
- JTWC UA: `Mozilla/5.0 (compatible; WeatherHazardsPlugin/0.1.6; +https://github.com/TheAbsentTourist/weather-web)`.

## Plugins → Configure

- **`.cursor-plugin/plugin.json`:** Cursor Plugin manifest (`displayName` Weather Hazards). `mcpServers`: `"./mcp.json"`. `variables` JSON Schema (none required): `FIRMS_MAP_KEY` (string) plus per-source toggles `WEATHER_ENABLE_EONET` / `WEATHER_ENABLE_GDACS` / `WEATHER_ENABLE_GVP` / `WEATHER_ENABLE_OPEN_METEO` (`enum` `""` / `"1"`). **No** `WEATHER_OPTIONAL` in the schema so Configure does not show a master toggle. No logo (no assets). No secret values.
- **`config.example.json`:** empty placeholders (including `WEATHER_OPTIONAL` for CLI/host/`config.json`). Copy to `$PLUGIN_DATA/config.json`; do not commit a real MAP_KEY.
- **`server.mjs`:** load creds from `process.env` first, then `$PLUGIN_DATA/config.json` (steam-web helper). `requireFirmsKey` and optional enable flags (including `WEATHER_OPTIONAL` if set in env/`config.json`) use that helper. Empty key → existing `config_error` with FIRMS signup URL.
- **`mcp.json`:** unchanged portable spawn (`node` + `["./server.mjs"]` + `"cwd": "./"`). Keep `${WEATHER_OPTIONAL}` and other placeholders for CLI/host compatibility.
- **README:** set `FIRMS_MAP_KEY` via Plugins → Configure, env, or `$PLUGIN_DATA/config.json`. Do not paste keys into the repo.

## Tests

- `scripts/mcp-path-test.mjs`: assert `.cursor-plugin/plugin.json` declares `FIRMS_MAP_KEY` and the four `WEATHER_ENABLE_*` toggles; `WEATHER_OPTIONAL` stays in `mcp.json` env but is omitted from Configure `variables`.
- Smoke still expects FIRMS csv without a key → `config_error`.

## Not in 0.1.6

- Marketplace submit
- Making `FIRMS_MAP_KEY` required (would break NWS-only installs)
- A master `WEATHER_OPTIONAL` control in Plugins → Configure
- Removing `cwd` `"./"` from `mcp.json`
