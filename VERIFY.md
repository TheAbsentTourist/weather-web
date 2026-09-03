# VERIFY — weather-hazards 0.1.3 (local install)

Date: 2026-09-03 America/New_York (~14:15–14:17 ET)

## Install
- Path: `~/.cursor/plugins/local/weather-hazards` (real directory, not symlink)
- Workspace: `/workspace/weather-hazards`
- Version: **0.1.3** in package.json, plugin.json, server initialize `serverInfo`, UA strings, README, CHANGELOG-0.1.3.md, this file

## Checks
| Check | Result |
|---|---|
| `node --check server.mjs` | **PASS** |
| Core smoke (`scripts/smoke.mjs`) | **PASS** — NWS forecast Austin; USGS hour count=5; NHC Karina/Marie/Lowell; JTWC Saudel,Krovanh count=2; hourly 3 periods; **AFD for Austin CWA (from /points)**; **jtwc include_invests 97W count=3**; FIRMS schema 1–5 |
| `WEATHER_OPTIONAL=1` extended smoke | **PASS** — GVP CAP **count=26**; usgs significant_week count=3 `alert` field present; swpc include_events count=972; nhc include_outlook count=3; firms config_error |
| Manual jtwc `include_invests` | **PASS** — INVEST **97W** (23 kt, 1005 mb, 15.8N 140.3E, genesis MEDIUM) |
| Manual nws_forecast `product=afd` Austin (office from /points) | **PASS** — office from /points `cwa` (Austin → EWX; use CWA not Kxxx) |
| Manual usgs `significant_week` | **PASS** — PAGER `alert`/`mmi`/`cdi`/`felt` (yellow / green / null) |
| Manual nhc `include_outlook` | **PASS** — gtwo.xml 3 items |
| Manual swpc `include_events` + `include_xrays` | **PASS** — summarized 972 events; xrays sample_count=716 but latest/peak only |
| Copy to `~/.cursor/plugins/local/weather-hazards` | **PASS** (real dir) |
| FIRMS without key | unchanged — `config_error`; no invented MAP_KEY |
| No EDR / USGS Water / GIS RSS tool | unchanged |

## Bugfix evidence (0.1.3)
| Item | Result |
|---|---|
| GVP CAP | **PASS** — live WeeklyVolcanoCAP.xml maps **26** `<info>` children (Ambae, Karangetang, …); envelope `sent=2026-08-27T03:30:31-04:00` |
| FIRMS CSV | **PASS** — `clamp(days, 1, 5)`; schema "CSV 1–5"; KML 7d untouched |
| GDACS SEARCH | **PASS** — aliases `fromdatetime`/`todatetime` sent as `fromDate`/`toDate`; `search_url=...SEARCH?alertlevel=Orange%3BRed&fromDate=2026-08-27&toDate=2026-09-03`; count=**8** (not 100-cap dump) |

## Tools
Core (8): nws_forecast, nws_alerts, usgs_quakes, nhc_storms, jtwc_storms, swpc_snapshot, meteoalarm_alerts, firms_hotspots  
Optional (4): eonet_events, gdacs_events, gvp_weekly, open_meteo_forecast  

## IDE note
Reload Window / Customize to see the plugin. Set `FIRMS_MAP_KEY` and optionally `WEATHER_OPTIONAL=1` in MCP env. This environment cannot prove the Customize UI click.
