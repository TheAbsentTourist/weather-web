---
name: weather-hazards
description: >
  Use when the user asks about weather forecasts, watches/warnings/advisories,
  earthquakes, tropical cyclones/hurricanes/typhoons (NHC + JTWC), space weather, European MeteoAlarm
  warnings, wildfire hotspots (NASA FIRMS), or optional natural-event catalogs
  (EONET, GDACS, GVP volcanoes, Open-Meteo). Call the weather-hazards MCP tools.
  Never invent observations, alerts, or API keys. Prefer official sources;
  respect confidence_tier on every hazard payload.
---

# Weather + Disaster Hazards

Call only the weather-hazards MCP tools. Return tool JSON as-is; do not invent
forecasts, quakes, storms, alerts, or a FIRMS MAP_KEY. Prefer flags/modes on the
existing tools rather than asking for a new tool name.

## When to use which tool

| Need | Tool | Flags | Tier |
|------|------|-------|------|
| US point forecast (12h periods) | nws_forecast | `product=periods` (default) | official |
| US hourly forecast | nws_forecast | `product=hourly` | official |
| US gridpoint forecast | nws_forecast | `product=grid` | official |
| Latest station observation | nws_forecast | `product=observation` | official |
| Station observation history | nws_forecast | `product=observations` or `history=true` | official |
| Area Forecast Discussion / HWO | nws_forecast | `product=afd` or `hwo` (CWA location=EWX not Kxxx) | official |
| US active alerts at a point/state/zone | nws_alerts | `event`, `zone`, `status`, `severity`, `urgency`, `certainty`, `region` optional | official |
| NWS alert event type list | nws_alerts | `mode=types` | official |
| Earthquakes (feed, significant, 4.5/2.5/1.0, radius, detail, FDSN meta; PAGER alert/mmi/cdi/felt) | usgs_quakes | `feed`, `eventid`, `meta`; query `endtime`/`maxmagnitude`/`updatedafter`/bbox/`types` | catalog |
| Active Atlantic/E. Pacific/C. Pacific tropical cyclones (AL/EP/CP) | nhc_storms | `include_advisories` basin RSS; `include_outlook` gtwo.xml | official |
| Active West Pacific / Indian Ocean / Southern Hemisphere (WP/IO/SH) | jtwc_storms | `include_advisories` ABPW/ABIO (URL/path); `include_invests`; `include_tcw`; skips EPAC/CPAC | specialist |
| Geomagnetic / radiation / radio scales + alerts | swpc_snapshot | `include_indices`, `include_aurora`, `include_icao`, `include_events`, `include_xrays`, `include_kp_3h`, `include_flux` | specialist |
| European country warnings | meteoalarm_alerts (per-country slug or DE/NL) | `format=cap` optional; no WebSub tool | official |
| Satellite fire hotspots | firms_hotspots | `mode=csv` (needs key), `days` 1–5, km `radius_km` | overlay |
| Keyless regional fire footprint | firms_hotspots | `mode=kml` or `format=kml` | overlay |
| FIRMS key status / date availability / missing dates | firms_hotspots | `mode=status` or `availability` or `missing_data` (need MAP_KEY) | overlay |
| Optional global natural events | eonet_events | `format=json\|geojson`, `include_layers`, `id`, `days`, `bbox`, `source`; `mode=categories\|sources` | catalog |
| Optional disaster impact alerts | gdacs_events | `mode=rss_24h\|rss_full\|events4app\|search` (`fromDate`/`toDate`/`eventlist`/`pagenumber`) | specialist |
| Optional weekly volcano activity | gvp_weekly | `mode=weekly` (CAP `<info>` per volcano, `limit`) | specialist |
| Optional Holocene volcano lookup | gvp_weekly | `mode=lookup` + `name`/`country` | catalog |
| Optional non-commercial forecast overlay | open_meteo_forecast | `mode=forecast` (default); `name` geocodes; `hourly` | overlay |
| Optional air quality / flood overlay | open_meteo_forecast | `mode=air_quality` or `flood` | overlay |

Optional tools appear only when WEATHER_OPTIONAL=1 or the matching
WEATHER_ENABLE_* flag is set.

## confidence_tier

Every hazard-shaped payload includes confidence_tier:

- official — national/official warning or forecast authority (NWS, NHC, MeteoAlarm)
- specialist — domain specialist agency product (JTWC, SWPC, GDACS, GVP)
- overlay — derived/satellite/model overlay, not a national alert (FIRMS, Open-Meteo)
- catalog — event catalog / instrument network (USGS, EONET)

Never present an overlay or catalog item as a national warning.

## Defaults and constraints

- Default test point: Austin, TX approx 30.2672, -97.7431.
- Identifying User-Agent is set on every fetch.
- MeteoAlarm: per-country Atom only (germany, france, united-kingdom, ...).
  Do not call a Europe-wide feed (404). Do not expect a WebSub tool — clients
  may WebSub the Atom URLs themselves.
- FIRMS: if FIRMS_MAP_KEY is missing, csv/status/availability report config_error;
  never invent a key. kml mode is keyless.
- EONET earthquakes are excluded — use usgs_quakes.
- Use `jtwc_storms` for WP/IO/SH; `nhc_storms` for AL/EP/CP. Do not present JTWC as a WMO RSMC substitute.
- Do not use USGS Water, NHC GIS RSS as a separate tool, MeteoAlarm EDR/MQTT, or
  pretend FIRMS/Open-Meteo are official alerts.

## Attribution

Cite the upstream agency in answers. See TERMS.md.
