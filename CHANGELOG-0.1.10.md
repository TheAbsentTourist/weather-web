# CHANGELOG — weather-web 0.1.10

Date: 2026-09-04 UTC

## Summary

Package / plugin identity rename: `weather-hazards` → `weather-web` so Cursor/Agent plugin ids match GitHub repo `TheAbsentTourist/weather-web`. Patch bump only. No tool renames. No new defaults. No invented FIRMS key.

## Global

- Version **0.1.10** (`package.json`, root `plugin.json`, `.cursor-plugin/plugin.json`, `serverInfo`, UA strings, smoke clientInfo, README, VERIFY, this file).
- Default User-Agent: `WeatherWebPlugin/0.1.10 (contact: chucktastictime@gmail.com)`.
- JTWC UA: `Mozilla/5.0 (compatible; WeatherWebPlugin/0.1.10; +https://github.com/TheAbsentTourist/weather-web)`.

## Identity

- **`package.json` `name`:** `weather-web`
- **Root `plugin.json` `name`:** `weather-web`
- **`.cursor-plugin/plugin.json`:** `name` `weather-web`, `displayName` **Weather Web**
- **`mcp.json`:** server key `mcpServers.weather-web` (was `weather-hazards`)
- **`server.mjs`:** `SERVER_INFO.name` `weather-web`; TTY / header strings use the new package id
- **Skill:** `skills/weather-web/SKILL.md` (was `skills/weather-hazards/`); frontmatter `name: weather-web`
- **Install path docs:** `~/.cursor/plugins/local/weather-web` and Windows `%USERPROFILE%\.cursor\plugins\local\weather-web`
- **Windows spawn docs:** observed host id `plugin-weather-web-weather-web`

## Tests

- `scripts/mcp-path-test.mjs` looks up `mcpServers["weather-web"]`
- Smoke `clientInfo.name` `weather-web-smoke`; asserts `serverInfo.name === "weather-web"` and version `0.1.10`

## Unchanged

- Tool names (`nws_forecast`, `usgs_quakes`, …)
- Domain copy still describes weather + disaster hazards
- Default test point Austin, TX 30.2672, -97.7431
- Shipped `mcp.json` spawn: `node` + `["./server.mjs"]` + `"cwd": "./"`
- Configure variables: `FIRMS_MAP_KEY` + four `WEATHER_ENABLE_*` (no master `WEATHER_OPTIONAL` in the UI schema)
