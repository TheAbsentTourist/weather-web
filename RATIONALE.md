# RATIONALE — alternatives considered and rejected

## Organization: SOURCE_REGISTRY vs flat TOOLS + HANDLERS

**Chosen:** A single SOURCE_REGISTRY array. Each entry owns id, core/optional,
default confidence_tier, and a tools[] list with name, inputSchema, and run.
listTools() / callTool() derive from the registry after an enablement filter.

**Declined — flat TOOLS array + parallel HANDLERS map (steam-web style):** Works,
but duplicates source metadata (UA policy, optional gates, tier) across two structures
that can drift. For a multi-agency plugin, registry-per-source keeps gating and
attribution next to the handlers.

**Declined — one MCP tool per HTTP URL with raw passthrough:** Too chatty for agents;
forces the model to learn each agency JSON. We slim to domain shapes instead.

**Declined — single mega-tool get_hazards(lat,lon) that fans out to every API:**
Hides source choice, mixes confidence tiers, amplifies latency/failure coupling, and
makes optional-key errors ambiguous.

## Optional source gating

**Chosen:** Optional sources omitted from tools/list unless WEATHER_OPTIONAL=1 or
WEATHER_ENABLE_<SOURCE>=1. FIRMS stays listed (core) but fails closed with
config_error when FIRMS_MAP_KEY is missing.

**Declined — always register optional tools and error at call time only:** Pollutes
tool lists for users who only want NWS/USGS/NHC.

**Declined — inventing or embedding a demo FIRMS key:** Forbidden by grounding; keys
must be user-supplied via env placeholder in mcp.json.

## MeteoAlarm

**Chosen:** Per-country legacy Atom only; decline europe / all with a clear error.

**Declined — Europe-wide Atom:** Live probe returns 404.

**Declined — map UI fetch:** Fragile; prefer documented Atom feeds only.

## GDACS

**Chosen (optional):** Default to rss_24h.xml; opt-in use_search for SEARCH API.

**Declined — SEARCH as the only path:** Grounding notes SEARCH can be slow; live probe
hung past 30s.

## EONET

**Chosen:** Optional; strip/refuse earthquakes category.

**Declined — exposing EONET earthquakes:** Duplicates USGS with weaker quake semantics;
explicitly excluded by grounding.

## Exclusions

**Declined** USGS Water, NHC GIS RSS as separate tool, and treating overlays as
national alerts — per grounding. FIRMS and Open-Meteo use confidence_tier overlay.

## Open-Meteo

**Chosen:** Optional overlay forecast; TERMS mark non-commercial free tier.

**Declined — as a core replacement for NWS:** Not an official US forecast authority.

## Transport

**Chosen:** Zero-dep Node stdio MCP with Content-Length (+ LF fallback), same family as
steam-web — plug-and-play command node, args ["./server.mjs"].

**Declined — compiled TypeScript or package deps:** Conflicts with zero-dep install.

## Arena grafts

Base candidate-2. Grafted homepage/repository from candidate-1. Kept SOURCE_REGISTRY over flat TOOLS from candidates 1/3 (model-the-domain).

## 0.1.4 — unused API as flags, not new tools

**Chosen:** Fold leftover public endpoints into existing SOURCE_REGISTRY tools as optional args that default off. Delete SYNTHESIS.md rather than leave a stub.

**Declined — Pleistocene GVP gazetteer:** not sketched; Holocene lookup stays the catalog path.

**Declined — FIRMS missing_data without a key:** keyed only; kml stays the keyless core path.

## 0.1.3 — flags on existing tools vs new mega-tools

**Chosen:** Bugfixes + top-5 adds as modes/flags/mapper fields on SOURCE_REGISTRY tools
(jtwc_storms, nws_alerts, nws_forecast, usgs_quakes, nhc_storms, swpc_snapshot).

**Declined — new MCP tools** (nws_products, jtwc_advisories, gis RSS, swpc_events):
Explodes the tool list; agents already know the source tools. Laziness = extend existing tools.

**Declined — GVP mapping `<alert>` wrapper as the event:** Live CAP is one envelope + ~26
`<info>` children. Mapping the wrapper dropped 25 volcanoes.

**Declined — FIRMS Area DAY_RANGE 1–10:** Official Area API is 1..5. KML 7d is a different
endpoint and stays.

**Declined — sending GDACS `fromdatetime`:** Live SEARCH ignores it (100-cap dump). Bind
`fromDate`/`toDate` (aliases accepted).

**Declined — NHC GIS RSS (`gis-at/ep/cp.xml`) as a tool:** URLs already on CurrentStorms.json;
attach them. Do not fetch zip/kmz.

**Declined — dumping SWPC edited_events.json (963) or xrays-6-hour (716):** Summarize counts
+ recent flares; latest/peak x-ray sample.

**Declined — AFD `location=KMRX`:** NWS products list is empty for ICAO; CWA is `MRX`.
