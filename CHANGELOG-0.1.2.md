# CHANGELOG — weather-hazards 0.1.2

Date: 2026-09-03 America/New_York

## Summary

Add **JTWC** as a new **core** SOURCE_REGISTRY source with tool `jtwc_storms` — sibling to `nhc_storms`, not folded into NHC. Basin split: NHC = AL/EP/CP; JTWC = WP/IO/SH (NIO).

## Global

- Version **0.1.2** (`package.json`, `plugin.json`, `serverInfo`, UA string, README, VERIFY, this file).
- Default User-Agent: `WeatherHazardsPlugin/0.1.2 (contact: chucktastictime@gmail.com)`.
- JTWC-only browser-like UA: `Mozilla/5.0 (compatible; WeatherHazardsPlugin/0.1.2; +https://github.com/TheAbsentTourist/weather-hazards)` (CloudFront on metoc.navy.mil often 403s the generic plugin UA).

## JTWC (`jtwc_storms`)

- Feed: `https://www.metoc.navy.mil/jtwc/rss/jtwc.rss` (never the dead `metoc.ndbc.noaa.gov` host).
- Per-storm `*web.txt` linked from RSS HTML CDATA; optional `.tcw` URL attached when present.
- Basin filter: only ATCF `wp*` / `io*` / `sh*`. Skip Central/Eastern Pacific RSS items that duplicate NHC.
- Shape: `TropicalStorm` / `TropicalStormList` with `confidence_tier: "specialist"`, `source: "jtwc"`.
- Parses web.txt for name/id/classification, MAX SUSTAINED WINDS, position (`28.0N 128.9E` or compact tenths), movement, MINIMUM CENTRAL PRESSURE when present.
- Empty basins → `count: 0`, not an error.

## Docs / smoke

- TERMS: JTWC products intended for USG; cite JTWC; not a WMO RSMC substitute.
- README + SKILL.md when-to-use basin split.
- `scripts/smoke.mjs`: core call to `jtwc_storms` (PASS if HTTP works even when count 0).

## Not in 0.1.2

- MeteoAlarm EDR / MQTT / WebSub tool
- USGS Water, NHC GIS RSS as its own tool, EONET earthquakes, Europe-wide Atom
- Full `.tcw` / JMV parsing (URL attach only)
