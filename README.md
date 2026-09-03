# weather-hazards

Agent Plugin (v0.1.3) — zero-dependency stdio MCP for weather and disaster hazard feeds.

Extensions land as **modes/flags on existing SOURCE_REGISTRY tools** when possible.
New **sources** (e.g. JTWC) get their own SOURCE_REGISTRY entry and tool name.

## Install

```bash
cp -R . ~/.cursor/plugins/local/weather-hazards
```

Or symlink. Set optional env vars in the host / Cursor plugin config:

| Variable | Purpose |
|----------|---------|
| FIRMS_MAP_KEY | NASA FIRMS MAP_KEY (required for firms csv/status/availability; **never invent**) |
| WEATHER_OPTIONAL=1 | Enable all optional tools |
| WEATHER_ENABLE_EONET=1 | Enable eonet_events only |
| WEATHER_ENABLE_GDACS=1 | Enable gdacs_events only |
| WEATHER_ENABLE_GVP=1 | Enable gvp_weekly only |
| WEATHER_ENABLE_OPEN_METEO=1 | Enable open_meteo_forecast only |

Default User-Agent on most fetches: `WeatherHazardsPlugin/0.1.3 (contact: chucktastictime@gmail.com)`.
**JTWC** fetches use a browser-like UA that still identifies the plugin (CloudFront often 403s the generic UA):  
`Mozilla/5.0 (compatible; WeatherHazardsPlugin/0.1.3; +https://github.com/TheAbsentTourist/weather-hazards)`.

## Core tools (no optional keys)

| Tool | Flags / modes | Default | Tier |
|------|----------------|---------|------|
| nws_forecast | `product` = periods \| hourly \| grid \| observation \| afd \| hwo | periods | official |
| nws_alerts | point `lat`/`lon`, `area`, optional `event`, `zone`, `status`, `severity`, `urgency`, `region` | point default | official |
| usgs_quakes | `feed` hour\|day\|week\|month\|significant_*\|4.5_*\|2.5_*\|1.0_*\|query; PAGER `alert`/`mmi`/`cdi`/`felt`; `eventid`; `meta` | hour | catalog |
| nhc_storms | `include_advisories` (index-at/ep/cp.xml); `include_outlook` (gtwo.xml); discussion/cone/track URLs | false | official |
| jtwc_storms | WP/IO/SH from jtwc.rss + web.txt; `include_advisories` ABPW/ABIO; `include_invests`; skips EPAC/CPAC | — | specialist |
| swpc_snapshot | `include_indices`, `include_aurora`, `include_icao`, `include_events`, `include_xrays` | all extra false | specialist |
| meteoalarm_alerts | per-country Atom slug | required `country` | official |
| firms_hotspots | `mode` csv \| kml \| status \| availability; csv `days` 1–5; km `radius_km` bbox | csv | overlay |

**Basin split:** use `nhc_storms` for AL/EP/CP; use `jtwc_storms` for WP/IO/SH (NIO). Do not fold JTWC into NHC.

FIRMS `csv` / `status` / `availability` return `config_error` until `FIRMS_MAP_KEY` is set. `kml` is a keyless regional footprint.

## Optional tools

| Tool | Flags / modes | Tier |
|------|----------------|------|
| eonet_events | `format` json\|geojson; `include_layers`; earthquakes refused/stripped | catalog |
| gdacs_events | `mode` rss_24h \| rss_full \| events4app \| search (`fromDate`/`toDate` on SEARCH) | specialist |
| gvp_weekly | `mode` weekly (CAP `<info>` children) \| lookup (WFS Holocene_Volcanoes by `name`/`country`) | specialist |
| open_meteo_forecast | `name` geocodes first; `hourly`; current always when available. **Non-commercial** | overlay |

## MeteoAlarm WebSub

This plugin does **not** expose a MeteoAlarm WebSub tool. Clients may subscribe themselves to the per-country Atom URLs (`https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-{country}`).

## Architecture

Handlers and tool schemas are driven by a SOURCE_REGISTRY table in server.mjs
(source to tools to run), not a separate flat TOOLS / HANDLERS pair. Enablement
filters the registry when answering tools/list and tools/call. New capability is
added via tool `mode` / flag parameters rather than exploding tool count — except
when a distinct upstream authority (JTWC) needs its own source + tool.

## Domain shapes

Outputs encode: PointForecast / ForecastPeriod, GridpointForecast, Observation,
NwsTextProduct, OfficialAlert, QuakeEvent, TropicalStorm, SpaceWeatherSnapshot, FireHotspot,
plus optional NaturalEvent, ImpactAlert, Volcano. Hazard payloads include
confidence_tier: official | specialist | overlay | catalog.

## Smoke

```bash
node --check server.mjs
node scripts/smoke.mjs
WEATHER_OPTIONAL=1 node scripts/smoke.mjs
```

Default geographic test point: Austin, TX approx 30.2672, -97.7431.

See TERMS.md, RATIONALE.md, VERIFY.md, and CHANGELOG-0.1.3.md.
