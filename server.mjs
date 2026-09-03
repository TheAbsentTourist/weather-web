#!/usr/bin/env node
/**
 * weather-hazards — zero-dep stdio MCP
 * Organization: SOURCE_REGISTRY drives tool schemas + handlers (not a flat TOOLS array).
 * Core sources work without keys. Optional sources gated by WEATHER_OPTIONAL=1 or WEATHER_ENABLE_*.
 * FIRMS always registered; missing FIRMS_MAP_KEY → clear config error (never invent a key).
 * Credentials: process.env, then $PLUGIN_DATA/config.json.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "weather-hazards", version: "0.1.6" };
const TIMEOUT_MS = 25_000;
const UA = "WeatherHazardsPlugin/0.1.6 (contact: chucktastictime@gmail.com)";
const NWS_UA = UA;
/** CloudFront on metoc.navy.mil often 403s the generic plugin UA — JTWC fetches use a browser-like UA. */
const JTWC_UA =
  "Mozilla/5.0 (compatible; WeatherHazardsPlugin/0.1.6; +https://github.com/TheAbsentTourist/weather-web)";
const JTWC_RSS = "https://www.metoc.navy.mil/jtwc/rss/jtwc.rss";
const JTWC_ABPW = "https://www.metoc.navy.mil/jtwc/products/abpwweb.txt";
const JTWC_ABIO = "https://www.metoc.navy.mil/jtwc/products/abioweb.txt";
const DEFAULT_LAT = 30.2672;
const DEFAULT_LON = -97.7431;
const AURORA_MAX_CHARS = 12_000;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function httpGet(url, { headers = {}, accept = "*/*", as = "text", timeout = TIMEOUT_MS } = {}) {
  const ctrl = AbortSignal.timeout(timeout);
  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Accept: accept, "User-Agent": UA, ...headers },
      signal: ctrl,
      redirect: "follow",
    });
  } catch (err) {
    return { ok: false, status: 0, error: err?.message || "network_error", text: "", json: null, headers: null };
  }
  const text = await res.text();
  let json = null;
  if (as === "json" || (text && /^\s*[\[{]/.test(text))) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return {
    ok: res.ok,
    status: res.status,
    text,
    json,
    headers: res.headers,
    contentType: res.headers?.get?.("content-type") || "",
    url: res.url || url,
    bytes: Buffer.byteLength(text),
  };
}

function nwsHeaders() {
  return { Accept: "application/geo+json, application/ld+json, application/json" };
}

function okPayload(payload) {
  return { isError: false, payload };
}

function errPayload(error, message, extra = {}) {
  return { isError: true, payload: { error, message, ...extra } };
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function present(v) {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function isoFromMs(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return null;
  return new Date(Number(ms)).toISOString();
}

function loadFileConfig() {
  const dir = process.env.PLUGIN_DATA;
  if (!dir) return {};
  try {
    const parsed = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Env wins; otherwise $PLUGIN_DATA/config.json. Never invent a MAP_KEY. */
function cred(name) {
  if (process.env[name]) return String(process.env[name]);
  const fromFile = loadFileConfig()[name];
  if (fromFile === true) return "1";
  if (fromFile === false) return "";
  return fromFile ? String(fromFile) : "";
}

function envFlag(name) {
  const raw = cred(name);
  if (raw === true) return true;
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function optionalEnabled(sourceId) {
  if (envFlag("WEATHER_OPTIONAL")) return true;
  return envFlag(`WEATHER_ENABLE_${String(sourceId).toUpperCase()}`);
}

function boolArg(v, defaultVal = false) {
  if (v === undefined || v === null || v === "") return defaultVal;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return defaultVal;
}

function qty(v) {
  if (v == null) return null;
  if (typeof v === "object" && "value" in v) return v.value ?? null;
  return v;
}

function bboxFromPoint(lat, lon, radius_km) {
  const r = clamp(num(radius_km, 100), 1, 2000);
  const dLat = r / 111.32;
  const cosLat = Math.cos((Number(lat) * Math.PI) / 180);
  const dLon = r / (111.32 * Math.max(0.05, Math.abs(cosLat)));
  return {
    west: clamp(Number(lon) - dLon, -180, 180),
    south: clamp(Number(lat) - dLat, -90, 90),
    east: clamp(Number(lon) + dLon, -180, 180),
    north: clamp(Number(lat) + dLat, -90, 90),
    radius_km: r,
  };
}

function xmlTags(block, tag) {
  const out = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  let m;
  while ((m = re.exec(String(block)))) out.push(decodeXml(m[1].trim()));
  return out;
}

function slimQuantitative(layer, limit) {
  if (!layer || typeof layer !== "object") return null;
  const values = Array.isArray(layer.values) ? layer.values : [];
  return {
    uom: layer.uom ?? null,
    values: values.slice(0, limit).map((v) => ({
      validTime: v?.validTime ?? null,
      value: v?.value ?? null,
    })),
    total: values.length,
    truncated: values.length > limit,
  };
}

function summarizeOvation(json) {
  if (!json || typeof json !== "object") return { truncated: true, note: "ovation empty" };
  const coords = json.coordinates;
  if (!Array.isArray(coords)) {
    const s = JSON.stringify(json);
    if (s.length <= AURORA_MAX_CHARS) return json;
    return { truncated: true, bytes: s.length, keys: Object.keys(json) };
  }
  let max = -Infinity;
  let maxPt = null;
  const highs = [];
  for (const c of coords) {
    const a = Number(c?.[2]);
    if (!Number.isFinite(a)) continue;
    if (a > max) {
      max = a;
      maxPt = { lon: c[0], lat: c[1], aurora: a };
    }
    if (a >= 15) highs.push({ lon: c[0], lat: c[1], aurora: a });
  }
  highs.sort((a, b) => b.aurora - a.aurora);
  return {
    observation_time: json["Observation Time"] ?? json.observation_time ?? null,
    forecast_time: json["Forecast Time"] ?? json.forecast_time ?? null,
    data_format: json["Data Format"] ?? "[lon,lat,aurora]",
    coordinate_count: coords.length,
    max_aurora: Number.isFinite(max) ? max : null,
    max_point: maxPt,
    high_aurora_samples: highs.slice(0, 25),
    truncated: true,
    note: "Ovation grid summarized; full coordinate array omitted (often ~900KB).",
  };
}

function firmsRegionFromPoint(lat, lon) {
  const la = Number(lat);
  const lo = Number(lon);
  if (la >= 51 && lo >= -170 && lo <= -52) {
    if (la >= 54 && lo <= -129) return "alaska";
    return "canada";
  }
  if (la >= 18 && la < 25 && lo >= -161 && lo <= -154) return "usa_contiguous_and_hawaii";
  if (la >= 24 && la <= 50 && lo >= -125 && lo <= -66) return "usa_contiguous_and_hawaii";
  if (la >= 7 && la < 33 && lo >= -118 && lo <= -77 && la < 24.5) return "central_america";
  if (la < 15 && lo >= -92 && lo <= -30) return "south_america";
  if (la >= 35 && lo >= -11 && lo <= 40) return "europe";
  if (la >= 0 && la < 35 && lo >= -20 && lo <= 52) return "northern_and_central_africa";
  if (la < 0 && lo >= -20 && lo <= 55) return "southern_africa";
  if (la >= -50 && la <= -10 && lo >= 110 && lo <= 180) return "australia_newzealand";
  if (la >= -10 && la <= 28 && lo >= 95 && lo <= 155) return "southeast_asia";
  if (la >= 5 && la <= 40 && lo >= 60 && lo <= 100) return "south_asia";
  if (la >= 35 && lo >= 40) return "russia_asia";
  if (la >= 7 && la < 24 && lo >= -118 && lo <= -77) return "central_america";
  return "usa_contiguous_and_hawaii";
}

function firmsKmlSensor(satellite) {
  const s = String(satellite || "VIIRS_SNPP_NRT").toLowerCase();
  if (s.includes("noaa-21") || s.includes("noaa21") || s.includes("viirs_noaa21")) return "noaa-21-viirs-c2";
  if (s.includes("noaa-20") || s.includes("noaa20") || s.includes("viirs_noaa20")) return "noaa-20-viirs-c2";
  if (s.includes("landsat")) return "landsat";
  if (s.includes("modis") || s === "c6.1" || s === "c61") return "c6.1";
  if (s.includes("suomi") || s.includes("snpp") || s.includes("npp")) return "suomi-npp-viirs-c2";
  if (["c6.1", "landsat", "suomi-npp-viirs-c2", "noaa-20-viirs-c2", "noaa-21-viirs-c2"].includes(s)) return s;
  return "suomi-npp-viirs-c2";
}

function firmsDateSpan(days, explicit) {
  if (present(explicit)) return String(explicit);
  const d = num(days, 1);
  if (d >= 7) return "7d";
  if (d >= 3) return "72h";
  if (d >= 2) return "48h";
  return "24h";
}

function requireFirmsKey() {
  const key = String(cred("FIRMS_MAP_KEY") || "").trim();
  if (!key) {
    return {
      error: errPayload(
        "config_error",
        "FIRMS_MAP_KEY is not set. Obtain a free MAP_KEY from https://firms.modaps.eosdis.nasa.gov/api/ and set FIRMS_MAP_KEY in the host environment or $PLUGIN_DATA/config.json. This plugin never invents or embeds a key.",
      ),
    };
  }
  return { key };
}

function mapGdacsFeature(f) {
  if (f?.properties) {
    return toImpactAlert({
      ...f.properties,
      lat: f.geometry?.coordinates?.[1],
      lon: f.geometry?.coordinates?.[0],
      id: f.properties.eventid ?? f.id,
    });
  }
  return toImpactAlert(f);
}

function parseGdacsRss(xml) {
  return rssItems(xml).map((item) => {
    const title = xmlText(item, "title");
    const link = xmlText(item, "link");
    const description = xmlText(item, "description");
    const pubDate = xmlText(item, "pubDate");
    const guid = xmlText(item, "guid");
    const lat = xmlText(item, "geo:lat") || xmlText(item, "georss:point")?.split(/\s+/)[0];
    const lon = xmlText(item, "geo:long") || xmlText(item, "georss:point")?.split(/\s+/)[1];
    const level = xmlText(item, "gdacs:alertlevel") || xmlText(item, "gdacs:episodealertlevel");
    const eventtype = xmlText(item, "gdacs:eventtype");
    const eventid = xmlText(item, "gdacs:eventid");
    return toImpactAlert({
      id: eventid || guid,
      eventType: eventtype,
      name: title,
      alertLevel: level,
      fromDate: pubDate,
      lat,
      lon,
      url: link,
      description,
    });
  });
}

function eonetIsQuake(cats) {
  return (cats ?? []).some((c) => /earthquake/i.test(c?.id || c?.title || String(c || "")));
}

// ---------------------------------------------------------------------------
// Domain shapes (slim mappers)
// ---------------------------------------------------------------------------

/** @returns {object} ForecastPeriod */
function toForecastPeriod(p) {
  return {
    number: p.number ?? null,
    name: p.name ?? null,
    startTime: p.startTime ?? null,
    endTime: p.endTime ?? null,
    isDaytime: Boolean(p.isDaytime),
    temperature: p.temperature ?? null,
    temperatureUnit: p.temperatureUnit ?? null,
    precipitationProbability:
      p.probabilityOfPrecipitation?.value ?? p.precip_probability ?? null,
    windSpeed: p.windSpeed ?? p.wind_speed ?? null,
    windDirection: p.windDirection ?? p.wind_direction ?? null,
    shortForecast: p.shortForecast ?? p.weather_code_label ?? null,
    detailedForecast: p.detailedForecast ?? null,
  };
}

/** @returns {object} PointForecast */
function toPointForecast({ lat, lon, place, timezone, periods, source, confidence_tier, extra = {} }) {
  return {
    type: "PointForecast",
    confidence_tier,
    source,
    lat,
    lon,
    place: place ?? null,
    timezone: timezone ?? null,
    periods: (periods ?? []).map(toForecastPeriod),
    ...extra,
  };
}

/** @returns {object} OfficialAlert */
function toOfficialAlert({
  id,
  event,
  headline,
  severity,
  urgency,
  certainty,
  areaDesc,
  onset,
  ends,
  sent,
  description,
  instruction,
  url,
  source,
  confidence_tier,
  geometry = null,
  extra = {},
}) {
  return {
    type: "OfficialAlert",
    confidence_tier,
    source,
    id: id ?? null,
    event: event ?? null,
    headline: headline ?? null,
    severity: severity ?? null,
    urgency: urgency ?? null,
    certainty: certainty ?? null,
    areaDesc: areaDesc ?? null,
    onset: onset ?? null,
    ends: ends ?? null,
    sent: sent ?? null,
    description: description ? String(description).slice(0, 4000) : null,
    instruction: instruction ? String(instruction).slice(0, 2000) : null,
    url: url ?? null,
    geometry,
    ...extra,
  };
}

/** @returns {object} QuakeEvent */
function toQuakeEvent(feature) {
  const p = feature?.properties ?? {};
  const c = feature?.geometry?.coordinates ?? [];
  return {
    type: "QuakeEvent",
    confidence_tier: "catalog",
    source: "usgs",
    id: feature?.id ?? p.code ?? null,
    mag: p.mag ?? null,
    place: p.place ?? null,
    time: isoFromMs(p.time),
    updated: isoFromMs(p.updated),
    url: p.url ?? null,
    status: p.status ?? null,
    tsunami: p.tsunami ?? null,
    sig: p.sig ?? null,
    alert: Object.prototype.hasOwnProperty.call(p, "alert") ? p.alert : null,
    mmi: Object.prototype.hasOwnProperty.call(p, "mmi") ? p.mmi : null,
    cdi: Object.prototype.hasOwnProperty.call(p, "cdi") ? p.cdi : null,
    felt: Object.prototype.hasOwnProperty.call(p, "felt") ? p.felt : null,
    lon: c[0] ?? null,
    lat: c[1] ?? null,
    depth_km: c[2] ?? null,
  };
}

/** @returns {object} TropicalStorm */
function toTropicalStorm(s) {
  return {
    type: "TropicalStorm",
    confidence_tier: "official",
    source: "nhc",
    id: s.id ?? null,
    name: s.name ?? null,
    classification: s.classification ?? null,
    intensity_kt: present(s.intensity) ? Number(s.intensity) : null,
    pressure_mb: present(s.pressure) ? Number(s.pressure) : null,
    lat: s.latitudeNumeric ?? null,
    lon: s.longitudeNumeric ?? null,
    movementDir: s.movementDir ?? null,
    movementSpeed_kt: s.movementSpeed ?? null,
    lastUpdate: s.lastUpdate ?? null,
    publicAdvisoryUrl: s.publicAdvisory?.url ?? null,
    forecastAdvisoryUrl: s.forecastAdvisory?.url ?? null,
    forecastDiscussionUrl: s.forecastDiscussion?.url ?? null,
    forecastGraphicsUrl: s.forecastGraphics?.url ?? null,
    windSpeedProbabilitiesUrl: s.windSpeedProbabilities?.url ?? null,
    trackConeKmz: s.trackCone?.kmzFile ?? null,
    forecastTrackKmz: s.forecastTrack?.kmzFile ?? null,
    bestTrackKmz: s.bestTrackGIS?.kmzFile ?? null,
  };
}

/** @returns {object} SpaceWeatherSnapshot */
function toSpaceWeatherSnapshot({ scales, alerts }) {
  return {
    type: "SpaceWeatherSnapshot",
    confidence_tier: "specialist",
    source: "swpc",
    scales: scales ?? null,
    alerts: (alerts ?? []).map((a) => ({
      product_id: a.product_id ?? null,
      issue_datetime: a.issue_datetime ?? null,
      message: a.message ? String(a.message).slice(0, 1500) : null,
    })),
  };
}

/** @returns {object} FireHotspot */
function toFireHotspot(row) {
  return {
    type: "FireHotspot",
    confidence_tier: "overlay",
    source: "firms",
    lat: num(row.latitude, null),
    lon: num(row.longitude, null),
    brightness: num(row.bright_ti4 ?? row.brightness, null),
    frp: num(row.frp, null),
    confidence: row.confidence ?? null,
    acq_date: row.acq_date ?? null,
    acq_time: row.acq_time ?? null,
    satellite: row.satellite ?? null,
    instrument: row.instrument ?? null,
    daynight: row.daynight ?? null,
  };
}

/** @returns {object} NaturalEvent */
function toNaturalEvent(e) {
  const cats = (e.categories ?? []).map((c) => c.id || c.title).filter(Boolean);
  const geo = e.geometry?.[0];
  const coords = geo?.coordinates;
  let lon = null;
  let lat = null;
  if (Array.isArray(coords)) {
    if (typeof coords[0] === "number") {
      lon = coords[0];
      lat = coords[1];
    } else if (Array.isArray(coords[0]) && typeof coords[0][0] === "number") {
      lon = coords[0][0];
      lat = coords[0][1];
    }
  }
  return {
    type: "NaturalEvent",
    confidence_tier: "catalog",
    source: "eonet",
    id: e.id ?? null,
    title: e.title ?? null,
    categories: cats,
    link: e.link ?? null,
    date: geo?.date ?? null,
    lat,
    lon,
  };
}

/** @returns {object} ImpactAlert */
function toImpactAlert(item) {
  return {
    type: "ImpactAlert",
    confidence_tier: "specialist",
    source: "gdacs",
    id: item.id ?? item.eventid ?? null,
    eventType: item.eventType ?? item.eventtype ?? null,
    name: item.name ?? item.eventname ?? item.title ?? null,
    alertLevel: item.alertLevel ?? item.alertlevel ?? item.level ?? null,
    fromDate: item.fromDate ?? item.fromdate ?? item.pubDate ?? null,
    toDate: item.toDate ?? item.todate ?? null,
    lat: num(item.lat ?? item.latitude, null),
    lon: num(item.lon ?? item.longitude, null),
    url: item.url ?? item.link ?? null,
    description: item.description ? String(item.description).slice(0, 2000) : null,
  };
}

// ---------------------------------------------------------------------------
// CSV / Atom / RSS parsers (minimal, zero-dep)
// ---------------------------------------------------------------------------

function parseCsv(text) {
  const lines = String(text || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function xmlText(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = String(block).match(re);
  if (!m) return null;
  return decodeXml(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim());
}

function xmlAttr(block, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["'][^>]*/?>`, "i");
  const m = String(block).match(re);
  return m ? decodeXml(m[1]) : null;
}

function xmlLinkHrefs(block, typeNeedle = null) {
  const hrefs = [];
  const re = /<link\b([^>]*)\/?>/gi;
  let m;
  while ((m = re.exec(String(block)))) {
    const attrs = m[1];
    const type = attrs.match(/\btype=["']([^"']+)["']/i)?.[1] || "";
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    if (typeNeedle && !String(type).toLowerCase().includes(String(typeNeedle).toLowerCase())) continue;
    hrefs.push(decodeXml(href));
  }
  return hrefs;
}

function decodeXml(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function atomEntries(xml) {
  const entries = [];
  const re = /<entry\b[\s\S]*?<\/entry>/gi;
  let m;
  while ((m = re.exec(xml))) entries.push(m[0]);
  return entries;
}

function rssItems(xml) {
  const items = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let m;
  while ((m = re.exec(xml))) items.push(m[0]);
  return items;
}

function meteoalarmCountrySlug(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  const aliases = {
    uk: "united-kingdom",
    "great-britain": "united-kingdom",
    gb: "united-kingdom",
    usa: "united-states",
    de: "germany",
    fr: "france",
    es: "spain",
    it: "italy",
    nl: "netherlands",
    be: "belgium",
    at: "austria",
    ch: "switzerland",
    pl: "poland",
    se: "sweden",
    no: "norway",
    fi: "finland",
    dk: "denmark",
    ie: "ireland",
    pt: "portugal",
    gr: "greece",
    cz: "czech-republic",
    "czech-republic": "czech-republic",
    lu: "luxembourg",
    hu: "hungary",
    ro: "romania",
    sk: "slovakia",
    si: "slovenia",
    hr: "croatia",
    bg: "bulgaria",
    ee: "estonia",
    lv: "latvia",
    lt: "lithuania",
    mt: "malta",
    cy: "cyprus",
    is: "iceland",
    rs: "serbia",
    ua: "ukraine",
    tr: "turkiye",
    turkey: "turkiye",
  };
  return aliases[s] || s;
}

// ---------------------------------------------------------------------------
// Handlers (core)
// ---------------------------------------------------------------------------

async function handleNwsForecast(args) {
  const lat = num(args.lat, DEFAULT_LAT);
  const lon = num(args.lon, DEFAULT_LON);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return errPayload("invalid_arguments", "lat and lon are required numbers");
  }
  const product = String(args.product || "periods").toLowerCase();
  const allowed = ["periods", "hourly", "grid", "observation", "observations", "afd", "hwo"];
  if (!allowed.includes(product)) {
    return errPayload(
      "invalid_arguments",
      "product must be periods | hourly | grid | observation | observations | afd | hwo",
    );
  }
  const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
  const points = await httpGet(pointsUrl, { headers: nwsHeaders(), as: "json" });
  if (!points.ok || !points.json?.properties) {
    return errPayload("http_error", `NWS points failed HTTP ${points.status}`, {
      status: points.status,
      detail: points.text?.slice(0, 300),
    });
  }
  const props = points.json.properties;
  const rel = props.relativeLocation?.properties;
  const place = rel ? `${rel.city ?? ""}${rel.city && rel.state ? ", " : ""}${rel.state ?? ""}`.trim() : null;

  if (product === "afd" || product === "hwo") {
    let location = String(props.cwa || "").trim().toUpperCase();
    if (/^K[A-Z]{3}$/.test(location)) location = location.slice(1);
    if (!location) {
      return errPayload("not_found", "NWS points response missing cwa for text product lookup");
    }
    const type = product.toUpperCase();
    const listUrl = `https://api.weather.gov/products?type=${encodeURIComponent(type)}&location=${encodeURIComponent(location)}`;
    const list = await httpGet(listUrl, { headers: nwsHeaders(), as: "json" });
    if (!list.ok || !list.json) {
      return errPayload("http_error", `NWS products list failed HTTP ${list.status}`, {
        status: list.status,
        url: listUrl,
      });
    }
    const graph = list.json["@graph"] ?? list.json.graph ?? [];
    if (!Array.isArray(graph) || !graph.length) {
      return errPayload("not_found", `No NWS ${type} products for location=${location} (use CWA e.g. MRX, not KMRX)`, {
        url: listUrl,
      });
    }
    const latest = graph[0];
    const prodId = latest?.id;
    const prodUrl = latest?.["@id"] || (prodId ? `https://api.weather.gov/products/${prodId}` : null);
    if (!prodUrl) {
      return errPayload("not_found", `NWS ${type} list missing product id`);
    }
    const prod = await httpGet(prodUrl, { headers: nwsHeaders(), as: "json" });
    if (!prod.ok || !prod.json) {
      return errPayload("http_error", `NWS product fetch failed HTTP ${prod.status}`, {
        status: prod.status,
        url: prodUrl,
      });
    }
    const jp = prod.json;
    return okPayload({
      type: "NwsTextProduct",
      confidence_tier: "official",
      source: "nws",
      product,
      productCode: jp.productCode ?? type,
      productName: jp.productName ?? latest.productName ?? null,
      issuingOffice: jp.issuingOffice ?? latest.issuingOffice ?? null,
      issuanceTime: jp.issuanceTime ?? latest.issuanceTime ?? null,
      id: jp.id ?? prodId,
      lat,
      lon,
      place,
      office: location,
      url: prodUrl,
      text: String(jp.productText || "").slice(0, 8000),
    });
  }

  if (product === "observation" || product === "observations") {
    const stationsUrl = props.observationStations;
    if (!stationsUrl) {
      return errPayload("not_found", "NWS points response missing observationStations URL");
    }
    const stations = await httpGet(stationsUrl, { headers: nwsHeaders(), as: "json" });
    const feat = stations.json?.features?.[0];
    const stationHref = feat?.id || feat?.properties?.["@id"];
    if (!stations.ok || !stationHref) {
      return errPayload("not_found", "No NWS observation station found for this point", {
        status: stations.status,
      });
    }
    const stationBase = String(stationHref).replace(/\/$/, "");
    const wantHistory = product === "observations" || boolArg(args.history, false);
    if (wantHistory) {
      const histLimit = clamp(num(args.limit, 12), 1, 48);
      const histParams = new URLSearchParams({ limit: String(histLimit) });
      if (present(args.start)) histParams.set("start", String(args.start));
      if (present(args.end)) histParams.set("end", String(args.end));
      const histUrl = `${stationBase}/observations?${histParams}`;
      const hist = await httpGet(histUrl, { headers: nwsHeaders(), as: "json" });
      if (!hist.ok || !hist.json) {
        return errPayload("http_error", `NWS observation history failed HTTP ${hist.status}`, {
          status: hist.status,
        });
      }
      const features = hist.json.features ?? [];
      const observations = features.slice(0, histLimit).map((f) => {
        const op = f.properties ?? {};
        return {
          timestamp: op.timestamp ?? null,
          textDescription: op.textDescription ?? null,
          temperature: qty(op.temperature),
          dewpoint: qty(op.dewpoint),
          windDirection: qty(op.windDirection),
          windSpeed: qty(op.windSpeed),
          windGust: qty(op.windGust),
          barometricPressure: qty(op.barometricPressure),
          visibility: qty(op.visibility),
          relativeHumidity: qty(op.relativeHumidity),
        };
      });
      return okPayload({
        type: "ObservationList",
        confidence_tier: "official",
        source: "nws",
        product: "observations",
        lat,
        lon,
        place,
        station: stationHref,
        stationId: feat?.properties?.stationIdentifier ?? null,
        stationName: feat?.properties?.name ?? null,
        observationUrl: histUrl,
        count: observations.length,
        observations,
      });
    }
    const obsUrl = `${stationBase}/observations/latest`;
    const obs = await httpGet(obsUrl, { headers: nwsHeaders(), as: "json" });
    if (!obs.ok || !obs.json?.properties) {
      return errPayload("http_error", `NWS observation failed HTTP ${obs.status}`, { status: obs.status });
    }
    const op = obs.json.properties;
    return okPayload({
      type: "Observation",
      confidence_tier: "official",
      source: "nws",
      product: "observation",
      lat,
      lon,
      place,
      station: op.station || stationHref,
      stationId: feat?.properties?.stationIdentifier ?? null,
      stationName: feat?.properties?.name ?? null,
      timestamp: op.timestamp ?? null,
      textDescription: op.textDescription ?? null,
      temperature: qty(op.temperature),
      dewpoint: qty(op.dewpoint),
      windDirection: qty(op.windDirection),
      windSpeed: qty(op.windSpeed),
      windGust: qty(op.windGust),
      barometricPressure: qty(op.barometricPressure),
      visibility: qty(op.visibility),
      relativeHumidity: qty(op.relativeHumidity),
      heatIndex: qty(op.heatIndex),
      windChill: qty(op.windChill),
      cloudLayers: Array.isArray(op.cloudLayers)
        ? op.cloudLayers.slice(0, 8).map((c) => ({
            amount: c?.amount ?? null,
            base: qty(c?.base),
          }))
        : [],
      observationUrl: obsUrl,
    });
  }

  const urlMap = {
    periods: props.forecast,
    hourly: props.forecastHourly,
    grid: props.forecastGridData,
  };
  const forecastUrl = urlMap[product];
  if (!forecastUrl) {
    return errPayload("not_found", `NWS points response missing ${product} URL`);
  }
  const forecast = await httpGet(forecastUrl, { headers: nwsHeaders(), as: "json" });
  if (!forecast.ok || !forecast.json?.properties) {
    return errPayload("http_error", `NWS ${product} failed HTTP ${forecast.status}`, {
      status: forecast.status,
    });
  }
  const gp = forecast.json.properties;

  if (product === "grid") {
    const limit = clamp(num(args.limit, 12), 1, 48);
    return okPayload({
      type: "GridpointForecast",
      confidence_tier: "official",
      source: "nws",
      product: "grid",
      lat,
      lon,
      place,
      timezone: props.timeZone ?? null,
      office: props.cwa ?? gp.forecastOffice ?? null,
      gridId: props.gridId ?? gp.gridId ?? null,
      gridX: gp.gridX ?? props.gridX ?? null,
      gridY: gp.gridY ?? props.gridY ?? null,
      updateTime: gp.updateTime ?? null,
      validTimes: gp.validTimes ?? null,
      forecastUrl,
      layers: {
        temperature: slimQuantitative(gp.temperature, limit),
        dewpoint: slimQuantitative(gp.dewpoint, limit),
        relativeHumidity: slimQuantitative(gp.relativeHumidity, limit),
        skyCover: slimQuantitative(gp.skyCover, limit),
        windSpeed: slimQuantitative(gp.windSpeed, limit),
        windGust: slimQuantitative(gp.windGust, limit),
        probabilityOfPrecipitation: slimQuantitative(gp.probabilityOfPrecipitation, limit),
        quantitativePrecipitation: slimQuantitative(gp.quantitativePrecipitation, limit),
        weather: slimQuantitative(gp.weather, Math.min(limit, 8)),
      },
    });
  }

  const periods = gp.periods ?? [];
  const defaultLimit = product === "hourly" ? 24 : 14;
  const maxLimit = product === "hourly" ? 72 : 28;
  const limit = clamp(num(args.limit, defaultLimit), 1, maxLimit);
  return okPayload(
    toPointForecast({
      lat,
      lon,
      place,
      timezone: props.timeZone ?? null,
      periods: periods.slice(0, limit),
      source: "nws",
      confidence_tier: "official",
      extra: {
        product,
        office: props.cwa ?? null,
        gridId: props.gridId ?? null,
        forecastUrl,
      },
    }),
  );
}

async function handleNwsAlerts(args) {
  const mode = String(args.mode || "").toLowerCase();
  if (mode === "types" || boolArg(args.list_types, false)) {
    const url = "https://api.weather.gov/alerts/types";
    const res = await httpGet(url, { headers: nwsHeaders(), as: "json" });
    if (!res.ok || !res.json) {
      return errPayload("http_error", `NWS alert types failed HTTP ${res.status}`, { status: res.status });
    }
    const eventTypes = res.json.eventTypes ?? res.json["@graph"] ?? res.json.types ?? [];
    return okPayload({
      type: "NwsAlertTypes",
      confidence_tier: "official",
      source: "nws",
      mode: "types",
      count: Array.isArray(eventTypes) ? eventTypes.length : 0,
      eventTypes,
      url,
    });
  }
  const lat = present(args.lat) ? num(args.lat) : null;
  const lon = present(args.lon) ? num(args.lon) : null;
  const area = present(args.area) ? String(args.area).toUpperCase() : null;
  const event = present(args.event) ? String(args.event) : null;
  const zone = present(args.zone) ? String(args.zone).toUpperCase() : null;
  const status = present(args.status) ? String(args.status).toLowerCase() : null;
  const severity = present(args.severity) ? String(args.severity) : null;
  const urgency = present(args.urgency) ? String(args.urgency) : null;
  const certainty = present(args.certainty) ? String(args.certainty) : null;
  const region = present(args.region) ? String(args.region) : null;
  const params = new URLSearchParams();
  const hasPoint = lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon);
  const hasFilter = Boolean(area || zone || event || severity || urgency || certainty || region);
  if (hasPoint) {
    params.set("point", `${lat},${lon}`);
  } else if (area) {
    params.set("area", area);
  } else if (!hasFilter) {
    params.set("point", `${DEFAULT_LAT},${DEFAULT_LON}`);
  }
  if (event) params.set("event", event);
  if (zone) params.set("zone", zone);
  if (status) params.set("status", status);
  if (severity) params.set("severity", severity);
  if (urgency) params.set("urgency", urgency);
  if (certainty) params.set("certainty", certainty);
  if (region) params.set("region", region);
  const url = `https://api.weather.gov/alerts/active?${params}`;
  const res = await httpGet(url, { headers: nwsHeaders(), as: "json" });
  if (!res.ok || !res.json) {
    return errPayload("http_error", `NWS alerts failed HTTP ${res.status}`, { status: res.status });
  }
  const features = res.json.features ?? [];
  const alerts = features.map((f) => {
    const p = f.properties ?? {};
    return toOfficialAlert({
      id: p.id ?? f.id,
      event: p.event,
      headline: p.headline,
      severity: p.severity,
      urgency: p.urgency,
      certainty: p.certainty,
      areaDesc: p.areaDesc,
      onset: p.onset,
      ends: p.ends ?? p.expires,
      sent: p.sent,
      description: p.description,
      instruction: p.instruction,
      url: p["@id"] ?? p.id,
      source: "nws",
      confidence_tier: "official",
      geometry: f.geometry ?? null,
    });
  });
  const limit = clamp(num(args.limit, alerts.length || 50), 1, 500);
  const sliced = alerts.slice(0, limit);
  return okPayload({
    type: "OfficialAlertList",
    confidence_tier: "official",
    source: "nws",
    query: { lat, lon, area, event, zone, status, severity, urgency, certainty, region, url },
    count: sliced.length,
    alerts: sliced,
  });
}

function usgsHasBbox(args) {
  const south = args.minlatitude ?? args.south;
  const north = args.maxlatitude ?? args.north;
  const west = args.minlongitude ?? args.west;
  const east = args.maxlongitude ?? args.east;
  return [south, north, west, east].every((v) => present(v));
}

function applyUsgsFdsnParams(params, args) {
  if (usgsHasBbox(args)) {
    params.set("minlatitude", String(num(args.minlatitude ?? args.south)));
    params.set("maxlatitude", String(num(args.maxlatitude ?? args.north)));
    params.set("minlongitude", String(num(args.minlongitude ?? args.west)));
    params.set("maxlongitude", String(num(args.maxlongitude ?? args.east)));
  } else if (present(args.lat) && present(args.lon)) {
    params.set("latitude", String(num(args.lat)));
    params.set("longitude", String(num(args.lon)));
    params.set("maxradiuskm", String(clamp(num(args.radius_km, 500), 1, 20000)));
  }
  if (present(args.minmagnitude) || present(args.minmag)) {
    params.set("minmagnitude", String(num(args.minmagnitude, args.minmag)));
  }
  if (present(args.maxmagnitude) || present(args.maxmag)) {
    params.set("maxmagnitude", String(num(args.maxmagnitude, args.maxmag)));
  }
  if (present(args.starttime)) params.set("starttime", String(args.starttime));
  if (present(args.endtime)) params.set("endtime", String(args.endtime));
  if (present(args.updatedafter)) params.set("updatedafter", String(args.updatedafter));
  const types = args.types ?? args.eventtype ?? args.type;
  if (present(types)) params.set("eventtype", String(types));
}

const USGS_FEEDS = {
  hour: "all_hour",
  day: "all_day",
  week: "all_week",
  month: "all_month",
  all_hour: "all_hour",
  all_day: "all_day",
  all_week: "all_week",
  all_month: "all_month",
  significant_hour: "significant_hour",
  significant_day: "significant_day",
  significant_week: "significant_week",
  significant_month: "significant_month",
  "4.5_hour": "4.5_hour",
  "4.5_day": "4.5_day",
  "4.5_week": "4.5_week",
  "4.5_month": "4.5_month",
  "2.5_hour": "2.5_hour",
  "2.5_day": "2.5_day",
  "2.5_week": "2.5_week",
  "2.5_month": "2.5_month",
  "1.0_hour": "1.0_hour",
  "1.0_day": "1.0_day",
  "1.0_week": "1.0_week",
  "1.0_month": "1.0_month",
};

async function handleUsgsQuakes(args) {
  if (present(args.meta)) {
    const meta = String(args.meta).toLowerCase();
    if (!["count", "catalogs", "contributors"].includes(meta)) {
      return errPayload("invalid_arguments", "meta must be count | catalogs | contributors");
    }
    let url = `https://earthquake.usgs.gov/fdsnws/event/1/${meta}`;
    if (meta === "count") {
      const params = new URLSearchParams({ format: "geojson" });
      applyUsgsFdsnParams(params, args);
      url = `${url}?${params}`;
    }
    const res = await httpGet(url, { accept: "application/json, application/xml, text/plain, */*", as: "json", timeout: 30_000 });
    if (!res.ok) {
      return errPayload("http_error", `USGS FDSN ${meta} failed HTTP ${res.status}`, { status: res.status });
    }
    let data = res.json;
    if (!data) {
      if (meta === "catalogs") data = { catalogs: xmlTags(res.text, "Catalog") };
      else if (meta === "contributors") data = { contributors: xmlTags(res.text, "Contributor") };
      else data = { raw: res.text.slice(0, 2000) };
    }
    return okPayload({
      type: "QuakeMeta",
      confidence_tier: "catalog",
      source: "usgs",
      meta,
      feed_url: url,
      data,
    });
  }

  if (present(args.eventid)) {
    const eventid = String(args.eventid).trim();
    const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${encodeURIComponent(eventid)}.geojson`;
    const res = await httpGet(url, { accept: "application/geo+json, application/json", as: "json" });
    if (!res.ok || !res.json) {
      return errPayload("http_error", `USGS detail failed HTTP ${res.status}`, { status: res.status, eventid });
    }
    const feature = res.json.type === "Feature" ? res.json : res.json.features?.[0] ?? res.json;
    const events = [toQuakeEvent(feature)];
    return okPayload({
      type: "QuakeEventList",
      confidence_tier: "catalog",
      source: "usgs",
      feed_url: url,
      eventid,
      count: events.length,
      events,
    });
  }

  const hasBbox = usgsHasBbox(args);
  const mode = String(
    args.feed || args.mode || (hasBbox || (present(args.lat) && present(args.lon)) ? "query" : "hour"),
  ).toLowerCase();
  let url;
  if (mode === "query") {
    const limit = clamp(num(args.limit, 50), 1, 200);
    const params = new URLSearchParams({
      format: "geojson",
      orderby: "time",
      limit: String(limit),
    });
    applyUsgsFdsnParams(params, args);
    if (!params.has("minlatitude") && !params.has("latitude")) {
      params.set("latitude", String(DEFAULT_LAT));
      params.set("longitude", String(DEFAULT_LON));
      params.set("maxradiuskm", String(clamp(num(args.radius_km, 500), 1, 20000)));
    }
    url = `https://earthquake.usgs.gov/fdsnws/event/1/query?${params}`;
  } else if (USGS_FEEDS[mode]) {
    url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${USGS_FEEDS[mode]}.geojson`;
  } else {
    return errPayload(
      "invalid_arguments",
      "feed must be hour|day|week|month|significant_*|4.5_*|2.5_*|1.0_*|query",
    );
  }
  const res = await httpGet(url, { accept: "application/geo+json, application/json", as: "json" });
  if (!res.ok || !res.json) {
    return errPayload("http_error", `USGS earthquakes failed HTTP ${res.status}`, { status: res.status });
  }
  let features = res.json.features ?? [];
  const minmag = num(args.minmagnitude, args.minmag ?? NaN);
  if (Number.isFinite(minmag)) {
    features = features.filter((f) => Number(f?.properties?.mag) >= minmag);
  }
  const limit = clamp(num(args.limit, features.length || 50), 1, 200);
  const events = features.slice(0, limit).map(toQuakeEvent);
  return okPayload({
    type: "QuakeEventList",
    confidence_tier: "catalog",
    source: "usgs",
    feed: mode,
    feed_url: url,
    count: events.length,
    events,
  });
}

async function handleNhcStorms(args) {
  const url = "https://www.nhc.noaa.gov/CurrentStorms.json";
  const res = await httpGet(url, { accept: "application/json", as: "json" });
  if (!res.ok || !res.json) {
    return errPayload("http_error", `NHC CurrentStorms failed HTTP ${res.status}`, { status: res.status });
  }
  const storms = (res.json.activeStorms ?? []).map(toTropicalStorm);
  const payload = {
    type: "TropicalStormList",
    confidence_tier: "official",
    source: "nhc",
    count: storms.length,
    storms,
  };
  if (boolArg(args.include_advisories, false)) {
    const feeds = [
      ["at", "https://www.nhc.noaa.gov/index-at.xml"],
      ["ep", "https://www.nhc.noaa.gov/index-ep.xml"],
      ["cp", "https://www.nhc.noaa.gov/index-cp.xml"],
    ];
    const results = await Promise.all(
      feeds.map(async ([basin, feedUrl]) => {
        const rss = await httpGet(feedUrl, { accept: "*/*" });
        if (!rss.ok) {
          return [{ basin, error: `HTTP ${rss.status}`, url: feedUrl }];
        }
        const blocks = [...rssItems(rss.text), ...atomEntries(rss.text)];
        return blocks.slice(0, 40).map((item) => ({
          basin,
          title: xmlText(item, "title"),
          link: xmlText(item, "link") || xmlAttr(item, "link", "href"),
          pubDate: xmlText(item, "pubDate") || xmlText(item, "updated") || xmlText(item, "published"),
          guid: xmlText(item, "guid") || xmlText(item, "id"),
          summary: String(xmlText(item, "description") || xmlText(item, "summary") || "").slice(0, 400),
        }));
      }),
    );
    payload.advisories = results.flat();
    payload.advisory_count = payload.advisories.length;
  }
  if (boolArg(args.include_outlook, false)) {
    const gtwoUrl = "https://www.nhc.noaa.gov/gtwo.xml";
    const rss = await httpGet(gtwoUrl, { accept: "*/*" });
    if (!rss.ok) {
      payload.outlooks = [{ error: `HTTP ${rss.status}`, url: gtwoUrl }];
      payload.outlook_count = 0;
    } else {
      payload.outlooks = rssItems(rss.text).map((item) => ({
        title: xmlText(item, "title"),
        link: xmlText(item, "link") || xmlAttr(item, "link", "href"),
        pubDate: xmlText(item, "pubDate") || xmlText(item, "updated") || xmlText(item, "published"),
        guid: xmlText(item, "guid") || xmlText(item, "id"),
        summary: String(xmlText(item, "description") || xmlText(item, "summary") || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500),
      }));
      payload.outlook_count = payload.outlooks.length;
    }
  }
  return okPayload(payload);
}

// ---------------------------------------------------------------------------
// JTWC (WP / IO / SH only — sibling to nhc_storms, not folded into NHC)
// ---------------------------------------------------------------------------

function jtwcItemText(itemXml) {
  const title = xmlText(itemXml, "title") || "";
  const desc = xmlText(itemXml, "description") || "";
  const link = xmlText(itemXml, "link") || xmlAttr(itemXml, "link", "href") || "";
  const guid = xmlText(itemXml, "guid") || "";
  return { title, desc, link, guid, blob: `${title}\n${desc}\n${link}\n${guid}\n${itemXml}` };
}

function jtwcItemIsEpacCpac(itemXml) {
  const { title, blob } = jtwcItemText(itemXml);
  const category = (xmlText(itemXml, "category") || "").toLowerCase();
  const hay = `${title} ${category} ${blob}`.toLowerCase();
  return /central\/eastern pacific|eastern pacific|central pacific|\bepac\b|\bcpac\b/.test(hay);
}

function jtwcItemIsAdvisory(itemXml) {
  const { title, desc, blob } = jtwcItemText(itemXml);
  if (/abpwweb\.txt|abioweb\.txt/i.test(blob)) return true;
  if (/\/jtwc\/products\/ab[pi]o/i.test(blob)) return true;
  if (/significant tropical weather advisory|\bstwa\b/i.test(`${title} ${desc}`)) return true;
  return false;
}

/** Extract wp|io|sh web.txt (+ optional .tcw) from RSS item HTML CDATA. */
function extractJtwcProductLinks(html) {
  const storms = new Map();
  const hrefRe = /href\s*=\s*['"]([^'"]+)['"]/gi;
  let m;
  while ((m = hrefRe.exec(String(html)))) {
    const url = m[1];
    const wm = url.match(/\/products\/((?:wp|io|sh)\d{4})web\.txt/i);
    if (!wm) continue;
    const id = wm[1].toLowerCase();
    if (!storms.has(id)) storms.set(id, { id, webTxtUrl: url, tcwUrl: null });
  }
  hrefRe.lastIndex = 0;
  while ((m = hrefRe.exec(String(html)))) {
    const url = m[1];
    const tm = url.match(/\/products\/((?:wp|io|sh)\d{4})\.tcw/i);
    if (!tm) continue;
    const id = tm[1].toLowerCase();
    if (storms.has(id)) storms.get(id).tcwUrl = url;
  }
  return [...storms.values()];
}

function extractJtwcAdvisoryLinks(blob) {
  const out = [];
  const seen = new Set();
  const add = (url) => {
    let basin = null;
    let title = null;
    if (/abpwweb\.txt/i.test(url)) {
      basin = "WP";
      title = "ABPW";
    } else if (/abioweb\.txt/i.test(url)) {
      basin = "IO";
      title = "ABIO";
    }
    if (!basin || seen.has(basin)) return;
    seen.add(basin);
    out.push({ basin, url, title });
  };
  const hrefRe = /href\s*=\s*['"]([^'"]+)['"]/gi;
  let m;
  while ((m = hrefRe.exec(String(blob)))) add(m[1]);
  const bareRe = /https?:\/\/[^\s"'<>]+(?:abpwweb|abioweb)\.txt/gi;
  while ((m = bareRe.exec(String(blob)))) add(m[0]);
  return out;
}

function parseJtwcTcw(text, meta = {}) {
  const raw = String(text || "");
  const lines = raw.split(/\r?\n/);
  const positions = [];
  for (const line of lines) {
    const pos = parseJtwcLatLon(line);
    if (pos.lat == null || pos.lon == null) continue;
    const wind = line.match(/(\d{2,3})\s*KT/i) || line.match(/\b(\d{2,3})\s+(\d{3,4})\s*$/);
    const press = line.match(/(\d{3,4})\s*MB/i);
    const time = line.match(/\b(\d{6,8}Z|\d{4}\s*Z|\d{10})\b/i)?.[1] || null;
    positions.push({
      time,
      lat: pos.lat,
      lon: pos.lon,
      intensity_kt: wind ? Number(wind[1]) : null,
      pressure_mb: press ? Number(press[1]) : null,
    });
    if (positions.length >= 8) break;
  }
  const name =
    raw.match(/SUBJ\/([^/\n]+)/i)?.[1]?.trim() ||
    raw.match(/\b((?:SUPER\s+)?(?:TYPHOON|HURRICANE|TROPICAL\s+STORM|TROPICAL\s+DEPRESSION|TROPICAL\s+CYCLONE)\s+[A-Z0-9 ()-]+)/i)?.[1] ||
    meta.id ||
    null;
  return {
    url: meta.tcwUrl || null,
    name,
    position_count: positions.length,
    positions,
    preview: raw.replace(/\s+/g, " ").trim().slice(0, 400),
  };
}

/** Parse ABPW/ABIO TROPICAL DISTURBANCE SUMMARY INVESTs only (not named TCs). */
function parseJtwcInvests(text, meta = {}) {
  const raw = String(text || "");
  const sections = [];
  const secRe = /TROPICAL DISTURBANCE SUMMARY:([\s\S]*?)(?=\n\s*[A-Z]\.\s+|\n\d+\.\s+|NNNN|$)/gi;
  let sm;
  while ((sm = secRe.exec(raw))) sections.push(sm[1]);
  const blob = sections.length ? sections.join("\n") : raw;
  const wmo = raw.match(/^[A-Z]{4}\d{2}\s+\w+\s+(\d{6})/m)?.[1];
  const lastUpdate =
    raw.match(/SUBJ\/[\s\S]*?\/(\d{6}Z)/i)?.[1] ||
    raw.match(/\b(\d{6}Z)-\d{6}Z/i)?.[1] ||
    (wmo ? `${wmo}Z` : null) ||
    meta.pubDate ||
    null;
  const invests = [];
  const seen = new Set();
  const investRe =
    /AREA OF CONVECTION\s*\(INVEST\s+(\d{2}[A-Z])\)([\s\S]*?)(?=AREA OF CONVECTION\s*\(INVEST|\(\d+\)\s*NO OTHER SUSPECT|NNNN|$)/gi;
  let im;
  while ((im = investRe.exec(blob))) {
    const id = im[1].toUpperCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const para = im[0];
    const nowLoc = para.match(/NOW LOCATED NEAR\s+(\d+(?:\.\d+)?[NS])\s+(\d+(?:\.\d+)?[EW])/i);
    const locPair = nowLoc ? `${nowLoc[1]} ${nowLoc[2]}` : "";
    const { lat, lon } = parseJtwcLatLon(locPair || para);
    const windM = para.match(
      /MAXIMUM SUSTAINED SURFACE WINDS ARE\s+ESTIMATED AT\s+(\d+)\s+TO\s+(\d+)\s+KNOTS/i,
    );
    const pressM = para.match(/MINIMUM SEA LEVEL PRESSURE IS ESTIMATED\s+TO BE NEAR\s+(\d+)\s*MB/i);
    const genM = para.match(
      /POTENTIAL FOR THE DEVELOPMENT OF A SIGNIFICANT\s+TROPICAL CYCLONE WITHIN THE NEXT 24 HOURS IS\s+(LOW|MEDIUM|HIGH)/i,
    );
    const minKt = windM ? Number(windM[1]) : null;
    const maxKt = windM ? Number(windM[2]) : null;
    invests.push({
      type: "TropicalStorm",
      confidence_tier: "specialist",
      source: "jtwc",
      id,
      name: id,
      classification: "INVEST",
      intensity_kt: maxKt,
      intensity_kt_min: minKt,
      pressure_mb: pressM ? Number(pressM[1]) : null,
      lat,
      lon,
      movementDir: null,
      movementSpeed_kt: null,
      lastUpdate,
      publicAdvisoryUrl: meta.url || null,
      forecastAdvisoryUrl: null,
      genesis_24h: genM ? genM[1].toUpperCase() : null,
      is_invest: true,
      basin: meta.basin || null,
    });
  }
  return invests;
}

/** Parse 28.0N 128.9E or compact tenths 280N 1289E. */
function parseJtwcLatLon(text) {
  let m = String(text).match(/(\d{1,2}(?:\.\d+)?)\s*([NS])\s+(\d{1,3}(?:\.\d+)?)\s*([EW])/i);
  if (m) {
    let lat = parseFloat(m[1]);
    let lon = parseFloat(m[3]);
    if (m[2].toUpperCase() === "S") lat = -lat;
    if (m[4].toUpperCase() === "W") lon = -lon;
    return { lat, lon };
  }
  m = String(text).match(/(\d{3,4})\s*([NS])\s+(\d{3,5})\s*([EW])/i);
  if (m) {
    let lat = parseInt(m[1], 10) / 10;
    let lon = parseInt(m[3], 10) / 10;
    if (m[2].toUpperCase() === "S") lat = -lat;
    if (m[4].toUpperCase() === "W") lon = -lon;
    return { lat, lon };
  }
  return { lat: null, lon: null };
}

function titleCaseName(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

/** @returns {object} TropicalStorm (confidence_tier=specialist, source=jtwc) */
function parseJtwcWebTxt(text, meta = {}) {
  const raw = String(text || "");
  const subj = raw.match(/SUBJ\/([^/\n]+)/i)?.[1] || "";
  const nameM = subj.match(
    /((?:SUPER\s+)?(?:TYPHOON|HURRICANE|TROPICAL\s+STORM|TROPICAL\s+DEPRESSION|TROPICAL\s+CYCLONE|INVEST))\s+(\d{1,2}[A-Z])\s*(?:\(([^)]+)\))?/i,
  );
  const classification = nameM?.[1] ? nameM[1].replace(/\s+/g, " ").trim() : null;
  const shortId = nameM?.[2] || null;
  const name = nameM?.[3] ? titleCaseName(nameM[3]) : shortId || meta.id || null;

  const warnPos = raw.match(/WARNING POSITION:[\s\S]{0,500}?NEAR\s+([^\n]+)/i);
  const posLine = warnPos?.[1] || raw.match(/\bNEAR\s+(\d[^\n]+)/i)?.[1] || "";
  const { lat, lon } = parseJtwcLatLon(posLine);

  const moveM = raw.match(/MOVEMENT PAST SIX HOURS\s*-\s*(\d+)\s*DEGREES?\s+AT\s+(\d+)\s*KTS?/i);

  const presentBlock = raw.match(/PRESENT WIND DISTRIBUTION:([\s\S]*?)(?:\n\s*---|\n\s*FORECASTS:)/i);
  const windSrc = presentBlock?.[1] || raw.slice(0, 2500);
  const windM = windSrc.match(/MAX SUSTAINED WINDS\s*-\s*(\d+)\s*KT/i);

  const pressM = raw.match(/MINIMUM CENTRAL PRESSURE[^\n]*?\bIS\s+(\d+)\s*MB/i);
  const lastUpdate =
    raw.match(/WARNING POSITION:\s*\n\s*(\d{6}Z)/i)?.[1] ||
    raw.match(/\b(\d{6}Z)\b/)?.[1] ||
    meta.pubDate ||
    null;

  return {
    type: "TropicalStorm",
    confidence_tier: "specialist",
    source: "jtwc",
    id: meta.id || shortId || null,
    short_id: shortId || null,
    name,
    classification,
    intensity_kt: windM ? Number(windM[1]) : null,
    pressure_mb: pressM ? Number(pressM[1]) : null,
    lat,
    lon,
    movementDir: moveM ? Number(moveM[1]) : null,
    movementSpeed_kt: moveM ? Number(moveM[2]) : null,
    lastUpdate,
    publicAdvisoryUrl: meta.webTxtUrl || null,
    forecastAdvisoryUrl: meta.tcwUrl || null,
  };
}

async function handleJtwcStorms(args) {
  const includeAdvisories = boolArg(args.include_advisories, false);
  const includeInvests = boolArg(args.include_invests, false);
  const includeTcw = boolArg(args.include_tcw, false);
  const rss = await httpGet(JTWC_RSS, {
    accept: "application/rss+xml, application/xml, text/xml, */*",
    headers: { "User-Agent": JTWC_UA },
  });
  if (!rss.ok) {
    return errPayload("http_error", `JTWC RSS failed HTTP ${rss.status}`, {
      status: rss.status,
      url: JTWC_RSS,
    });
  }

  const items = rssItems(rss.text);
  const products = new Map();
  const advisoryFeeds = new Map();
  for (const item of items) {
    if (jtwcItemIsEpacCpac(item)) continue;
    const { title, blob } = jtwcItemText(item);
    const pubDate = xmlText(item, "pubDate");
    if (jtwcItemIsAdvisory(item)) {
      if (includeAdvisories || includeInvests) {
        for (const a of extractJtwcAdvisoryLinks(blob)) {
          if (!advisoryFeeds.has(a.basin)) {
            advisoryFeeds.set(a.basin, { ...a, pubDate, rssTitle: title });
          }
        }
      }
      continue;
    }
    for (const p of extractJtwcProductLinks(blob)) {
      if (!products.has(p.id)) products.set(p.id, { ...p, pubDate });
    }
  }
  if (includeAdvisories || includeInvests) {
    if (!advisoryFeeds.has("WP")) {
      advisoryFeeds.set("WP", { basin: "WP", url: JTWC_ABPW, title: "ABPW", pubDate: null, rssTitle: "ABPW" });
    }
    if (!advisoryFeeds.has("IO")) {
      advisoryFeeds.set("IO", { basin: "IO", url: JTWC_ABIO, title: "ABIO", pubDate: null, rssTitle: "ABIO" });
    }
  }

  const limit = clamp(num(args.limit, 25), 1, 50);
  const list = [...products.values()].slice(0, limit);
  const storms = [];
  for (const p of list) {
    const res = await httpGet(p.webTxtUrl, {
      accept: "text/plain, */*",
      headers: { "User-Agent": JTWC_UA },
    });
    if (!res.ok) {
      storms.push({
        type: "TropicalStorm",
        confidence_tier: "specialist",
        source: "jtwc",
        id: p.id,
        name: p.id,
        classification: null,
        intensity_kt: null,
        pressure_mb: null,
        lat: null,
        lon: null,
        movementDir: null,
        movementSpeed_kt: null,
        lastUpdate: p.pubDate || null,
        publicAdvisoryUrl: p.webTxtUrl,
        forecastAdvisoryUrl: p.tcwUrl,
        fetch_error: `HTTP ${res.status}`,
        ...(includeTcw && p.tcwUrl ? { tcw: { url: p.tcwUrl, error: "web.txt fetch failed" } } : {}),
      });
      continue;
    }
    const storm = parseJtwcWebTxt(res.text, p);
    if (includeTcw && p.tcwUrl) {
      const tcwRes = await httpGet(p.tcwUrl, {
        accept: "text/plain, */*",
        headers: { "User-Agent": JTWC_UA },
      });
      storm.tcw = tcwRes.ok
        ? parseJtwcTcw(tcwRes.text, p)
        : { url: p.tcwUrl, error: `HTTP ${tcwRes.status}` };
    }
    storms.push(storm);
  }

  const payload = {
    type: "TropicalStormList",
    confidence_tier: "specialist",
    source: "jtwc",
    feed_url: JTWC_RSS,
    count: storms.length,
    storms,
    basins: ["WP", "IO", "SH"],
    note: "JTWC products intended for US Government use; cite JTWC; not a WMO RSMC substitute. EPAC/CPAC skipped — use nhc_storms.",
  };

  if (includeAdvisories || includeInvests) {
    const namedShort = new Set(
      storms.map((st) => String(st.short_id || "").toUpperCase()).filter(Boolean),
    );
    const advisories = [];
    const invests = [];
    for (const feed of advisoryFeeds.values()) {
      const res = await httpGet(feed.url, {
        accept: "text/plain, */*",
        headers: { "User-Agent": JTWC_UA },
      });
      const summary = res.ok ? String(res.text).replace(/\s+/g, " ").trim().slice(0, 400) : null;
      if (includeAdvisories) {
        advisories.push({
          basin: feed.basin,
          title: feed.rssTitle || feed.title,
          url: feed.url,
          pubDate: feed.pubDate || null,
          summary: res.ok ? summary : `HTTP ${res.status}`,
        });
      }
      if (includeInvests && res.ok) {
        for (const inv of parseJtwcInvests(res.text, { url: feed.url, basin: feed.basin, pubDate: feed.pubDate })) {
          if (namedShort.has(inv.id)) continue;
          invests.push(inv);
        }
      }
    }
    if (includeAdvisories) {
      payload.advisories = advisories;
      payload.advisory_count = advisories.length;
    }
    if (includeInvests) {
      payload.storms = storms.concat(invests);
      payload.count = payload.storms.length;
      payload.invest_count = invests.length;
    }
  }

  return okPayload(payload);
}

function slimXrayRow(r) {
  if (!r) return null;
  return {
    time_tag: r.time_tag ?? null,
    flux: r.flux ?? null,
    energy: r.energy ?? null,
    satellite: r.satellite ?? null,
  };
}

function summarizeSwpcEvents(arr, limit) {
  const events = Array.isArray(arr) ? arr : [];
  const byType = {};
  for (const e of events) {
    const t = e?.type || "UNK";
    byType[t] = (byType[t] || 0) + 1;
  }
  const recent_flares = events
    .filter((e) => /^(FLA|XRA)$/i.test(e?.type || ""))
    .slice(0, limit)
    .map((e) => ({
      type: e.type ?? null,
      observatory: e.observatory ?? null,
      begin: e.begin_datetime ?? null,
      max: e.max_datetime ?? null,
      class: e.particulars1 ?? null,
      location: e.location || null,
      frequency: e.frequency || null,
      region: e.region ?? null,
    }));
  return {
    count: events.length,
    by_type: byType,
    recent_flares,
    note: "Summarized edited_events.json; full array is not dumped.",
  };
}

function summarizeGoesXrays(arr) {
  const rows = Array.isArray(arr) ? arr : [];
  const longBand = "0.1-0.8nm";
  const shortBand = "0.05-0.4nm";
  const longs = rows.filter((r) => r?.energy === longBand);
  const shorts = rows.filter((r) => r?.energy === shortBand);
  const last = (a) => (a.length ? a[a.length - 1] : null);
  const peak = (a) =>
    a.reduce((best, r) => (!best || Number(r.flux) > Number(best.flux) ? r : best), null);
  return {
    satellite: last(longs)?.satellite ?? last(shorts)?.satellite ?? last(rows)?.satellite ?? null,
    sample_count: rows.length,
    long: { energy: longBand, latest: slimXrayRow(last(longs)), peak: slimXrayRow(peak(longs)) },
    short: { energy: shortBand, latest: slimXrayRow(last(shorts)), peak: slimXrayRow(peak(shorts)) },
    recent_long: longs.slice(-5).map(slimXrayRow),
    note: "GOES xrays-6-hour sampled (latest/peak); full series is not dumped.",
  };
}

async function handleSwpcSnapshot(args) {
  const includeAlerts = args.include_alerts !== false;
  const includeIndices = boolArg(args.include_indices, false);
  const includeAurora = boolArg(args.include_aurora, false);
  const includeIcao = boolArg(args.include_icao, false);
  const includeEvents = boolArg(args.include_events, false);
  const includeXrays = boolArg(args.include_xrays, false);
  const includeKp3h = boolArg(args.include_kp_3h, false);
  const includeFlux = boolArg(args.include_flux, false);
  const fetches = [
    httpGet("https://services.swpc.noaa.gov/products/noaa-scales.json", {
      accept: "application/json",
      as: "json",
    }),
    includeAlerts
      ? httpGet("https://services.swpc.noaa.gov/products/alerts.json", {
          accept: "application/json",
          as: "json",
        })
      : Promise.resolve({ ok: true, json: [], status: 200 }),
  ];
  if (includeIndices) {
    fetches.push(
      httpGet("https://services.swpc.noaa.gov/json/planetary_k_index_1m.json", {
        accept: "application/json",
        as: "json",
      }),
      httpGet("https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json", {
        accept: "application/json",
        as: "json",
      }),
      httpGet("https://services.swpc.noaa.gov/json/f107_cm_flux.json", {
        accept: "application/json",
        as: "json",
      }),
    );
  }
  if (includeAurora) {
    fetches.push(
      httpGet("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", {
        accept: "application/json",
        as: "json",
        timeout: 30_000,
      }),
    );
  }
  if (includeIcao) {
    fetches.push(
      httpGet("https://services.swpc.noaa.gov/json/icao-space-weather-advisories.json", {
        accept: "application/json",
        as: "json",
      }),
    );
  }
  if (includeEvents) {
    fetches.push(
      httpGet("https://services.swpc.noaa.gov/json/edited_events.json", {
        accept: "application/json",
        as: "json",
        timeout: 30_000,
      }),
    );
  }
  if (includeXrays) {
    fetches.push(
      httpGet("https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json", {
        accept: "application/json",
        as: "json",
      }),
    );
  }
  if (includeKp3h) {
    fetches.push(
      httpGet("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", {
        accept: "application/json",
        as: "json",
      }),
    );
  }
  if (includeFlux) {
    fetches.push(
      httpGet("https://services.swpc.noaa.gov/json/solar-radio-flux.json", {
        accept: "application/json",
        as: "json",
      }),
    );
  }
  const results = await Promise.all(fetches);
  const scalesRes = results[0];
  const alertsRes = results[1];
  let idx = 2;
  const kpNowRes = includeIndices ? results[idx++] : null;
  const kpFcRes = includeIndices ? results[idx++] : null;
  const fluxRes = includeIndices ? results[idx++] : null;
  const auroraRes = includeAurora ? results[idx++] : null;
  const icaoRes = includeIcao ? results[idx++] : null;
  const eventsRes = includeEvents ? results[idx++] : null;
  const xraysRes = includeXrays ? results[idx++] : null;
  const kp3hRes = includeKp3h ? results[idx++] : null;
  const fluxSummaryRes = includeFlux ? results[idx++] : null;

  if (!scalesRes.ok || !scalesRes.json) {
    return errPayload("http_error", `SWPC scales failed HTTP ${scalesRes.status}`, {
      status: scalesRes.status,
    });
  }
  const rawScales = scalesRes.json;
  const scales = {
    current: rawScales["0"] ?? rawScales[0] ?? null,
    forecast_1: rawScales["1"] ?? rawScales[1] ?? null,
    forecast_2: rawScales["2"] ?? rawScales[2] ?? null,
  };
  let alerts = [];
  if (includeAlerts) {
    if (!alertsRes.ok) {
      return errPayload("http_error", `SWPC alerts failed HTTP ${alertsRes.status}`, {
        status: alertsRes.status,
      });
    }
    const limit = clamp(num(args.alert_limit, 10), 1, 50);
    alerts = Array.isArray(alertsRes.json) ? alertsRes.json.slice(0, limit) : [];
  }
  const snap = toSpaceWeatherSnapshot({ scales, alerts });
  if (includeIndices) {
    const kpNowArr = Array.isArray(kpNowRes?.json) ? kpNowRes.json : [];
    const kpFcArr = Array.isArray(kpFcRes?.json) ? kpFcRes.json : [];
    const fluxArr = Array.isArray(fluxRes?.json) ? fluxRes.json : [];
    snap.indices = {
      kp_now: kpNowArr.length ? kpNowArr[kpNowArr.length - 1] : null,
      kp_forecast: kpFcArr.slice(-24),
      flux_10cm: fluxArr.slice(0, 4),
      errors: {
        kp_now: kpNowRes?.ok ? null : `HTTP ${kpNowRes?.status}`,
        kp_forecast: kpFcRes?.ok ? null : `HTTP ${kpFcRes?.status}`,
        flux_10cm: fluxRes?.ok ? null : `HTTP ${fluxRes?.status}`,
      },
    };
  }
  if (includeAurora) {
    snap.aurora = auroraRes?.ok ? summarizeOvation(auroraRes.json) : { error: `HTTP ${auroraRes?.status}` };
  }
  if (includeIcao) {
    if (!icaoRes?.ok) {
      snap.icao_advisories = { error: `HTTP ${icaoRes?.status}` };
    } else {
      const arr = Array.isArray(icaoRes.json) ? icaoRes.json : icaoRes.json ? [icaoRes.json] : [];
      snap.icao_advisories = arr.slice(0, 20);
      snap.icao_count = arr.length;
    }
  }
  if (includeEvents) {
    snap.events = eventsRes?.ok
      ? summarizeSwpcEvents(eventsRes.json, clamp(num(args.event_limit, 20), 1, 50))
      : { error: `HTTP ${eventsRes?.status}` };
  }
  if (includeXrays) {
    snap.xrays = xraysRes?.ok ? summarizeGoesXrays(xraysRes.json) : { error: `HTTP ${xraysRes?.status}` };
  }
  if (includeKp3h) {
    if (!kp3hRes?.ok || !Array.isArray(kp3hRes.json)) {
      snap.kp_3h = { error: `HTTP ${kp3hRes?.status}` };
    } else {
      const rows = kp3hRes.json.filter((r) => r && r.time_tag);
      const latest = rows.length ? rows[rows.length - 1] : null;
      snap.kp_3h = {
        latest: latest
          ? {
              time_tag: latest.time_tag ?? null,
              Kp: latest.Kp ?? latest.kp ?? null,
              a_running: latest.a_running ?? null,
              station_count: latest.station_count ?? null,
            }
          : null,
        recent: rows.slice(-8).map((r) => ({
          time_tag: r.time_tag ?? null,
          Kp: r.Kp ?? r.kp ?? null,
        })),
        sample_count: rows.length,
        note: "Official NOAA 3-hour planetary Kp (noaa-planetary-k-index.json).",
      };
    }
  }
  if (includeFlux) {
    if (!fluxSummaryRes?.ok) {
      snap.flux_summary = { error: `HTTP ${fluxSummaryRes?.status}` };
    } else {
      const arr = Array.isArray(fluxSummaryRes.json) ? fluxSummaryRes.json : [];
      const last = arr.length ? arr[arr.length - 1] : null;
      snap.flux_summary = {
        latest: last,
        sample_count: arr.length,
        note: "SWPC solar-radio-flux.json latest sample, not the full series.",
      };
    }
  }
  return okPayload(snap);
}

async function handleMeteoalarm(args) {
  if (!present(args.country)) {
    return errPayload(
      "invalid_arguments",
      "country is required (e.g. germany, france, united-kingdom). Europe-wide Atom is not supported.",
    );
  }
  const country = meteoalarmCountrySlug(args.country);
  if (country === "europe" || country === "all") {
    return errPayload(
      "invalid_arguments",
      "MeteoAlarm Europe-wide Atom returns 404. Pass a per-country slug (germany, france, united-kingdom, …).",
    );
  }
  const url = `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-${country}`;
  const res = await httpGet(url, { accept: "*/*" });
  if (res.status === 404) {
    return errPayload("not_found", `No MeteoAlarm Atom feed for country '${country}'`, { url });
  }
  if (!res.ok) {
    return errPayload("http_error", `MeteoAlarm failed HTTP ${res.status}`, { status: res.status, url });
  }
  const wantCap =
    String(args.format || "").toLowerCase() === "cap" ||
    String(args.type || "").toLowerCase() === "application/cap+xml";
  const entries = atomEntries(res.text);
  const alerts = [];
  const capLimit = wantCap ? clamp(num(args.limit, 5), 1, 10) : clamp(num(args.limit, 50), 1, 200);
  for (const entry of entries) {
    if (alerts.length >= capLimit) break;
    const title = xmlText(entry, "title");
    const summary = xmlText(entry, "summary") || xmlText(entry, "content");
    const id = xmlText(entry, "id");
    const updated = xmlText(entry, "updated") || xmlText(entry, "published");
    const link = xmlAttr(entry, "link", "href");
    const capHref = xmlLinkHrefs(entry, "application/cap+xml")[0] || null;
    const severity = xmlText(entry, "cap:severity") || xmlText(entry, "severity");
    const urgency = xmlText(entry, "cap:urgency") || xmlText(entry, "urgency");
    const certainty = xmlText(entry, "cap:certainty") || xmlText(entry, "certainty");
    const event = xmlText(entry, "cap:event") || xmlText(entry, "event") || title;
    const areaDesc = xmlText(entry, "cap:areaDesc") || xmlText(entry, "areaDesc");
    const onset = xmlText(entry, "cap:onset") || xmlText(entry, "onset") || xmlText(entry, "effective");
    const ends = xmlText(entry, "cap:expires") || xmlText(entry, "expires");
    let extra = { country };
    let desc = summary;
    let ev = event;
    let sev = severity;
    let urg = urgency;
    let cert = certainty;
    let area = areaDesc;
    let on = onset;
    let en = ends;
    let headline = title;
    let alertUrl = capHref || link;
    if (wantCap && capHref) {
      const capRes = await httpGet(capHref, { accept: "application/cap+xml, application/xml, */*" });
      if (capRes.ok) {
        const info = (capRes.text.match(/<info\b[\s\S]*?<\/info>/i) || [capRes.text])[0];
        ev = xmlText(info, "event") || ev;
        headline = xmlText(info, "headline") || headline;
        sev = xmlText(info, "severity") || sev;
        urg = xmlText(info, "urgency") || urg;
        cert = xmlText(info, "certainty") || cert;
        area = xmlText(info, "areaDesc") || area;
        on = xmlText(info, "onset") || xmlText(info, "effective") || on;
        en = xmlText(info, "expires") || en;
        desc = xmlText(info, "description") || desc;
        extra = { ...extra, format: "cap", cap_url: capHref };
      } else {
        extra = { ...extra, format: "cap", cap_url: capHref, cap_error: `HTTP ${capRes.status}` };
      }
    }
    alerts.push(
      toOfficialAlert({
        id,
        event: ev,
        headline,
        severity: sev,
        urgency: urg,
        certainty: cert,
        areaDesc: area,
        onset: on,
        ends: en,
        sent: updated,
        description: desc,
        instruction: null,
        url: alertUrl,
        source: "meteoalarm",
        confidence_tier: "official",
        extra,
      }),
    );
  }
  return okPayload({
    type: "OfficialAlertList",
    confidence_tier: "official",
    source: "meteoalarm",
    country,
    format: wantCap ? "cap" : "atom",
    count: alerts.length,
    total_entries: entries.length,
    alerts,
  });
}

async function handleFirmsHotspots(args) {
  const mode = String(args.mode || args.format || "csv").toLowerCase();
  if (!["csv", "kml", "status", "availability", "missing_data"].includes(mode)) {
    return errPayload("invalid_arguments", "mode must be csv | kml | status | availability | missing_data");
  }

  if (mode === "kml") {
    const lat = num(args.lat, DEFAULT_LAT);
    const lon = num(args.lon, DEFAULT_LON);
    const region = present(args.region) ? String(args.region) : firmsRegionFromPoint(lat, lon);
    const dateSpan = firmsDateSpan(args.days, args.date_span);
    const sensor = firmsKmlSensor(args.satellite || args.sensor);
    const url = `https://firms.modaps.eosdis.nasa.gov/api/kml_fire_footprints/${encodeURIComponent(region)}/${encodeURIComponent(dateSpan)}/${encodeURIComponent(sensor)}`;
    const res = await httpGet(url, { accept: "*/*", timeout: 30_000 });
    if (!res.ok) {
      return errPayload("http_error", `FIRMS kml footprints failed HTTP ${res.status}`, {
        status: res.status,
        url,
      });
    }
    const ct = (res.contentType || "").toLowerCase();
    const looksXml = /^\s*</.test(res.text) && /kml|xml/i.test(ct + res.text.slice(0, 200));
    return okPayload({
      type: "FireFootprintKml",
      confidence_tier: "overlay",
      source: "firms",
      mode: "kml",
      region,
      date_span: dateSpan,
      sensor,
      url: res.url || url,
      content_type: res.contentType || null,
      bytes: res.bytes,
      binary: !looksXml,
      kml_preview: looksXml ? res.text.slice(0, 1500) : null,
      note: looksXml
        ? "Keyless KML fire footprint (no MAP_KEY)."
        : "Keyless KMZ/KML fire footprint. Binary KMZ is not inlined; use the url.",
    });
  }

  const keyed = requireFirmsKey();
  if (keyed.error) return keyed.error;
  const key = keyed.key;

  if (mode === "missing_data") {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/missing_data/${encodeURIComponent(key)}`;
    const res = await httpGet(url, { accept: "text/csv, text/plain" });
    if (!res.ok) {
      return errPayload("http_error", `FIRMS missing_data failed HTTP ${res.status}`, {
        status: res.status,
        detail: res.text?.slice(0, 300),
      });
    }
    if (/invalid map_key/i.test(res.text)) {
      return errPayload("config_error", "FIRMS rejected MAP_KEY (Invalid MAP_KEY).", {
        detail: res.text.slice(0, 200),
      });
    }
    const rows = parseCsv(res.text);
    return okPayload({
      type: "FirmsMissingData",
      confidence_tier: "overlay",
      source: "firms",
      mode: "missing_data",
      count: rows.length,
      rows: rows.slice(0, 200),
    });
  }

  if (mode === "status") {
    const url = `https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=${encodeURIComponent(key)}`;
    const res = await httpGet(url, { accept: "application/json, */*", as: "json" });
    if (!res.ok) {
      return errPayload("http_error", `FIRMS mapkey_status failed HTTP ${res.status}`, {
        status: res.status,
        detail: res.text?.slice(0, 300),
      });
    }
    return okPayload({
      type: "FirmsStatus",
      confidence_tier: "overlay",
      source: "firms",
      mode: "status",
      data: res.json ?? { raw: res.text.slice(0, 2000) },
    });
  }

  if (mode === "availability") {
    const source = String(args.satellite || "all");
    const url = `https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/${encodeURIComponent(key)}/${encodeURIComponent(source)}`;
    const res = await httpGet(url, { accept: "text/csv, text/plain" });
    if (!res.ok) {
      return errPayload("http_error", `FIRMS data_availability failed HTTP ${res.status}`, {
        status: res.status,
        detail: res.text?.slice(0, 300),
      });
    }
    if (/invalid map_key/i.test(res.text)) {
      return errPayload("config_error", "FIRMS rejected MAP_KEY (Invalid MAP_KEY).", {
        detail: res.text.slice(0, 200),
      });
    }
    const rows = parseCsv(res.text);
    return okPayload({
      type: "FirmsAvailability",
      confidence_tier: "overlay",
      source: "firms",
      mode: "availability",
      satellite: source,
      count: rows.length,
      rows: rows.slice(0, 200),
    });
  }

  const hasBox = [args.west, args.south, args.east, args.north].every((v) => present(v));
  let west, south, east, north, radius_km = null;
  if (hasBox) {
    west = num(args.west);
    south = num(args.south);
    east = num(args.east);
    north = num(args.north);
  } else {
    const lat = num(args.lat, DEFAULT_LAT);
    const lon = num(args.lon, DEFAULT_LON);
    const box = bboxFromPoint(lat, lon, args.radius_km);
    west = box.west;
    south = box.south;
    east = box.east;
    north = box.north;
    radius_km = box.radius_km;
  }
  if (!(west < east && south < north)) {
    return errPayload("invalid_arguments", "Bounding box requires west < east and south < north");
  }
  const dayRange = clamp(num(args.days, 1), 1, 5);
  const source = String(args.satellite || "VIIRS_SNPP_NRT");
  const area = `${west},${south},${east},${north}`;
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${encodeURIComponent(source)}/${area}/${dayRange}`;
  const res = await httpGet(url, { accept: "text/csv, text/plain" });
  if (!res.ok) {
    return errPayload("http_error", `FIRMS area API failed HTTP ${res.status}`, {
      status: res.status,
      detail: res.text?.slice(0, 300),
    });
  }
  if (/invalid map_key/i.test(res.text)) {
    return errPayload("config_error", "FIRMS rejected MAP_KEY (Invalid MAP_KEY).", {
      detail: res.text.slice(0, 200),
    });
  }
  if (/^Invalid /i.test(res.text.trim())) {
    return errPayload("invalid_arguments", res.text.trim().slice(0, 300));
  }
  const rows = parseCsv(res.text);
  const limit = clamp(num(args.limit, 100), 1, 500);
  const hotspots = rows.slice(0, limit).map(toFireHotspot);
  return okPayload({
    type: "FireHotspotList",
    confidence_tier: "overlay",
    source: "firms",
    mode: "csv",
    satellite: source,
    bbox: { west, south, east, north, radius_km },
    days: dayRange,
    count: hotspots.length,
    hotspots,
  });
}

async function handleEonet(args) {
  const mode = String(args.mode || "").toLowerCase();
  if (mode === "categories") {
    const url = "https://eonet.gsfc.nasa.gov/api/v3/categories";
    const res = await httpGet(url, { accept: "application/json", as: "json" });
    if (!res.ok || !res.json) {
      return errPayload("http_error", `EONET categories failed HTTP ${res.status}`, { status: res.status });
    }
    const categories = (res.json.categories ?? []).filter((c) => !eonetIsQuake([c]));
    return okPayload({
      type: "NaturalEventList",
      confidence_tier: "catalog",
      source: "eonet",
      mode: "categories",
      count: categories.length,
      categories: categories.map((c) => ({ id: c.id ?? null, title: c.title ?? null })),
    });
  }
  if (mode === "sources") {
    const url = "https://eonet.gsfc.nasa.gov/api/v3/sources";
    const res = await httpGet(url, { accept: "application/json", as: "json" });
    if (!res.ok || !res.json) {
      return errPayload("http_error", `EONET sources failed HTTP ${res.status}`, { status: res.status });
    }
    const sources = res.json.sources ?? [];
    return okPayload({
      type: "NaturalEventList",
      confidence_tier: "catalog",
      source: "eonet",
      mode: "sources",
      count: sources.length,
      sources: sources.map((s) => ({ id: s.id ?? null, title: s.title ?? null, source: s.source ?? null })),
    });
  }
  if (present(args.id) || present(args.eventid)) {
    const id = String(args.id ?? args.eventid).trim();
    const url = `https://eonet.gsfc.nasa.gov/api/v3/events/${encodeURIComponent(id)}`;
    const res = await httpGet(url, { accept: "application/json", as: "json" });
    if (!res.ok || !res.json) {
      return errPayload("http_error", `EONET event ${id} failed HTTP ${res.status}`, { status: res.status });
    }
    const ev = res.json;
    if (eonetIsQuake(ev.categories)) {
      return errPayload("invalid_arguments", "EONET earthquakes are excluded; use usgs_quakes instead.");
    }
    const events = [toNaturalEvent(ev)];
    return okPayload({
      type: "NaturalEventList",
      confidence_tier: "catalog",
      source: "eonet",
      mode: "id",
      eventid: id,
      count: events.length,
      events,
    });
  }
  const limit = clamp(num(args.limit, 20), 1, 100);
  const status = String(args.status || "open");
  const format = String(args.format || "json").toLowerCase();
  if (!["json", "geojson"].includes(format)) {
    return errPayload("invalid_arguments", "format must be json | geojson");
  }
  const params = new URLSearchParams({ limit: String(limit), status });
  const category = present(args.category) ? String(args.category) : present(args.categories) ? String(args.categories) : null;
  if (category && /earthquake/i.test(category)) {
    return errPayload(
      "invalid_arguments",
      "EONET earthquakes category is excluded from this plugin; use usgs_quakes instead.",
    );
  }
  if (category) params.set("category", category);
  if (present(args.source) || present(args.sources)) {
    params.set("source", String(args.source ?? args.sources));
  }
  if (present(args.days)) params.set("days", String(clamp(num(args.days, 30), 1, 365)));
  if (present(args.bbox)) params.set("bbox", String(args.bbox));
  else if ([args.west, args.north, args.east, args.south].every((v) => present(v))) {
    params.set("bbox", `${num(args.west)},${num(args.north)},${num(args.east)},${num(args.south)}`);
  }
  const path = format === "geojson" ? "/events/geojson" : "/events";
  const url = `https://eonet.gsfc.nasa.gov/api/v3${path}?${params}`;
  const res = await httpGet(url, { accept: "application/json", as: "json" });
  if (!res.ok || !res.json) {
    return errPayload("http_error", `EONET failed HTTP ${res.status}`, { status: res.status });
  }

  let events;
  if (format === "geojson") {
    const features = (res.json.features ?? []).filter((f) => !eonetIsQuake(f.properties?.categories));
    events = features.map((f) => {
      const p = f.properties ?? {};
      const coords = f.geometry?.coordinates;
      return toNaturalEvent({
        id: p.id,
        title: p.title,
        categories: p.categories,
        link: p.link,
        geometry: [{ date: p.date, coordinates: coords }],
      });
    });
    events = events.slice(0, limit);
  } else {
    events = (res.json.events ?? [])
      .filter((e) => !eonetIsQuake(e.categories))
      .map(toNaturalEvent)
      .slice(0, limit);
  }

  const payload = {
    type: "NaturalEventList",
    confidence_tier: "catalog",
    source: "eonet",
    format,
    count: events.length,
    events,
  };

  if (boolArg(args.include_layers, false)) {
    const layerPath = category
      ? `https://eonet.gsfc.nasa.gov/api/v3/layers/${encodeURIComponent(category)}`
      : "https://eonet.gsfc.nasa.gov/api/v3/layers";
    const layersRes = await httpGet(layerPath, { accept: "application/json", as: "json" });
    if (!layersRes.ok) {
      payload.layers_error = `HTTP ${layersRes.status}`;
    } else {
      const cats = layersRes.json?.categories ?? layersRes.json?.layers ?? [];
      payload.layers = (Array.isArray(cats) ? cats : []).slice(0, 30).map((c) => ({
        id: c.id ?? null,
        title: c.title ?? c.name ?? null,
        layers: (c.layers ?? []).slice(0, 8).map((l) => ({
          name: l.name ?? null,
          serviceTypeId: l.serviceTypeId ?? null,
          serviceUrl: l.serviceUrl ?? null,
        })),
      }));
    }
  }
  return okPayload(payload);
}

async function handleGdacs(args) {
  const mode = String(args.mode || (boolArg(args.use_search, false) ? "search" : "rss_24h")).toLowerCase();
  if (!["rss_24h", "rss_full", "events4app", "search"].includes(mode)) {
    return errPayload("invalid_arguments", "mode must be rss_24h | rss_full | events4app | search");
  }
  const limit = clamp(num(args.limit, 30), 1, 100);

  if (mode === "rss_24h" || mode === "rss_full") {
    const url = mode === "rss_full" ? "https://www.gdacs.org/xml/rss.xml" : "https://www.gdacs.org/xml/rss_24h.xml";
    const res = await httpGet(url, { accept: "*/*" });
    if (!res.ok) {
      return errPayload("http_error", `GDACS RSS failed HTTP ${res.status}`, { status: res.status, mode });
    }
    const events = parseGdacsRss(res.text).slice(0, limit);
    return okPayload({
      type: "ImpactAlertList",
      confidence_tier: "specialist",
      source: "gdacs",
      mode,
      count: events.length,
      events,
    });
  }

  if (mode === "events4app") {
    const url = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/events4app";
    const res = await httpGet(url, { accept: "application/json, application/geo+json, */*", as: "json", timeout: 90_000 });
    if (!res.ok) {
      return errPayload("http_error", `GDACS events4app failed HTTP ${res.status}`, { status: res.status });
    }
    const features = res.json?.features ?? res.json?.events ?? (Array.isArray(res.json) ? res.json : []);
    const events = features.slice(0, limit).map(mapGdacsFeature);
    return okPayload({
      type: "ImpactAlertList",
      confidence_tier: "specialist",
      source: "gdacs",
      mode: "events4app",
      count: events.length,
      events,
    });
  }

  const params = new URLSearchParams();
  if (present(args.alertlevel)) params.set("alertlevel", String(args.alertlevel));
  const from = args.fromDate ?? args.fromdate ?? args.fromdatetime;
  const to = args.toDate ?? args.todate ?? args.todatetime;
  if (present(from)) params.set("fromDate", String(from));
  if (present(to)) params.set("toDate", String(to));
  if (present(args.eventlist)) params.set("eventlist", String(args.eventlist));
  if (present(args.pagenumber) || present(args.page)) {
    params.set("pagenumber", String(clamp(num(args.pagenumber, args.page ?? 1), 1, 50)));
  }
  if (present(args.pagesize)) {
    params.set("pagesize", String(clamp(num(args.pagesize, 20), 1, 100)));
  }
  const url = `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?${params}`;
  const res = await httpGet(url, { accept: "application/json", as: "json", timeout: 90_000 });
  if (!res.ok) {
    return errPayload("http_error", `GDACS SEARCH failed HTTP ${res.status}`, {
      status: res.status,
      hint: "SEARCH can be slow; use mode=rss_24h or rss_full instead.",
    });
  }
  const features = res.json?.features ?? res.json?.events ?? (Array.isArray(res.json) ? res.json : []);
  const events = features.slice(0, limit).map(mapGdacsFeature);
  return okPayload({
    type: "ImpactAlertList",
    confidence_tier: "specialist",
    source: "gdacs",
    mode: "search",
    search_url: url,
    count: events.length,
    events,
  });
}

async function handleGvpWeekly(args) {
  const mode = String(args.mode || "weekly").toLowerCase();
  if (!["weekly", "lookup"].includes(mode)) {
    return errPayload("invalid_arguments", "mode must be weekly | lookup");
  }

  if (mode === "lookup") {
    const maxFeatures = clamp(num(args.maxFeatures, args.limit ?? 50), 1, 100);
    const params = new URLSearchParams({
      service: "WFS",
      version: "1.0.0",
      request: "GetFeature",
      typeName: "GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes",
      outputFormat: "application/json",
      maxFeatures: String(maxFeatures),
    });
    const cqlParts = [];
    if (present(args.name)) {
      const n = String(args.name).replace(/'/g, "''");
      cqlParts.push(`Volcano_Name ILIKE '%${n}%'`);
    }
    if (present(args.country)) {
      const c = String(args.country).replace(/'/g, "''");
      cqlParts.push(`Country ILIKE '%${c}%'`);
    }
    if (cqlParts.length) params.set("CQL_FILTER", cqlParts.join(" AND "));
    const url = `https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?${params}`;
    const res = await httpGet(url, { accept: "application/json", as: "json", timeout: 30_000 });
    if (!res.ok || !res.json?.features) {
      return errPayload("http_error", `GVP WFS lookup failed HTTP ${res.status}`, {
        status: res.status,
        detail: res.text?.slice(0, 300),
      });
    }
    const nameNeedle = present(args.name) ? String(args.name).toLowerCase() : null;
    const countryNeedle = present(args.country) ? String(args.country).toLowerCase() : null;
    const volcanoes = res.json.features
      .filter((f) => {
        const p = f.properties ?? {};
        if (nameNeedle && !String(p.Volcano_Name || p.VolcanoName || "").toLowerCase().includes(nameNeedle)) {
          return false;
        }
        if (countryNeedle && !String(p.Country || "").toLowerCase().includes(countryNeedle)) return false;
        return true;
      })
      .map((f) => {
        const p = f.properties ?? {};
        const c = f.geometry?.coordinates ?? [];
        return {
          type: "Volcano",
          confidence_tier: "catalog",
          source: "gvp",
          id: p.Volcano_Number ?? f.id ?? null,
          name: p.Volcano_Name ?? null,
          country: p.Country ?? null,
          region: p.Region ?? null,
          volcano_type: p.Primary_Volcano_Type ?? null,
          landform: p.Volcanic_Landform ?? null,
          last_eruption_year: p.Last_Eruption_Year ?? null,
          lon: c[0] ?? null,
          lat: c[1] ?? null,
          elevation_m: p.Elevation ?? null,
        };
      });
    return okPayload({
      type: "VolcanoList",
      confidence_tier: "catalog",
      source: "gvp",
      mode: "lookup",
      count: volcanoes.length,
      volcanoes,
    });
  }

  const url = "https://volcano.si.edu/news/WeeklyVolcanoCAP.xml";
  const res = await httpGet(url, { accept: "*/*" });
  if (!res.ok) {
    const rssUrl = "https://volcano.si.edu/news/WeeklyVolcanoRSS.xml";
    const rss = await httpGet(rssUrl, { accept: "*/*" });
    if (!rss.ok) {
      return errPayload("http_error", `GVP weekly failed HTTP ${res.status}/${rss.status}`);
    }
    const items = rssItems(rss.text);
    const alerts = items.map((item) =>
      toOfficialAlert({
        id: xmlText(item, "guid") || xmlText(item, "link"),
        event: "Volcanic Activity",
        headline: xmlText(item, "title"),
        severity: null,
        urgency: null,
        certainty: null,
        areaDesc: null,
        onset: xmlText(item, "pubDate"),
        ends: null,
        sent: xmlText(item, "pubDate"),
        description: xmlText(item, "description"),
        instruction: null,
        url: xmlText(item, "link"),
        source: "gvp",
        confidence_tier: "specialist",
      }),
    );
    const limit = clamp(num(args.limit, args.maxFeatures ?? (alerts.length || 50)), 1, 200);
    const sliced = alerts.slice(0, limit);
    return okPayload({
      type: "OfficialAlertList",
      confidence_tier: "specialist",
      source: "gvp",
      mode: "weekly",
      format: "rss",
      count: sliced.length,
      total: alerts.length,
      alerts: sliced,
    });
  }
  const infoBlocks = [];
  const ir = /<info\b[\s\S]*?<\/info>/gi;
  let im;
  while ((im = ir.exec(res.text))) infoBlocks.push(im[0]);
  const alertBlocks = [];
  const re = /<alert\b[\s\S]*?<\/alert>/gi;
  let m;
  while ((m = re.exec(res.text))) alertBlocks.push(m[0]);
  const envelope = alertBlocks[0] || res.text;
  const blocks = infoBlocks.length ? infoBlocks : alertBlocks.length ? alertBlocks : [res.text];
  const alerts = blocks.map((block, i) =>
    toOfficialAlert({
      id: xmlText(block, "identifier") || xmlText(envelope, "identifier") || `gvp-${i}`,
      event: xmlText(block, "event") || "Volcanic Activity",
      headline: xmlText(block, "headline") || xmlText(block, "title"),
      severity: xmlText(block, "severity"),
      urgency: xmlText(block, "urgency"),
      certainty: xmlText(block, "certainty"),
      areaDesc: xmlText(block, "areaDesc"),
      onset: xmlText(block, "onset") || xmlText(block, "effective"),
      ends: xmlText(block, "expires"),
      sent: xmlText(block, "sent") || xmlText(envelope, "sent"),
      description: xmlText(block, "description"),
      instruction: xmlText(block, "instruction"),
      url: xmlText(block, "web") || "https://volcano.si.edu/reports_weekly.cfm",
      source: "gvp",
      confidence_tier: "specialist",
    }),
  );
  const limit = clamp(num(args.limit, args.maxFeatures ?? (alerts.length || 50)), 1, 200);
  const sliced = alerts.slice(0, limit);
  return okPayload({
    type: "OfficialAlertList",
    confidence_tier: "specialist",
    source: "gvp",
    mode: "weekly",
    format: "cap",
    count: sliced.length,
    total: alerts.length,
    alerts: sliced,
  });
}

async function handleOpenMeteo(args) {
  let lat = num(args.lat, DEFAULT_LAT);
  let lon = num(args.lon, DEFAULT_LON);
  let place = null;
  if (present(args.name)) {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(String(args.name))}&count=1`;
    const geo = await httpGet(geoUrl, { accept: "application/json", as: "json" });
    const hit = geo.json?.results?.[0];
    if (!geo.ok || !hit) {
      return errPayload("not_found", `Open-Meteo geocoding found no result for name='${args.name}'`, {
        status: geo.status,
      });
    }
    lat = hit.latitude;
    lon = hit.longitude;
    place = [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ");
  }
  const mode = String(args.mode || "forecast").toLowerCase();
  if (!["forecast", "air_quality", "flood"].includes(mode)) {
    return errPayload("invalid_arguments", "mode must be forecast | air_quality | flood");
  }
  const days = clamp(num(args.forecast_days, mode === "flood" ? 7 : 3), 1, mode === "flood" ? 92 : 16);
  const wantHourly = boolArg(args.hourly, false);

  if (mode === "air_quality") {
    let aqUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=european_aqi,us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,uv_index` +
      `&timezone=auto&forecast_days=${clamp(days, 1, 7)}`;
    if (wantHourly) {
      aqUrl += `&hourly=pm10,pm2_5,european_aqi,us_aqi,ozone,nitrogen_dioxide`;
    }
    const aq = await httpGet(aqUrl, { accept: "application/json", as: "json" });
    if (!aq.ok || !aq.json) {
      return errPayload("http_error", `Open-Meteo air quality failed HTTP ${aq.status}`, { status: aq.status });
    }
    const extra = {
      note: "Open-Meteo air-quality overlay (CAMS). Not an official national alert. See TERMS.md.",
      mode: "air_quality",
      current: aq.json.current ?? null,
    };
    if (wantHourly && aq.json.hourly) {
      const h = aq.json.hourly;
      const ht = h.time ?? [];
      extra.hourly = ht.slice(0, clamp(days * 24, 1, 72)).map((t, i) => ({
        time: t,
        pm10: h.pm10?.[i] ?? null,
        pm2_5: h.pm2_5?.[i] ?? null,
        european_aqi: h.european_aqi?.[i] ?? null,
        us_aqi: h.us_aqi?.[i] ?? null,
        ozone: h.ozone?.[i] ?? null,
        nitrogen_dioxide: h.nitrogen_dioxide?.[i] ?? null,
      }));
    }
    return okPayload(
      toPointForecast({
        lat: aq.json.latitude ?? lat,
        lon: aq.json.longitude ?? lon,
        place,
        timezone: aq.json.timezone ?? null,
        periods: [],
        source: "open-meteo",
        confidence_tier: "overlay",
        extra,
      }),
    );
  }

  if (mode === "flood") {
    const flUrl =
      `https://flood-api.open-meteo.com/v1/flood?latitude=${lat}&longitude=${lon}` +
      `&daily=river_discharge,river_discharge_mean,river_discharge_max,river_discharge_min` +
      `&forecast_days=${days}`;
    const fl = await httpGet(flUrl, { accept: "application/json", as: "json" });
    if (!fl.ok || !fl.json) {
      return errPayload("http_error", `Open-Meteo flood failed HTTP ${fl.status}`, { status: fl.status });
    }
    const d = fl.json.daily ?? {};
    const times = d.time ?? [];
    const periods = times.slice(0, days).map((t, i) =>
      toForecastPeriod({
        number: i + 1,
        name: t,
        startTime: t,
        endTime: t,
        isDaytime: true,
        temperature: null,
        temperatureUnit: null,
        probabilityOfPrecipitation: null,
        windSpeed: null,
        windDirection: null,
        shortForecast:
          d.river_discharge?.[i] != null ? `river_discharge ${d.river_discharge[i]}` : null,
        detailedForecast:
          d.river_discharge_max?.[i] != null ? `max ${d.river_discharge_max[i]}` : null,
      }),
    );
    return okPayload(
      toPointForecast({
        lat: fl.json.latitude ?? lat,
        lon: fl.json.longitude ?? lon,
        place,
        timezone: fl.json.timezone ?? null,
        periods,
        source: "open-meteo",
        confidence_tier: "overlay",
        extra: {
          note: "Open-Meteo flood overlay (GloFAS river discharge). Not an official flood warning. See TERMS.md.",
          mode: "flood",
          daily: {
            time: times.slice(0, days),
            river_discharge: (d.river_discharge ?? []).slice(0, days),
            river_discharge_mean: (d.river_discharge_mean ?? []).slice(0, days),
            river_discharge_max: (d.river_discharge_max ?? []).slice(0, days),
            river_discharge_min: (d.river_discharge_min ?? []).slice(0, days),
          },
        },
      }),
    );
  }

  let url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation` +
    `&timezone=auto&forecast_days=${days}`;
  if (wantHourly) {
    url += `&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m,relative_humidity_2m`;
  }
  const res = await httpGet(url, { accept: "application/json", as: "json" });
  if (!res.ok || !res.json) {
    return errPayload("http_error", `Open-Meteo failed HTTP ${res.status}`, { status: res.status });
  }
  const d = res.json.daily ?? {};
  const times = d.time ?? [];
  const periods = times.map((t, i) =>
    toForecastPeriod({
      number: i + 1,
      name: t,
      startTime: t,
      endTime: t,
      isDaytime: true,
      temperature: d.temperature_2m_max?.[i] ?? null,
      temperatureUnit: "C",
      probabilityOfPrecipitation: { value: d.precipitation_probability_max?.[i] ?? null },
      windSpeed: d.wind_speed_10m_max?.[i] != null ? `${d.wind_speed_10m_max[i]} km/h` : null,
      windDirection: null,
      shortForecast: d.weather_code?.[i] != null ? `weather_code ${d.weather_code[i]}` : null,
      detailedForecast: d.temperature_2m_min?.[i] != null ? `min ${d.temperature_2m_min[i]}°C` : null,
    }),
  );
  const extra = {
    note: "Open-Meteo free non-commercial tier. Not an official national forecast. See TERMS.md.",
    mode: "forecast",
    elevation: res.json.elevation ?? null,
    current: res.json.current ?? null,
  };
  if (wantHourly && res.json.hourly) {
    const h = res.json.hourly;
    const ht = h.time ?? [];
    const cap = clamp(days * 24, 1, 72);
    extra.hourly = ht.slice(0, cap).map((t, i) => ({
      time: t,
      temperature: h.temperature_2m?.[i] ?? null,
      precipitation_probability: h.precipitation_probability?.[i] ?? null,
      weather_code: h.weather_code?.[i] ?? null,
      wind_speed: h.wind_speed_10m?.[i] ?? null,
      relative_humidity: h.relative_humidity_2m?.[i] ?? null,
    }));
  }
  return okPayload(
    toPointForecast({
      lat: res.json.latitude ?? lat,
      lon: res.json.longitude ?? lon,
      place,
      timezone: res.json.timezone ?? null,
      periods,
      source: "open-meteo",
      confidence_tier: "overlay",
      extra,
    }),
  );
}

// ---------------------------------------------------------------------------
// SOURCE_REGISTRY — drives schemas + handlers (different from a flat TOOLS array)
// ---------------------------------------------------------------------------

/**
 * Each source owns its tools. listTools()/callTool() derive from this table.
 * core:true → always registered. optional → WEATHER_OPTIONAL or WEATHER_ENABLE_<SOURCE>.
 * FIRMS is core-registered but key-gated at runtime.
 */
const SOURCE_REGISTRY = [
  {
    id: "nws",
    label: "US National Weather Service (api.weather.gov)",
    core: true,
    confidence_tier: "official",
    tools: [
      {
        name: "nws_forecast",
        description:
          "NWS point forecast via /points then product URL. product=periods (default) | hourly | grid | observation | observations | afd | hwo. periods/hourly → PointForecast; grid → slim GridpointForecast; observation → latest station Observation; observations or history=true → station observation history; afd/hwo → latest NwsTextProduct using CWA as location= (e.g. EWX for Austin; not Kxxx). confidence_tier=official. Default point Austin TX 30.2672,-97.7431.",
        inputSchema: {
          type: "object",
          properties: {
            lat: { type: "number", description: "Latitude (default 30.2672)" },
            lon: { type: "number", description: "Longitude (default -97.7431)" },
            product: {
              type: "string",
              enum: ["periods", "hourly", "grid", "observation", "observations", "afd", "hwo"],
              description: "periods (default) | hourly | grid | observation | observations | afd | hwo",
            },
            history: {
              type: "boolean",
              description: "With product=observation, fetch station /observations history instead of latest (default false)",
            },
            start: { type: "string", description: "Observation history start (ISO)" },
            end: { type: "string", description: "Observation history end (ISO)" },
            limit: { type: "number", description: "Max periods/hourly hours/grid values/history rows (defaults: 14/24/12)" },
          },
        },
        run: handleNwsForecast,
      },
      {
        name: "nws_alerts",
        description:
          "NWS active alerts for a point (lat/lon), state area code, and/or zone. Optional event, status, severity, urgency, certainty, region query params on /alerts/active. mode=types or list_types=true lists /alerts/types. Filters without lat/lon skip the default point. Returns OfficialAlert[] with confidence_tier=official.",
        inputSchema: {
          type: "object",
          properties: {
            lat: { type: "number" },
            lon: { type: "number" },
            area: { type: "string", description: "US state/territory code, e.g. TX" },
            event: { type: "string", description: "NWS event name, e.g. Tornado Warning" },
            zone: { type: "string", description: "UGC zone id, e.g. TXZ192" },
            status: { type: "string", description: "actual | exercise | system | test | draft" },
            severity: { type: "string", description: "NWS severity, e.g. Extreme,Severe" },
            urgency: { type: "string", description: "NWS urgency, e.g. Immediate,Expected" },
            certainty: { type: "string", description: "NWS certainty, e.g. Observed,Likely" },
            region: { type: "string", description: "NWS region (e.g. AL, AT, GL, …)" },
            mode: { type: "string", description: "types lists /alerts/types (default active alerts)" },
            list_types: { type: "boolean", description: "Alias for mode=types (default false)" },
            limit: { type: "number", description: "Max alerts to return (default all, max 500)" },
          },
        },
        run: handleNwsAlerts,
      },
    ],
  },
  {
    id: "usgs",
    label: "USGS Earthquake Hazards",
    core: true,
    confidence_tier: "catalog",
    tools: [
      {
        name: "usgs_quakes",
        description:
          "USGS earthquakes. feed=hour|day|week|month|significant_*|4.5_*|2.5_*|1.0_*|query; eventid for detail/{id}.geojson; meta=count|catalogs|contributors via FDSN. Query extras: endtime, maxmagnitude, updatedafter, bbox, types/eventtype. QuakeEvent includes PAGER alert/mmi/cdi/felt. confidence_tier=catalog.",
        inputSchema: {
          type: "object",
          properties: {
            feed: {
              type: "string",
              description:
                "hour|day|week|month|significant_hour|significant_day|significant_week|significant_month|4.5_*|2.5_*|1.0_*|query",
            },
            eventid: { type: "string", description: "USGS event id for detail GeoJSON" },
            meta: { type: "string", enum: ["count", "catalogs", "contributors"], description: "FDSN metadata method" },
            lat: { type: "number" },
            lon: { type: "number" },
            radius_km: { type: "number", description: "FDSN maxradiuskm (default 500)" },
            minmagnitude: { type: "number" },
            maxmagnitude: { type: "number", description: "FDSN maxmagnitude" },
            limit: { type: "number" },
            starttime: { type: "string", description: "FDSN starttime ISO date" },
            endtime: { type: "string", description: "FDSN endtime ISO date" },
            updatedafter: { type: "string", description: "FDSN updatedafter ISO date" },
            minlatitude: { type: "number", description: "FDSN bbox south" },
            maxlatitude: { type: "number", description: "FDSN bbox north" },
            minlongitude: { type: "number", description: "FDSN bbox west" },
            maxlongitude: { type: "number", description: "FDSN bbox east" },
            west: { type: "number", description: "Bbox alias of minlongitude" },
            south: { type: "number", description: "Bbox alias of minlatitude" },
            east: { type: "number", description: "Bbox alias of maxlongitude" },
            north: { type: "number", description: "Bbox alias of maxlatitude" },
            types: { type: "string", description: "FDSN eventtype (e.g. earthquake)" },
            eventtype: { type: "string", description: "Alias of types" },
          },
        },
        run: handleUsgsQuakes,
      },
    ],
  },
  {
    id: "nhc",
    label: "NOAA National Hurricane Center",
    core: true,
    confidence_tier: "official",
    tools: [
      {
        name: "nhc_storms",
        description:
          "Active tropical cyclones from CurrentStorms.json (discussion/cone/track/bestTrack/graphics URLs attached). include_advisories=true fetches NHC text-product RSS (index-at/ep/cp.xml). include_outlook=true parses gtwo.xml slim items. confidence_tier=official. Not a GIS RSS tool.",
        inputSchema: {
          type: "object",
          properties: {
            include_advisories: {
              type: "boolean",
              description: "If true, attach slim items from NHC basin RSS index-at/ep/cp.xml (default false)",
            },
            include_outlook: {
              type: "boolean",
              description: "If true, attach slim Graphical Tropical Weather Outlook items from gtwo.xml (default false)",
            },
          },
        },
        run: handleNhcStorms,
      },
    ],
  },
  {
    id: "jtwc",
    label: "Joint Typhoon Warning Center (WP/IO/SH)",
    core: true,
    confidence_tier: "specialist",
    tools: [
      {
        name: "jtwc_storms",
        description:
          "Active JTWC tropical cyclones for WP/IO/SH (NIO) from jtwc.rss + per-storm web.txt. Skips EPAC/CPAC (use nhc_storms). Advisory items detected via abpwweb.txt/abioweb.txt URL/path (not title match alone). include_advisories=true attaches slim ABPW/ABIO. include_invests=true parses ABPW INVESTs as TropicalStorm classification=INVEST (does not duplicate named TCs). include_tcw=true slim-parses linked .tcw. Empty basins → count 0. confidence_tier=specialist.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Max named storms to fetch/parse (default 25, max 50)" },
            include_advisories: {
              type: "boolean",
              description: "If true, attach slim ABPW/ABIO Significant Tropical Weather Advisories (default false)",
            },
            include_invests: {
              type: "boolean",
              description: "If true, parse ABPW/ABIO disturbance INVESTs into storms[] as classification=INVEST (default false)",
            },
            include_tcw: {
              type: "boolean",
              description: "If true, fetch and slim-parse linked .tcw when present (default false)",
            },
          },
        },
        run: handleJtwcStorms,
      },
    ],
  },
  {
    id: "swpc",
    label: "NOAA Space Weather Prediction Center",
    core: true,
    confidence_tier: "specialist",
    tools: [
      {
        name: "swpc_snapshot",
        description:
          "NOAA SWPC scales + alerts → SpaceWeatherSnapshot. Optional include_indices (Kp now+forecast + 10cm flux), include_aurora (ovation, summarized), include_icao, include_events (summarized edited_events.json), include_xrays (GOES 6h latest/peak). confidence_tier=specialist.",
        inputSchema: {
          type: "object",
          properties: {
            include_alerts: { type: "boolean", description: "Default true" },
            alert_limit: { type: "number", description: "Max alerts (default 10)" },
            include_indices: { type: "boolean", description: "Kp now + forecast and 10cm flux (default false)" },
            include_aurora: {
              type: "boolean",
              description: "Ovation aurora grid; may be large and is summarized (default false)",
            },
            include_icao: { type: "boolean", description: "ICAO space-weather advisories (default false)" },
            include_events: {
              type: "boolean",
              description: "Summarize edited_events.json (type counts + recent FLA/XRA); do not dump full array (default false)",
            },
            event_limit: { type: "number", description: "Max recent FLA/XRA rows in include_events (default 20)" },
            include_xrays: {
              type: "boolean",
              description: "GOES primary xrays-6-hour latest/peak sample, not full series (default false)",
            },
            include_kp_3h: {
              type: "boolean",
              description: "Official NOAA 3-hour planetary Kp (noaa-planetary-k-index.json); default false",
            },
            include_flux: {
              type: "boolean",
              description: "Slim latest solar-radio-flux.json sample (default false)",
            },
          },
        },
        run: handleSwpcSnapshot,
      },
    ],
  },
  {
    id: "meteoalarm",
    label: "MeteoAlarm (Europe per-country Atom)",
    core: true,
    confidence_tier: "official",
    tools: [
      {
        name: "meteoalarm_alerts",
        description:
          "MeteoAlarm per-country legacy Atom feed (germany, france, united-kingdom, …). ISO aliases (DE, NL, …) accepted. format=cap or type=application/cap+xml fetches entry CAP links (capped). Europe-wide Atom is 404 — do not request it. WebSub is not a tool. Returns OfficialAlert[]. confidence_tier=official.",
        inputSchema: {
          type: "object",
          properties: {
            country: {
              type: "string",
              description: "Country slug or alias, e.g. germany | DE | netherlands | NL",
            },
            format: { type: "string", description: "atom (default) | cap" },
            type: { type: "string", description: "Set application/cap+xml to fetch CAP links" },
            limit: { type: "number", description: "Max alerts to return (default 50 atom / 5 CAP)" },
          },
          required: ["country"],
        },
        run: handleMeteoalarm,
      },
    ],
  },
  {
    id: "firms",
    label: "NASA FIRMS fire hotspots",
    core: true,
    confidence_tier: "overlay",
    tools: [
      {
        name: "firms_hotspots",
        description:
          "NASA FIRMS. mode=csv (default, needs FIRMS_MAP_KEY, km bbox via radius_km) | kml (keyless regional footprint) | status | availability | missing_data (need MAP_KEY). Never invent a key. confidence_tier=overlay.",
        inputSchema: {
          type: "object",
          properties: {
            mode: {
              type: "string",
              enum: ["csv", "kml", "status", "availability", "missing_data"],
              description: "csv (default) | kml | status | availability | missing_data",
            },
            format: { type: "string", description: "Alias of mode (e.g. kml)" },
            lat: { type: "number" },
            lon: { type: "number" },
            radius_km: { type: "number", description: "CSV bbox radius from lat/lon (default 100 km)" },
            west: { type: "number" },
            south: { type: "number" },
            east: { type: "number" },
            north: { type: "number" },
            days: { type: "number", description: "CSV 1–5 (default 1); also maps kml date_span" },
            date_span: { type: "string", description: "KML: 24h | 48h | 72h | 7d" },
            region: {
              type: "string",
              description: "KML region slug (e.g. usa_contiguous_and_hawaii); else derived from lat/lon",
            },
            satellite: {
              type: "string",
              description: "e.g. VIIRS_SNPP_NRT (default), VIIRS_NOAA20_NRT, MODIS_NRT, or KML sensor name",
            },
            limit: { type: "number" },
          },
        },
        run: handleFirmsHotspots,
      },
    ],
  },
  {
    id: "eonet",
    label: "NASA EONET v3",
    core: false,
    confidence_tier: "catalog",
    tools: [
      {
        name: "eonet_events",
        description:
          "Optional. NASA EONET v3 events. format=json|geojson; include_layers; id/eventid; mode=categories|sources; days; bbox; source. Earthquakes category excluded — use usgs_quakes. Returns NaturalEvent[]. confidence_tier=catalog. Enable with WEATHER_OPTIONAL=1 or WEATHER_ENABLE_EONET=1.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number" },
            status: { type: "string", description: "open | closed (default open)" },
            category: { type: "string", description: "EONET category id (not earthquakes)" },
            categories: { type: "string", description: "Alias of category" },
            format: { type: "string", enum: ["json", "geojson"], description: "json (default) | geojson" },
            include_layers: { type: "boolean", description: "Also fetch EONET layers (default false)" },
            id: { type: "string", description: "Single EONET event id" },
            eventid: { type: "string", description: "Alias of id" },
            mode: { type: "string", description: "categories | sources (default events list)" },
            source: { type: "string", description: "EONET source id filter" },
            sources: { type: "string", description: "Alias of source" },
            days: { type: "number", description: "Limit to events in the past N days" },
            bbox: { type: "string", description: "minLon,maxLat,maxLon,minLat" },
            west: { type: "number" },
            north: { type: "number" },
            east: { type: "number" },
            south: { type: "number" },
          },
        },
        run: handleEonet,
      },
    ],
  },
  {
    id: "gdacs",
    label: "GDACS impact alerts",
    core: false,
    confidence_tier: "specialist",
    tools: [
      {
        name: "gdacs_events",
        description:
          "Optional. GDACS impact alerts. mode=rss_24h (default) | rss_full | events4app | search. events4app uses lowercase path. SEARCH can be slow. Returns ImpactAlert[]. Enable with WEATHER_OPTIONAL=1 or WEATHER_ENABLE_GDACS=1.",
        inputSchema: {
          type: "object",
          properties: {
            mode: {
              type: "string",
              enum: ["rss_24h", "rss_full", "events4app", "search"],
              description: "rss_24h (default) | rss_full | events4app | search",
            },
            limit: { type: "number" },
            use_search: { type: "boolean", description: "Deprecated alias for mode=search" },
            alertlevel: { type: "string" },
            fromDate: { type: "string", description: "SEARCH fromDate YYYY-MM-DD (honored on the wire)" },
            toDate: { type: "string", description: "SEARCH toDate YYYY-MM-DD (honored on the wire)" },
            fromdate: { type: "string", description: "Alias of fromDate" },
            todate: { type: "string", description: "Alias of toDate" },
            fromdatetime: { type: "string", description: "Deprecated alias of fromDate (not sent as query key)" },
            todatetime: { type: "string", description: "Deprecated alias of toDate (not sent as query key)" },
            eventlist: { type: "string", description: "SEARCH event types, e.g. EQ;TC or FL" },
            pagenumber: { type: "number", description: "SEARCH page (blocks of 100, default 1)" },
            page: { type: "number", description: "Alias of pagenumber" },
            pagesize: { type: "number", description: "SEARCH page size (max 100)" },
          },
        },
        run: handleGdacs,
      },
    ],
  },
  {
    id: "gvp",
    label: "Smithsonian GVP weekly volcano report",
    core: false,
    confidence_tier: "specialist",
    tools: [
      {
        name: "gvp_weekly",
        description:
          "Optional. mode=weekly (default, WeeklyVolcanoCAP.xml first, RSS fallback; limit slices CAP <info> children, specialist) | lookup (WFS Holocene_Volcanoes GeoJSON filtered by name/country, maxFeatures/limit cap, catalog). Pleistocene gazetteer is not exposed. Enable with WEATHER_OPTIONAL=1 or WEATHER_ENABLE_GVP=1.",
        inputSchema: {
          type: "object",
          properties: {
            mode: { type: "string", enum: ["weekly", "lookup"], description: "weekly (default) | lookup" },
            name: { type: "string", description: "Lookup: volcano name contains" },
            country: { type: "string", description: "Lookup: country contains" },
            maxFeatures: { type: "number", description: "Lookup WFS cap or weekly alias of limit (default 50, max 100)" },
            limit: { type: "number", description: "Weekly CAP <info> slice; lookup alias of maxFeatures" },
          },
        },
        run: handleGvpWeekly,
      },
    ],
  },
  {
    id: "open_meteo",
    label: "Open-Meteo forecast (non-commercial free tier)",
    core: false,
    confidence_tier: "overlay",
    tools: [
      {
        name: "open_meteo_forecast",
        description:
          "Optional. Open-Meteo overlay (free non-commercial — see TERMS.md). mode=forecast (default) | air_quality | flood. If name is set, geocode first. hourly=true adds hourly series on forecast/air_quality. confidence_tier=overlay. Enable with WEATHER_OPTIONAL=1 or WEATHER_ENABLE_OPEN_METEO=1.",
        inputSchema: {
          type: "object",
          properties: {
            lat: { type: "number" },
            lon: { type: "number" },
            name: { type: "string", description: "Place name; geocoded via Open-Meteo geocoding API" },
            forecast_days: { type: "number", description: "Forecast 1–16 (default 3); flood up to 92" },
            hourly: { type: "boolean", description: "Include hourly series (default false)" },
            mode: {
              type: "string",
              enum: ["forecast", "air_quality", "flood"],
              description: "forecast (default) | air_quality | flood",
            },
          },
        },
        run: handleOpenMeteo,
      },
    ],
  },
];

function sourceEnabled(source) {
  if (source.core) return true;
  return optionalEnabled(source.id);
}

function enabledToolEntries() {
  const out = [];
  for (const source of SOURCE_REGISTRY) {
    if (!sourceEnabled(source)) continue;
    for (const tool of source.tools) {
      out.push({ source, tool });
    }
  }
  return out;
}

function listTools() {
  return enabledToolEntries().map(({ tool }) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

async function callTool(name, args) {
  for (const source of SOURCE_REGISTRY) {
    for (const tool of source.tools) {
      if (tool.name !== name) continue;
      if (!sourceEnabled(source)) {
        return errPayload(
          "optional_disabled",
          `Tool '${name}' is optional (source=${source.id}). Set WEATHER_OPTIONAL=1 or WEATHER_ENABLE_${source.id.toUpperCase()}=1.`,
        );
      }
      return tool.run(args ?? {});
    }
  }
  return errPayload("unknown_tool", `Unknown tool: ${name}`);
}

// ---------------------------------------------------------------------------
// MCP stdio (Content-Length + LF framing)
// ---------------------------------------------------------------------------

let framing = "content-length";

function send(msg) {
  const json = JSON.stringify(msg);
  const payload = Buffer.from(json, "utf8");
  if (framing === "lf") {
    stdout.write(payload);
    stdout.write("\n");
    return;
  }
  stdout.write(`Content-Length: ${payload.length}\r\n\r\n`);
  stdout.write(payload);
}

function ok(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function toolResult(id, { isError, payload }) {
  ok(id, {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError: Boolean(isError),
  });
}

async function handle(msg) {
  if (!msg || typeof msg !== "object") return;
  const { id, method } = msg;
  if (id === undefined || id === null) return;

  try {
    switch (method) {
      case "initialize": {
        const requested = msg.params?.protocolVersion;
        ok(id, {
          protocolVersion: requested || PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        });
        return;
      }
      case "ping":
        ok(id, {});
        return;
      case "tools/list":
        ok(id, { tools: listTools() });
        return;
      case "tools/call": {
        const name = msg.params?.name;
        const args = msg.params?.arguments ?? {};
        if (!name) {
          fail(id, -32602, "tools/call requires params.name");
          return;
        }
        toolResult(id, await callTool(name, args));
        return;
      }
      default:
        fail(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    fail(id, -32603, err?.message || "Internal error");
  }
}

let buf = Buffer.alloc(0);

function dispatch(body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  void handle(parsed);
}

function pump() {
  while (buf.length) {
    const asText = buf.toString("utf8");
    if (/^Content-Length\s*:/i.test(asText) || asText.includes("\r\n\r\n")) {
      const sep = buf.indexOf("\r\n\r\n");
      if (sep === -1) return;
      const header = buf.subarray(0, sep).toString("utf8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buf = buf.subarray(sep + 4);
        continue;
      }
      framing = "content-length";
      const len = Number(match[1]);
      const start = sep + 4;
      if (buf.length < start + len) return;
      const body = buf.subarray(start, start + len).toString("utf8");
      buf = buf.subarray(start + len);
      dispatch(body);
      continue;
    }
    const nl = buf.indexOf("\n");
    if (nl === -1) return;
    framing = "lf";
    let line = buf.subarray(0, nl).toString("utf8");
    buf = buf.subarray(nl + 1);
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (!line.trim()) continue;
    dispatch(line);
  }
}

function startedAsMain() {
  try {
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return true;
  }
}

if (startedAsMain()) {
  stdin.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    pump();
  });
  stdin.on("end", () => pump());
  stdin.on("error", () => process.exit(1));
  if (stdin.isTTY) process.stderr.write("weather-hazards MCP expects stdio JSON-RPC\n");
  stdin.resume();
}

export {
  SERVER_INFO,
  SOURCE_REGISTRY,
  listTools,
  callTool,
  sourceEnabled,
  toQuakeEvent,
  toTropicalStorm,
  toOfficialAlert,
  toPointForecast,
  toFireHotspot,
  handleJtwcStorms,
  parseJtwcWebTxt,
  parseJtwcInvests,
};
