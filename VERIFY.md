# VERIFY — weather-hazards 0.1.4

Date: 2026-09-03 UTC (~18:51)

## Install
- Workspace: `/workspace`
- Version: **0.1.4** in package.json, plugin.json, server initialize `serverInfo`, UA strings, README, CHANGELOG-0.1.4.md, smoke clientInfo, this file
- Default test point: Austin, TX 30.2672, -97.7431

## Checks
| Check | Result |
|---|---|
| `node --check server.mjs` | **PASS** |
| Core smoke (`scripts/smoke.mjs`) | **PASS** — see lines below |
| `WEATHER_OPTIONAL=1` extended smoke | **PASS** — see lines below |
| FIRMS without key | `config_error` on csv; kml keyless **PASS** |
| No EDR / USGS Water / GIS RSS tool | unchanged |

## Core smoke PASS lines (live, not invented)

```
PASS firms_hotspots days schema CSV 1–5 (default 1); also maps kml date_span
PASS nws_forecast Austin, TX Slight Chance Showers And Thunderstorms
PASS usgs_quakes count= 5
PASS nhc_storms count= 3 Karina,Marie,Lowell
PASS jtwc_storms count= 2 Saudel,Krovanh
PASS nws_forecast hourly 3 2026-09-03T13:00:00-05:00
PASS nws_forecast afd EWX KEWX chars= 6883
PASS jtwc include_invests count= 3 97W
PASS jtwc include_advisories count= 2
PASS nws_alerts count= 0 point= 30.2672,-97.7431
PASS swpc_snapshot scales current,forecast_1,forecast_2
PASS meteoalarm_alerts country= germany count= 5
PASS firms_hotspots kml region= usa_contiguous_and_hawaii bytes= 206210
tools: nws_forecast, nws_alerts, usgs_quakes, nhc_storms, jtwc_storms, swpc_snapshot, meteoalarm_alerts, firms_hotspots
protocolVersion: 2024-11-05
mode: core
PASS smoke
```

Austin nws_alerts count=0 is a live empty active set. Shape was OfficialAlertList.

## Extended smoke PASS lines (live, not invented)

```
PASS nws_alerts event filter count= 0 query.event= Flood Warning
PASS usgs_quakes significant_week count= 2 alert=yellow
PASS swpc_snapshot include_indices kp= 0P
PASS swpc_snapshot include_events count= 974 types= XRA,RSP,FLA,LPS,RBR,EPL,DSF,RNS,BSL
PASS open_meteo_forecast name= Austin, Texas, United States current= 36.5 hourly= 48
PASS open_meteo_forecast air_quality us_aqi= 38
PASS gdacs_events mode= rss_full count= 5
PASS eonet_events count= 5
PASS gvp_weekly format= rss count= 5 total= 26
PASS firms_hotspots config_error (no invented key)
PASS nhc_storms include_advisories count= 22
PASS nhc_storms include_outlook count= 3
PASS nws_alerts types count= 111
PASS swpc_snapshot include_kp_3h Kp= 1.67
mode: extended
PASS smoke
```

GVP this run used the RSS fallback (CAP HTTP failed). `limit=5` sliced 26 items to count=5.

## Tools
Core (8): nws_forecast, nws_alerts, usgs_quakes, nhc_storms, jtwc_storms, swpc_snapshot, meteoalarm_alerts, firms_hotspots
Optional (4): eonet_events, gdacs_events, gvp_weekly, open_meteo_forecast

## IDE note
Reload Window / Customize to see the plugin. Set `FIRMS_MAP_KEY` and optionally `WEATHER_OPTIONAL=1` in MCP env. This environment cannot prove the Customize UI click.
