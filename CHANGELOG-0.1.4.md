# CHANGELOG — weather-web 0.1.4

Date: 2026-09-03

## Summary

Risk fixes first, then unused public API folded as **flags on existing SOURCE_REGISTRY tools**. No new mega-tools. No invented FIRMS key. Deleted stale SYNTHESIS.md.

## Global

- Version **0.1.4** (`package.json`, `plugin.json`, `serverInfo`, UA strings, README, VERIFY, this file).
- Default User-Agent: `WeatherHazardsPlugin/0.1.4 (contact: chucktastictime@gmail.com)`.
- JTWC UA: `Mozilla/5.0 (compatible; WeatherHazardsPlugin/0.1.4; +https://github.com/TheAbsentTourist/weather-web)`.
- Default test point remains Austin, TX 30.2672, -97.7431.

## Phase A — risk fixes

- **Deleted SYNTHESIS.md.** It was leftover 0.1.0 arena notes. No stub.
- **Core smoke** now live-calls `nws_alerts` (Austin), `swpc_snapshot` (scales), `meteoalarm_alerts` (DE), and `firms_hotspots` `format=kml` (keyless). Existing core smokes kept.
- **JTWC STWA/ABPW:** advisory items are detected from `abpwweb.txt` / `abioweb.txt` URL and path (plus description/link fields), not RSS title match alone. Hardcoded ABPW/ABIO fallback remains. Empty basins stay count 0.
- **GVP weekly `limit`:** CAP `<info>` children (and RSS fallback) are sliced to `limit` / `maxFeatures`. Lookup mode uses `confidence_tier=catalog`. Weekly CAP stays specialist.
- **VERIFY.md** rewritten as a 0.1.4 snapshot after smoke.

## Phase B — unused API as flags (default off)

| Tool | Added | Deferred |
|------|--------|----------|
| open_meteo_forecast | `mode=air_quality` and `mode=flood` (public, no key) | paid / customer- prefix |
| meteoalarm_alerts | `format=cap` / `type=application/cap+xml`; more ISO aliases | EDR / MQTT / WebSub tool |
| usgs_quakes | FDSN `endtime`, `maxmagnitude`, `updatedafter`, bbox, `types` | USGS Water |
| swpc_snapshot | `include_kp_3h` (official 3h Kp), `include_flux`; scales default unchanged | — |
| jtwc_storms | `include_tcw` slim-parses linked `.tcw` | — |
| nws_alerts | `mode=types` / `list_types`; `certainty` | — |
| nws_forecast | `product=observations` or `history=true` on the stations path | — |
| eonet_events | `id`, `mode=categories\|sources`, `days`, `bbox`, `source` | EONET earthquakes |
| gdacs_events | SEARCH `eventlist`, `pagenumber`, `pagesize` | — |
| firms_hotspots | `mode=missing_data` (MAP_KEY only) | inventing a key |
| gvp_weekly | lookup stays Holocene WFS | Pleistocene gazetteer (not sketched) |

## Docs / smoke

- README states this is an Agent Plugin / MCP, not a website.
- `scripts/smoke.mjs` clientInfo 0.1.4; core live-calls listed above.

## Not in 0.1.4

- MeteoAlarm EDR / MQTT / WebSub tool
- USGS Water, NHC GIS RSS as its own tool, EONET earthquakes as primary
- Google Weather APIs, paid APIs as MCP tools
- Invented FIRMS MAP_KEY
- GVP Pleistocene gazetteer
