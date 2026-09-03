# weather-hazards

Live weather and disaster feeds for Cursor (and other MCP hosts): US forecasts and alerts, earthquakes, tropical storms, space weather, European warnings, and fire hotspots.

This repo is a **plugin**, not a website. Agents call it as a stdio MCP server (`server.mjs`). Zero npm dependencies. Node.js 18+. MIT.

Not affiliated with NOAA, USGS, NASA, or any other agency. Do not use this instead of official warning channels for life-safety decisions. See [TERMS.md](TERMS.md).

**Repo:** [github.com/TheAbsentTourist/weather-web](https://github.com/TheAbsentTourist/weather-web) · **Author:** [TheAbsentTourist](https://github.com/TheAbsentTourist) · chucktastictime@gmail.com

---

## What you get

Each agency is its own tool (not one giant `get_hazards` call).

| You want | Tool | Source |
|----------|------|--------|
| US forecast, observations, AFD, HWO | `nws_forecast` | NWS |
| US watches and warnings | `nws_alerts` | NWS |
| Earthquakes | `usgs_quakes` | USGS |
| Atlantic / East Pacific / Central Pacific storms | `nhc_storms` | NHC |
| West Pacific / Indian Ocean / Southern Hemisphere storms | `jtwc_storms` | JTWC |
| Space weather | `swpc_snapshot` | NOAA SWPC |
| European warnings | `meteoalarm_alerts` | MeteoAlarm |
| Fire hotspots | `firms_hotspots` | NASA FIRMS |

Optional (off until you enable them): NASA EONET, GDACS, Smithsonian GVP, Open-Meteo.

Use **NHC** for AL / EP / CP. Use **JTWC** for WP / IO / SH. Do not ask JTWC for East or Central Pacific.

Most tools work with no API key. FIRMS CSV-family modes need a NASA FIRMS MAP_KEY. These can be obtained at https://firms.modaps.eosdis.nasa.gov/api/area/

---

## Install (everyone)

1. Install **Node.js 18+** from [nodejs.org](https://nodejs.org) if you do not already have it.
2. Put this repo in Cursor’s local plugins folder as a **real directory** (copy or clone — do not symlink from outside that folder):

```text
Windows:      %USERPROFILE%\.cursor\plugins\local\weather-hazards
macOS/Linux:  ~/.cursor/plugins/local/weather-hazards
```

```bash
git clone https://github.com/TheAbsentTourist/weather-web.git ~/.cursor/plugins/local/weather-hazards
```

On Windows PowerShell, that is:

```powershell
git clone https://github.com/TheAbsentTourist/weather-web.git $env:USERPROFILE\.cursor\plugins\local\weather-hazards
```

3. Confirm `server.mjs` exists in that folder.
4. Reload Cursor: Command Palette → **Developer: Reload Window**.
5. Check Customize / Plugins for **weather-hazards**.

Teams/Enterprise: local plugins may be blocked until an admin allows them.

The plugin’s own `mcp.json` is portable on purpose:

```json
{
  "command": "node",
  "args": ["./server.mjs"],
  "cwd": "./"
}
```

That is the correct Agent Plugins shape. **We cannot ship your machine’s Node path in the repo.** Other MCP hosts that honor plugin-root cwd and a normal `PATH` can use that as-is.

---

## Windows Cursor: it often will not start until you add a local workaround

### Why (this is a Cursor bug, not a missing file in the plugin)

On Windows, Cursor’s **plugin** MCP launcher currently:

- Starts the server with the **wrong working directory** (often your home folder), so `./server.mjs` becomes `C:\Users\<you>\server.mjs` and Node reports `Cannot find module '...\server.mjs'`.
- Sometimes cannot find `node` at all (`spawn node ENOENT`) because the MCP process does not inherit a PATH that includes Node.
- Does **not** expand `${PLUGIN_ROOT}` in plugin MCP args, so we cannot put a portable absolute plugin path in shipped `mcp.json`.

We tried plugin-relative `cwd`, wrappers, and placeholders. None of those work until Cursor starts plugin MCP with **plugin root as cwd**, **system PATH** (or a documented way to resolve `node`), and **placeholder expansion** for `${PLUGIN_ROOT}`. Until then, each Windows Cursor user (or their agent) must point MCP at **this machine’s** `node.exe` and **this install’s** `server.mjs`.

macOS/Linux: try the portable config first. If it fails the same way, use the same idea (full path to `node` + full path to `server.mjs`).

### How to tell it failed

MCP logs (Output → MCP) look like:

- `Cannot find module 'C:\Users\<you>\server.mjs'`
- `spawn node ENOENT`
- `The system cannot find the path specified.`
- `MCP error -32000: Connection closed`

Success: the `weather-hazards` server stays connected and tools like `nws_forecast` / `usgs_quakes` appear.

### Fix for a human (or for Cursor / another agent)

Do **all** of this on the user’s machine. Do **not** commit the resulting paths to git.

**A. Find Node**

Typical Windows install: `C:\Program Files\nodejs\node.exe`

If that file is missing, run in a terminal:

```powershell
where.exe node
```

Use the `.exe` path that prints. If nothing prints, install Node from nodejs.org, then **fully quit Cursor** (all Cursor processes) and reopen — Reload Window is not enough after a Node install.

**B. Find this plugin’s `server.mjs`**

It must be:

```text
%USERPROFILE%\.cursor\plugins\local\weather-hazards\server.mjs
```

Example: `C:\Users\Ada\.cursor\plugins\local\weather-hazards\server.mjs`

If the file is not there, clone/copy the repo to that path first (Install, above).

**C. Write or merge `%USERPROFILE%\.cursor\mcp.json`**

Path: `C:\Users\<USERNAME>\.cursor\mcp.json`

If the file **does not exist**, create it:

```json
{
  "mcpServers": {
    "weather-hazards": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "C:\\Users\\USERNAME\\.cursor\\plugins\\local\\weather-hazards\\server.mjs"
      ]
    }
  }
}
```

Replace `USERNAME` and the Node path with the real values from A and B. In JSON, backslashes must be doubled (`\\`).

If `mcp.json` **already exists**, keep every other server. Only add or replace the `"weather-hazards"` entry inside `"mcpServers"`. Do not delete `steam-web` or anything else.

Optional env (same names as Plugins → Configure) can live under that server’s `"env"`:

```json
"env": {
  "FIRMS_MAP_KEY": "${FIRMS_MAP_KEY}",
  "WEATHER_OPTIONAL": "${WEATHER_OPTIONAL}",
  "WEATHER_ENABLE_EONET": "${WEATHER_ENABLE_EONET}",
  "WEATHER_ENABLE_GDACS": "${WEATHER_ENABLE_GDACS}",
  "WEATHER_ENABLE_GVP": "${WEATHER_ENABLE_GVP}",
  "WEATHER_ENABLE_OPEN_METEO": "${WEATHER_ENABLE_OPEN_METEO}"
}
```

**D. Also patch the plugin `mcp.json` if the failing server id is `plugin-weather-hazards-weather-hazards`**

Cursor often launches the **plugin** copy, not the user file. If user `mcp.json` is correct but logs still show `plugin-weather-hazards-weather-hazards` and `C:\Users\<you>\server.mjs`, edit:

```text
%USERPROFILE%\.cursor\plugins\local\weather-hazards\mcp.json
```

Set `command` to the full `node.exe` path and `args` to a one-element array with the full `server.mjs` path (same as C). Keep the `"env"` block. This file is local-only; a later git pull will overwrite it, so re-apply after updates.

**E. Reload**

Fully quit and reopen Cursor, or **Developer: Reload Window**. Confirm MCP connects.

---

## Agent install checklist

If you are an AI assistant installing this for a user:

1. Clone or extract to `%USERPROFILE%\.cursor\plugins\local\weather-hazards` (Windows) or `~/.cursor/plugins/local/weather-hazards` (macOS/Linux). Folder name must be `weather-hazards`.
2. Verify `server.mjs` exists. Run `node --check server.mjs` if Node is on PATH.
3. On Windows Cursor, do **not** assume the shipped plugin `mcp.json` will work. Resolve `node.exe` and `server.mjs` with real filesystem paths, then merge `weather-hazards` into `~/.cursor/mcp.json` as in **Fix** above. If logs still use identifier `plugin-weather-hazards-weather-hazards`, apply the same absolute paths in the plugin’s `mcp.json`.
4. Never write another user’s paths into the git repo. Never invent `FIRMS_MAP_KEY`.
5. Tell the user to reload Cursor and to set FIRMS / optional flags only if they need those tools.

---

## Environment

Set `FIRMS_MAP_KEY` via **Plugins → Configure** (Cursor), the host environment, or `$PLUGIN_DATA/config.json` copied from `config.example.json`. Do not paste keys into the repo.

Optional tools stay off until you flip **Enable optional tools** in Plugins → Configure (or set `WEATHER_OPTIONAL=1`). Per-source `WEATHER_ENABLE_*` toggles are finer control.

| Variable | Required | Purpose |
|----------|----------|---------|
| `FIRMS_MAP_KEY` | FIRMS `csv`, `status`, `availability`, `missing_data` | NASA FIRMS MAP_KEY |
| `WEATHER_OPTIONAL=1` | No | Turn on every optional tool (Configure / env / `config.json`) |
| `WEATHER_ENABLE_EONET=1` | No | `eonet_events` only |
| `WEATHER_ENABLE_GDACS=1` | No | `gdacs_events` only |
| `WEATHER_ENABLE_GVP=1` | No | `gvp_weekly` only |
| `WEATHER_ENABLE_OPEN_METEO=1` | No | `open_meteo_forecast` only |

FIRMS `kml` works without a key. Other FIRMS modes return `config_error` until a key is set.

---

## Core tools

Always listed. No extra keys except FIRMS CSV-family modes.

| Tool | What you get | Default | Tier |
|------|----------------|---------|------|
| `nws_forecast` | Periods, hourly, grid, observation(s), AFD, HWO | `product=periods` | official |
| `nws_alerts` | Point, area, or filtered alerts; `mode=types` lists event types | point query | official |
| `usgs_quakes` | Feed, event detail, PAGER, FDSN query | `feed=hour` | catalog |
| `nhc_storms` | Active AL/EP/CP storms; optional advisories and outlook | extras off | official |
| `jtwc_storms` | WP/IO/SH from RSS + `web.txt`; optional advisories, invests, TCW | — | specialist |
| `swpc_snapshot` | Scales plus optional indices, aurora, ICAO, events, X-rays, 3h Kp, flux | extras off | specialist |
| `meteoalarm_alerts` | Per-country Atom; `format=cap` | `country` required | official |
| `firms_hotspots` | CSV / KML / status / availability / missing_data | `mode=csv` | overlay |

**Useful flags**

- `nws_forecast` — `product`: `periods` \| `hourly` \| `grid` \| `observation` \| `observations` \| `afd` \| `hwo`
- `nws_alerts` — `lat`/`lon` or `area`; optional `event`, `zone`, `status`, `severity`; `mode=types`
- `usgs_quakes` — `feed` hour/day/week/month/significant/magnitude bands/`query`; PAGER fields; `eventid`
- `nhc_storms` — `include_advisories`, `include_outlook`
- `jtwc_storms` — `include_advisories`, `include_invests`, `include_tcw` (WP/IO/SH only)
- `swpc_snapshot` — `include_indices`, `include_aurora`, `include_icao`, `include_events`, `include_xrays`, `include_kp_3h`, `include_flux`
- `meteoalarm_alerts` — country slug or ISO alias
- `firms_hotspots` — `mode` csv/kml/status/availability/missing_data; CSV `days` 1–5

---

## Optional tools

Hidden until you flip **Enable optional tools** in Plugins → Configure (or set `WEATHER_OPTIONAL=1`) or the matching `WEATHER_ENABLE_*` flag.

| Tool | What you get | Tier |
|------|----------------|------|
| `eonet_events` | Natural events (`json` or `geojson`). Earthquakes are refused / stripped | catalog |
| `gdacs_events` | RSS and search | specialist |
| `gvp_weekly` | Weekly CAP + Holocene lookup | mixed |
| `open_meteo_forecast` | Forecast / air quality / flood. **Non-commercial free tier** | overlay |

This plugin does not implement MeteoAlarm WebSub. Clients can subscribe themselves to `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-{country}`.

---

## Confidence tiers

Every payload includes `confidence_tier`:

| Tier | Meaning |
|------|---------|
| `official` | National warning / forecast authority |
| `specialist` | Authoritative, not a public-warning substitute |
| `catalog` | Event inventory, not a warning |
| `overlay` | Detection or model layer |

---

## Smoke tests (from the plugin folder)

Default point: Austin, TX ≈ `30.2672, -97.7431`.

```bash
node --check server.mjs
node scripts/mcp-path-test.mjs
node scripts/smoke.mjs
WEATHER_OPTIONAL=1 node scripts/smoke.mjs
```

---

## Help

Issues: https://github.com/TheAbsentTourist/weather-web/issues  

Community project — best-effort support, no SLA. Do not paste API keys or Steam/FIRMS secrets into issues.

More detail: [TERMS.md](TERMS.md), [RATIONALE.md](RATIONALE.md), [VERIFY.md](VERIFY.md), [CHANGELOG-0.1.6.md](CHANGELOG-0.1.6.md), [docs/cursor-windows-mcp-spawn.md](docs/cursor-windows-mcp-spawn.md).
