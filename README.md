# weather-hazards

**Agent Plugin / MCP server** (v0.1.4) for weather and disaster hazard feeds.

This repository is **not a website**. It is a zero-dependency Node.js stdio MCP that agents (Cursor and other MCP hosts) can call for official and specialist hazard data.

| | |
|---|---|
| Runtime | Node.js ≥ 18 |
| Transport | stdio MCP (`node ./server.mjs`) |
| License | MIT |
| Repo | [github.com/TheAbsentTourist/weather-web](https://github.com/TheAbsentTourist/weather-web) |

---

## What it does

One plugin, several agencies — each as its own tool, not one mega-`get_hazards` call:

| Need | Tool | Authority |
|------|------|-----------|
| US forecast / observations / AFD / HWO | `nws_forecast` | NWS |
| US watches and warnings | `nws_alerts` | NWS |
| Earthquakes | `usgs_quakes` | USGS |
| Atlantic / East Pacific / Central Pacific storms | `nhc_storms` | NHC |
| West Pacific / Indian Ocean / Southern Hemisphere storms | `jtwc_storms` | JTWC |
| Space weather | `swpc_snapshot` | NOAA SWPC |
| European warnings | `meteoalarm_alerts` | MeteoAlarm |
| Fire hotspots | `firms_hotspots` | NASA FIRMS |

Optional (off by default): NASA EONET, GDACS, Smithsonian GVP, Open-Meteo.

New capability is added as **modes and flags on existing tools**. A new source only gets a new tool when it is a distinct upstream authority (that is why JTWC is not folded into NHC).

**Basin split:** `nhc_storms` for AL / EP / CP. `jtwc_storms` for WP / IO / SH (NIO). Do not use JTWC for East or Central Pacific.

---

## Install

Requires Node.js 18+. Copy or symlink the repo into the Cursor local plugins directory:

```bash
cp -R . ~/.cursor/plugins/local/weather-hazards
# or
ln -s "$(pwd)" ~/.cursor/plugins/local/weather-hazards
```

`mcp.json` already wires the stdio server:

```json
{
  "mcpServers": {
    "weather-hazards": {
      "type": "stdio",
      "command": "node",
      "args": ["./server.mjs"],
      "env": {
        "FIRMS_MAP_KEY": "${FIRMS_MAP_KEY}",
        "WEATHER_OPTIONAL": "${WEATHER_OPTIONAL}",
        "WEATHER_ENABLE_EONET": "${WEATHER_ENABLE_EONET}",
        "WEATHER_ENABLE_GDACS": "${WEATHER_ENABLE_GDACS}",
        "WEATHER_ENABLE_GVP": "${WEATHER_ENABLE_GVP}",
        "WEATHER_ENABLE_OPEN_METEO": "${WEATHER_ENABLE_OPEN_METEO}"
      }
    }
  }
}
```

Set those environment variables in the host / Cursor plugin config. Reload the IDE window after install.

### Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `FIRMS_MAP_KEY` | For FIRMS `csv`, `status`, `availability`, `missing_data` | NASA FIRMS MAP_KEY. **Never invent or hard-code a key.** |
| `WEATHER_OPTIONAL=1` | No | Enable every optional tool |
| `WEATHER_ENABLE_EONET=1` | No | Enable `eonet_events` only |
| `WEATHER_ENABLE_GDACS=1` | No | Enable `gdacs_events` only |
| `WEATHER_ENABLE_GVP=1` | No | Enable `gvp_weekly` only |
| `WEATHER_ENABLE_OPEN_METEO=1` | No | Enable `open_meteo_forecast` only |

FIRMS `kml` works without a key (regional footprint). The other FIRMS modes return `config_error` until `FIRMS_MAP_KEY` is set.

### User-Agent

Most fetches identify as:

```
WeatherHazardsPlugin/0.1.4 (contact: chucktastictime@gmail.com)
```

JTWC is behind CloudFront and often 403s a generic UA, so those fetches use a browser-like UA that still names the plugin:

```
Mozilla/5.0 (compatible; WeatherHazardsPlugin/0.1.4; +https://github.com/TheAbsentTourist/weather-web)
```

---

## Core tools

Always listed. No optional API keys except FIRMS CSV-family modes.

| Tool | What you get | Default | Tier |
|------|----------------|---------|------|
| `nws_forecast` | Periods, hourly, grid, observation(s), AFD, HWO | `product=periods` | official |
| `nws_alerts` | Point, area, or filtered alerts; `mode=types` lists event types | point query | official |
| `usgs_quakes` | Feed, event detail, PAGER fields, FDSN query | `feed=hour` | catalog |
| `nhc_storms` | Active AL/EP/CP storms; optional advisories and outlook | extras off | official |
| `jtwc_storms` | WP/IO/SH from `jtwc.rss` + `web.txt`; optional advisories, invests, TCW | — | specialist |
| `swpc_snapshot` | Scales plus optional indices, aurora, ICAO, events, X-rays, 3h Kp, flux | extras off | specialist |
| `meteoalarm_alerts` | Per-country Atom (slug or ISO alias); `format=cap` | `country` required | official |
| `firms_hotspots` | CSV / KML / status / availability / missing_data | `mode=csv` | overlay |

### Flags (core)

**`nws_forecast`** — `product`: `periods` | `hourly` | `grid` | `observation` | `observations` | `afd` | `hwo`. `history` applies on the observation path.

**`nws_alerts`** — point `lat` / `lon`, or `area`. Optional: `event`, `zone`, `status`, `severity`, `urgency`, `certainty`, `region`. `mode=types` lists types instead of live alerts.

**`usgs_quakes`** — `feed`: `hour` | `day` | `week` | `month` | `significant_*` | `4.5_*` | `2.5_*` | `1.0_*` | `query`. PAGER: `alert`, `mmi`, `cdi`, `felt`. Also `eventid`, `meta`. FDSN query: `endtime`, `maxmagnitude`, `updatedafter`, bbox, `types`.

**`nhc_storms`** — `include_advisories` (index-at / ep / cp.xml), `include_outlook` (gtwo.xml). Responses include discussion / cone / track URLs.

**`jtwc_storms`** — WP / IO / SH only (skips EPAC / CPAC). Advisories via `abpwweb.txt` / `abioweb.txt` path. Flags: `include_advisories`, `include_invests`, `include_tcw`.

**`swpc_snapshot`** — `include_indices`, `include_aurora`, `include_icao`, `include_events`, `include_xrays`, `include_kp_3h`, `include_flux`.

**`meteoalarm_alerts`** — country Atom slug or ISO alias. `format=cap` for CAP XML.

**`firms_hotspots`** — `mode`: `csv` | `kml` | `status` | `availability` | `missing_data`. CSV `days` 1–5. Optional `radius_km` / bbox.

---

## Optional tools

Hidden from `tools/list` until enabled with `WEATHER_OPTIONAL=1` or the matching `WEATHER_ENABLE_*` flag.

| Tool | What you get | Tier |
|------|----------------|------|
| `eonet_events` | Natural events (`json` or `geojson`). `id`, `mode=categories\|sources`, `days`, `bbox`, `source`, `include_layers`. Earthquakes are refused / stripped | catalog |
| `gdacs_events` | `rss_24h` \| `rss_full` \| `events4app` \| `search` (`fromDate`, `toDate`, `eventlist`, `pagenumber`, `pagesize`) | specialist |
| `gvp_weekly` | `weekly`: CAP `<info>` children + `limit` (specialist). `lookup`: Holocene WFS (catalog) | mixed |
| `open_meteo_forecast` | `forecast` \| `air_quality` \| `flood`. `name` geocodes; `hourly`. **Non-commercial free tier** | overlay |

### MeteoAlarm WebSub

This plugin does **not** expose a WebSub, EDR, or MQTT tool. Clients can subscribe themselves to:

`https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-{country}`

---

## Confidence tiers

Every hazard payload includes `confidence_tier`:

| Tier | Meaning |
|------|---------|
| `official` | National warning / forecast authority (NWS, NHC, MeteoAlarm country feed) |
| `specialist` | Authoritative but not a public warning service substitute (JTWC, SWPC, GVP weekly, GDACS) |
| `catalog` | Event inventory, not a warning (USGS feeds, EONET, GVP lookup) |
| `overlay` | Detection or model layer (FIRMS, Open-Meteo) |

Use official national warning channels for life-safety decisions. This plugin is unofficial and unaffiliated with the upstream agencies. See [TERMS.md](TERMS.md).

---

## Architecture

Handlers and schemas come from a single `SOURCE_REGISTRY` in `server.mjs` (source → tools → run). Enablement filters that table for `tools/list` and `tools/call`.

That keeps User-Agent policy, optional gates, and tier next to the handler. New work prefers a flag on an existing tool. A new registry entry is for a new upstream authority, not a new URL.

Outputs are slim domain shapes, not raw agency JSON:

`PointForecast` / `ForecastPeriod`, `GridpointForecast`, `Observation`, `NwsTextProduct`, `OfficialAlert`, `QuakeEvent`, `TropicalStorm`, `SpaceWeatherSnapshot`, `FireHotspot`, plus optional `NaturalEvent`, `ImpactAlert`, `Volcano`.

Design notes: [RATIONALE.md](RATIONALE.md).

---

## Smoke tests

Default geographic point: Austin, TX ≈ `30.2672, -97.7431`.

```bash
node --check server.mjs
node scripts/smoke.mjs
WEATHER_OPTIONAL=1 node scripts/smoke.mjs
```

Verification snapshot: [VERIFY.md](VERIFY.md). Changes in this version: [CHANGELOG-0.1.4.md](CHANGELOG-0.1.4.md).

---

## Related docs

| File | Contents |
|------|----------|
| [TERMS.md](TERMS.md) | Attribution, source table, secrets policy, no-warranty |
| [RATIONALE.md](RATIONALE.md) | Why registry-per-source, no mega-tool, flag-not-tool |
| [VERIFY.md](VERIFY.md) | Last smoke results |
| [CHANGELOG-0.1.4.md](CHANGELOG-0.1.4.md) | 0.1.4 risk fixes and folded flags |
| [LICENSE](LICENSE) | MIT |
