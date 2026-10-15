# Privacy policy

**weather-web** is an unofficial third-party plugin. It is not affiliated with NOAA, NWS, USGS, NASA, JTWC, MeteoAlarm/EUMETNET, GDACS, Smithsonian GVP, or Open-Meteo.

## What this plugin does

The plugin runs on the installer's machine. It has no backend operated by the plugin author. When a tool is called, it sends HTTP requests from your machine directly to the public upstream source for that tool (listed in [TERMS.md](TERMS.md)).

## What is sent upstream

- Coordinates, place names, country codes, or date ranges you (or your agent, on your instruction) pass to a tool.
- An identifying User-Agent (`WeatherWebPlugin/<version>`, contact email) as the NWS API requires.
- Your NASA FIRMS `MAP_KEY`, only to `firms.modaps.eosdis.nasa.gov`, only when you set one.

## Credentials

- `FIRMS_MAP_KEY` is optional and supplied by you via the Cursor/Grok Bot Configure store, environment, or `$PLUGIN_DATA/config.json`.
- It stays on your machine, is never sent to the plugin author, and must not be committed to git.

## Data

- No analytics, telemetry, or tracking.
- Responses are cached briefly in memory only and discarded when the server exits.
- The plugin does not sell data or use your queries to train models.

Upstream services apply their own privacy policies to the requests your machine sends them.

## Contact

Contact: chucktastictime@gmail.com

Issues: https://github.com/TheAbsentTourist/weather-web/issues
