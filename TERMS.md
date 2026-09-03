# Terms and attribution — weather-hazards

This plugin is unofficial software. It is **not** affiliated with, endorsed by, or
approved by NOAA, NWS, NHC, JTWC, USGS, NASA, MeteoAlarm/EUMETNET, Smithsonian GVP,
GDACS, or Open-Meteo.

## Upstream sources

| Source | Use | Notes |
|--------|-----|-------|
| [api.weather.gov](https://www.weather.gov/documentation/services-web-api) | Forecast, hourly, grid, observation, alerts | Identifying User-Agent on every fetch; follow NWS API terms |
| [USGS Earthquake](https://earthquake.usgs.gov/) | Feeds, detail, FDSN query/count/catalogs/contributors | Public domain US Government work; cite USGS |
| [NHC CurrentStorms.json](https://www.nhc.noaa.gov/CurrentStorms.json) | Active storms | NOAA/NHC product |
| [NHC RSS](https://www.nhc.noaa.gov/aboutrss.shtml) | Optional advisories on nhc_storms | index-at.xml / index-ep.xml / index-cp.xml (not GIS RSS) |
| [JTWC](https://www.metoc.navy.mil/jtwc/jtwc.html) | WP/IO/SH tropical cyclone warnings via jtwc.rss + web.txt; optional ABPW/ABIO Significant Tropical Weather Advisories and INVEST parse | Products intended for **US Government** use; cite JTWC; **not** a WMO RSMC substitute — consult the national meteorological service. ABPW/ABIO carry the same USG disclaimer. Browser-like UA required (CloudFront). Never use dead `metoc.ndbc.noaa.gov`. EPAC/CPAC deferred to NHC |
| [NOAA SWPC](https://services.swpc.noaa.gov/) | Scales, alerts, Kp, 10cm flux, ovation, ICAO | Space weather specialist products |
| [MeteoAlarm](https://feeds.meteoalarm.org/) | Per-country Atom | European warning aggregation; per-country feeds only. Clients may WebSub those Atom URLs themselves — this plugin does not implement WebSub, EDR, or MQTT |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/) | Fire hotspots CSV + data availability; keyless KML footprints | MAP_KEY required except kml mode; satellite detection overlay |
| [NASA EONET](https://eonet.gsfc.nasa.gov/) | Optional events (json/geojson) | Catalog; not a warning service; earthquakes excluded |
| [GDACS](https://www.gdacs.org/) | Optional impact alerts | rss_24h / rss_full / events4app / SEARCH (`fromDate`/`toDate`) |
| [Smithsonian GVP](https://volcano.si.edu/) | Optional weekly CAP + WFS lookup | Specialist report |
| [Open-Meteo](https://open-meteo.com/) | Optional forecast + geocoding | **Free non-commercial** tier; commercial use needs a separate license |

## Secrets

- `FIRMS_MAP_KEY` must be supplied by the user/host via environment / `${FIRMS_MAP_KEY}` in `mcp.json`.
- This plugin never ships, invents, or hard-codes a FIRMS key.

## No warranty

Data may be delayed, incomplete, or unavailable. For life-safety decisions, use
official national warning channels and local emergency instructions. The plugin
is provided "as is" without warranty of any kind.
