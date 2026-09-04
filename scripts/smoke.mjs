#!/usr/bin/env node
/** Live MCP smoke. Spawns node ./server.mjs. Prints PASS/FAIL. Does not invent data. */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LAT = 30.2672;
const LON = -97.7431;
const EXTENDED = String(process.env.WEATHER_OPTIONAL || "").trim() === "1" || process.argv.includes("--extended");

function frame(obj) {
  const json = JSON.stringify(obj);
  const payload = Buffer.from(json, "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "utf8"), payload]);
}

function readMessages(child, count, timeoutMs = EXTENDED ? 180000 : 150000) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const out = [];
    const timer = setTimeout(
      () => reject(new Error(`MCP smoke timed out waiting for ${count} responses (got ${out.length})`)),
      timeoutMs,
    );
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const sep = buf.indexOf("\r\n\r\n");
        if (sep === -1) break;
        const header = buf.subarray(0, sep).toString("utf8");
        const m = header.match(/Content-Length:\s*(\d+)/i);
        if (!m) {
          buf = buf.subarray(sep + 4);
          continue;
        }
        const len = Number(m[1]);
        const start = sep + 4;
        if (buf.length < start + len) break;
        const body = JSON.parse(buf.subarray(start, start + len).toString("utf8"));
        buf = buf.subarray(start + len);
        out.push(body);
        if (out.length >= count) {
          clearTimeout(timer);
          child.stdout.off("data", onData);
          resolve(out);
          return;
        }
      }
    };
    child.stdout.on("data", onData);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      if (out.length < count) {
        clearTimeout(timer);
        reject(new Error(`server exited ${code} before ${count} MCP replies (got ${out.length})`));
      }
    });
  });
}

function payloadOf(msg) {
  const text = msg?.result?.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const CORE = [
  "nws_forecast",
  "nws_alerts",
  "usgs_quakes",
  "nhc_storms",
  "jtwc_storms",
  "swpc_snapshot",
  "meteoalarm_alerts",
  "firms_hotspots",
];

const OPTIONAL = ["eonet_events", "gdacs_events", "gvp_weekly", "open_meteo_forecast"];

let nextId = 1;
const calls = [];
function addCall(name, args) {
  const id = nextId++;
  calls.push({ id, name, args });
  return id;
}

const idInit = nextId++;
const idList = nextId++;
const idNws = addCall("nws_forecast", { lat: LAT, lon: LON, limit: 3 });
const idUsgs = addCall("usgs_quakes", { feed: "hour", limit: 5 });
const idNhc = addCall("nhc_storms", {});
const idJtwc = addCall("jtwc_storms", {});
const idHourly = addCall("nws_forecast", { lat: LAT, lon: LON, product: "hourly", limit: 3 });
const idAfd = addCall("nws_forecast", { lat: LAT, lon: LON, product: "afd" });
const idJtwcInv = addCall("jtwc_storms", { include_invests: true, include_advisories: true });
const idAlertsCore = addCall("nws_alerts", { lat: LAT, lon: LON, limit: 5 });
const idSwpcCore = addCall("swpc_snapshot", { include_alerts: false });
const idMeteo = addCall("meteoalarm_alerts", { country: "DE", limit: 5 });
const idFirmsKml = addCall("firms_hotspots", { format: "kml", lat: LAT, lon: LON });

let idAlerts, idUsgsSig, idSwpc, idOm, idOmAq, idGdacs, idEonet, idGvp, idFirms, idNhcAdv, idTypes, idKp3h;
if (EXTENDED) {
  idAlerts = addCall("nws_alerts", { lat: LAT, lon: LON, event: "Flood Warning", status: "actual" });
  idUsgsSig = addCall("usgs_quakes", { feed: "significant_week", limit: 5 });
  idSwpc = addCall("swpc_snapshot", {
    include_indices: true,
    include_alerts: true,
    alert_limit: 3,
    include_events: true,
  });
  idOm = addCall("open_meteo_forecast", { name: "Austin", forecast_days: 2, hourly: true });
  idOmAq = addCall("open_meteo_forecast", { lat: LAT, lon: LON, mode: "air_quality", forecast_days: 1 });
  idGdacs = addCall("gdacs_events", { mode: "rss_full", limit: 5 });
  idEonet = addCall("eonet_events", { limit: 5, format: "json" });
  idGvp = addCall("gvp_weekly", { mode: "weekly", limit: 5 });
  idFirms = addCall("firms_hotspots", { lat: LAT, lon: LON, radius_km: 50 });
  idNhcAdv = addCall("nhc_storms", { include_advisories: true, include_outlook: true });
  idTypes = addCall("nws_alerts", { mode: "types" });
  idKp3h = addCall("swpc_snapshot", { include_alerts: false, include_kp_3h: true });
}

const INIT_AND_LIST = 2;
const replyCount = INIT_AND_LIST + calls.length;

const child = spawn("node", ["./server.mjs"], {
  cwd: root,
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, ...(EXTENDED ? { WEATHER_OPTIONAL: "1" } : {}) },
});
const repliesP = readMessages(child, replyCount);

child.stdin.write(
  frame({
    jsonrpc: "2.0",
    id: idInit,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "weather-web-smoke", version: "0.1.10" },
    },
  }),
);
child.stdin.write(frame({ jsonrpc: "2.0", method: "notifications/initialized" }));
child.stdin.write(frame({ jsonrpc: "2.0", id: idList, method: "tools/list" }));
for (const c of calls) {
  child.stdin.write(
    frame({
      jsonrpc: "2.0",
      id: c.id,
      method: "tools/call",
      params: { name: c.name, arguments: c.args },
    }),
  );
}
child.stdin.end();

let replies;
try {
  replies = await repliesP;
} catch (err) {
  console.error("FAIL", err.message);
  child.kill("SIGTERM");
  process.exit(1);
}
child.kill("SIGTERM");

const byId = new Map(replies.map((m) => [m.id, m]));
const init = byId.get(idInit);
const list = byId.get(idList);

let failed = false;
function fail(msg, detail) {
  failed = true;
  console.error("FAIL", msg, detail ?? "");
}

function expectOk(label, msg, checks) {
  const payload = payloadOf(msg);
  if (msg?.result?.isError || payload?.error) {
    fail(label, payload);
    return null;
  }
  if (checks) {
    for (const [k, v] of Object.entries(checks)) {
      if (payload?.[k] !== v) {
        fail(`${label} ${k}`, { expected: v, got: payload?.[k], payload: { type: payload?.type, tier: payload?.confidence_tier } });
        return payload;
      }
    }
  }
  return payload;
}

if (init?.result?.serverInfo?.name !== "weather-web") {
  fail("initialize serverInfo", init?.result?.serverInfo);
}
if (init?.result?.serverInfo?.version !== "0.1.10") {
  fail("initialize version", init?.result?.serverInfo?.version);
}

const names = (list?.result?.tools ?? []).map((t) => t.name);
const missingCore = CORE.filter((n) => !names.includes(n));
if (missingCore.length) fail("tools/list missing core", missingCore);
const optionalPresent = OPTIONAL.filter((n) => names.includes(n));
if (optionalPresent.length && !EXTENDED) {
  fail("optional tools listed without WEATHER_OPTIONAL", optionalPresent);
}
if (EXTENDED) {
  const missingOpt = OPTIONAL.filter((n) => !names.includes(n));
  if (missingOpt.length) fail("tools/list missing optional", missingOpt);
}

const firmsTool = (list?.result?.tools ?? []).find((t) => t.name === "firms_hotspots");
const daysDesc = firmsTool?.inputSchema?.properties?.days?.description || "";
if (!/1\s*[–-]\s*5/.test(daysDesc)) {
  fail("firms_hotspots days schema should be 1–5", daysDesc);
} else {
  console.log("PASS firms_hotspots days schema", daysDesc);
}

const nwsPayload = expectOk("nws_forecast", byId.get(idNws), {
  type: "PointForecast",
  confidence_tier: "official",
});
if (nwsPayload) {
  if (!Array.isArray(nwsPayload.periods) || nwsPayload.periods.length < 1) {
    fail("nws_forecast periods empty", nwsPayload.periods);
  } else {
    console.log(
      "PASS nws_forecast",
      nwsPayload.place || `${LAT},${LON}`,
      nwsPayload.periods[0]?.shortForecast || nwsPayload.periods[0]?.name,
    );
  }
}

const usgsPayload = expectOk("usgs_quakes", byId.get(idUsgs), {
  type: "QuakeEventList",
  confidence_tier: "catalog",
});
if (usgsPayload) console.log("PASS usgs_quakes count=", usgsPayload.count);

const nhcPayload = expectOk("nhc_storms", byId.get(idNhc), {
  type: "TropicalStormList",
  confidence_tier: "official",
});
if (nhcPayload) {
  const sample = (nhcPayload.storms ?? []).map((s) => s.name).filter(Boolean).slice(0, 3);
  console.log("PASS nhc_storms count=", nhcPayload.count, sample.length ? sample.join(",") : "(none active)");
}

const jtwcPayload = expectOk("jtwc_storms", byId.get(idJtwc), {
  type: "TropicalStormList",
  confidence_tier: "specialist",
});
if (jtwcPayload) {
  if (jtwcPayload.source !== "jtwc") fail("jtwc_storms source", jtwcPayload.source);
  const sample = (jtwcPayload.storms ?? []).map((s) => s.name).filter(Boolean).slice(0, 5);
  console.log(
    "PASS jtwc_storms count=",
    jtwcPayload.count,
    sample.length ? sample.join(",") : "(none active WP/IO/SH)",
  );
}

const hourlyPayload = expectOk("nws_forecast hourly", byId.get(idHourly), {
  type: "PointForecast",
  confidence_tier: "official",
});
if (hourlyPayload) {
  if (!Array.isArray(hourlyPayload.periods) || hourlyPayload.periods.length < 1) {
    fail("nws_forecast hourly periods empty", hourlyPayload.periods);
  } else if (hourlyPayload.product !== "hourly") {
    fail("nws_forecast hourly product field", hourlyPayload.product);
  } else {
    console.log("PASS nws_forecast hourly", hourlyPayload.periods.length, hourlyPayload.periods[0]?.startTime);
  }
}

const afdPayload = expectOk("nws_forecast afd", byId.get(idAfd), {
  type: "NwsTextProduct",
  confidence_tier: "official",
});
if (afdPayload) {
  if (afdPayload.product !== "afd" && afdPayload.productCode !== "AFD") {
    fail("nws_forecast afd product", afdPayload.product || afdPayload.productCode);
  } else if (!afdPayload.text || String(afdPayload.text).length < 40) {
    fail("nws_forecast afd text empty", { office: afdPayload.office, len: afdPayload.text?.length });
  } else if (afdPayload.office && /^K[A-Z]{3}$/.test(String(afdPayload.office))) {
    fail("nws_forecast afd office should be CWA not ICAO", afdPayload.office);
  } else {
    console.log(
      "PASS nws_forecast afd",
      afdPayload.office,
      afdPayload.issuingOffice,
      "chars=",
      String(afdPayload.text).length,
    );
  }
}

const jtwcInvPayload = expectOk("jtwc include_invests", byId.get(idJtwcInv), {
  type: "TropicalStormList",
  confidence_tier: "specialist",
});
if (jtwcInvPayload) {
  const storms = jtwcInvPayload.storms ?? [];
  const invests = storms.filter((st) => st.classification === "INVEST" || st.is_invest);
  if (jtwcInvPayload.count < 0) fail("jtwc include_invests count", jtwcInvPayload.count);
  else {
    console.log(
      "PASS jtwc include_invests count=",
      jtwcInvPayload.count,
      invests.length ? invests.map((st) => st.id).join(",") : "(no INVEST this run)",
    );
  }
  if (jtwcInvPayload.advisories && !Array.isArray(jtwcInvPayload.advisories)) {
    fail("jtwc include_advisories missing array", { keys: Object.keys(jtwcInvPayload) });
  } else if (jtwcInvPayload.advisories) {
    console.log("PASS jtwc include_advisories count=", jtwcInvPayload.advisory_count ?? jtwcInvPayload.advisories.length);
  }
}

const alertsCore = expectOk("nws_alerts", byId.get(idAlertsCore), {
  type: "OfficialAlertList",
  confidence_tier: "official",
});
if (alertsCore) {
  if (!Array.isArray(alertsCore.alerts)) fail("nws_alerts alerts missing", { keys: Object.keys(alertsCore) });
  else console.log("PASS nws_alerts count=", alertsCore.count, "point=", `${LAT},${LON}`);
}

const swpcCore = expectOk("swpc_snapshot", byId.get(idSwpcCore), {
  type: "SpaceWeatherSnapshot",
  confidence_tier: "specialist",
});
if (swpcCore) {
  if (!swpcCore.scales || !(swpcCore.scales.current || swpcCore.scales.forecast_1 || swpcCore.scales.forecast_2)) {
    fail("swpc scales missing", swpcCore.scales);
  } else {
    console.log("PASS swpc_snapshot scales", Object.keys(swpcCore.scales).join(","));
  }
}

const meteo = expectOk("meteoalarm_alerts", byId.get(idMeteo), {
  type: "OfficialAlertList",
  confidence_tier: "official",
});
if (meteo) {
  console.log("PASS meteoalarm_alerts country=", meteo.country, "count=", meteo.count);
}

const firmsKml = expectOk("firms_hotspots kml", byId.get(idFirmsKml), {
  type: "FireFootprintKml",
  confidence_tier: "overlay",
});
if (firmsKml) {
  if (firmsKml.error === "config_error") fail("firms kml should not need MAP_KEY", firmsKml);
  else if (firmsKml.mode !== "kml") fail("firms kml mode", firmsKml.mode);
  else console.log("PASS firms_hotspots kml region=", firmsKml.region, "bytes=", firmsKml.bytes);
}

if (EXTENDED) {
  const alerts = expectOk("nws_alerts event", byId.get(idAlerts), {
    type: "OfficialAlertList",
    confidence_tier: "official",
  });
  if (alerts) {
    console.log("PASS nws_alerts event filter count=", alerts.count, "query.event=", alerts.query?.event);
  }

  const sig = expectOk("usgs significant_week", byId.get(idUsgsSig), {
    type: "QuakeEventList",
    confidence_tier: "catalog",
  });
  if (sig) {
    const sample = (sig.events ?? [])[0];
    if (sample && !Object.prototype.hasOwnProperty.call(sample, "alert")) {
      fail("usgs significant_week missing alert field", { keys: Object.keys(sample) });
    } else {
      console.log(
        "PASS usgs_quakes significant_week count=",
        sig.count,
        sample ? `alert=${sample.alert}` : "(none)",
      );
    }
  }

  const swpc = expectOk("swpc_snapshot indices", byId.get(idSwpc), {
    type: "SpaceWeatherSnapshot",
    confidence_tier: "specialist",
  });
  if (swpc) {
    if (!swpc.indices || (!swpc.indices.kp_now && !swpc.indices.flux_10cm)) {
      fail("swpc indices missing", swpc.indices);
    } else {
      console.log("PASS swpc_snapshot include_indices kp=", swpc.indices.kp_now?.kp ?? swpc.indices.kp_now?.kp_index);
    }
    if (!swpc.events || typeof swpc.events.count !== "number") {
      fail("swpc include_events missing", swpc.events);
    } else {
      console.log("PASS swpc_snapshot include_events count=", swpc.events.count, "types=", Object.keys(swpc.events.by_type || {}).join(","));
    }
  }

  const om = expectOk("open_meteo name", byId.get(idOm), {
    type: "PointForecast",
    confidence_tier: "overlay",
  });
  if (om) {
    const hasCurrent = Boolean(om.current);
    const hasHourly = Array.isArray(om.hourly) && om.hourly.length > 0;
    if (!hasCurrent) fail("open_meteo current missing", { keys: Object.keys(om) });
    if (!hasHourly) fail("open_meteo hourly missing", { hourly: om.hourly });
    if (hasCurrent && hasHourly) {
      console.log("PASS open_meteo_forecast name=", om.place, "current=", om.current?.temperature_2m, "hourly=", om.hourly.length);
    }
  }

  const omAq = expectOk("open_meteo air_quality", byId.get(idOmAq), {
    type: "PointForecast",
    confidence_tier: "overlay",
  });
  if (omAq) {
    if (omAq.mode !== "air_quality" || !omAq.current) {
      fail("open_meteo air_quality missing current", { mode: omAq.mode, keys: Object.keys(omAq) });
    } else {
      console.log("PASS open_meteo_forecast air_quality us_aqi=", omAq.current?.us_aqi ?? omAq.current?.european_aqi);
    }
  }

  const gdacs = expectOk("gdacs rss_full", byId.get(idGdacs), {
    type: "ImpactAlertList",
    confidence_tier: "specialist",
  });
  if (gdacs) console.log("PASS gdacs_events mode=", gdacs.mode, "count=", gdacs.count);

  const eonet = expectOk("eonet_events", byId.get(idEonet), {
    type: "NaturalEventList",
    confidence_tier: "catalog",
  });
  if (eonet) {
    const quakes = (eonet.events ?? []).filter((e) =>
      (e.categories ?? []).some((c) => /earthquake/i.test(c?.id || c?.title || String(c))),
    );
    if (quakes.length) fail("eonet included earthquakes", quakes.map((e) => e.title));
    else console.log("PASS eonet_events count=", eonet.count);
  }

  const gvp = expectOk("gvp_weekly", byId.get(idGvp), {
    type: "OfficialAlertList",
    confidence_tier: "specialist",
  });
  if (gvp) {
    if (!(gvp.count > 0) || gvp.count > 5) {
      fail("gvp_weekly limit=5 not honored", { format: gvp.format, count: gvp.count, total: gvp.total });
    } else {
      console.log("PASS gvp_weekly format=", gvp.format, "count=", gvp.count, "total=", gvp.total);
    }
  }

  const firmsMsg = byId.get(idFirms);
  const firms = payloadOf(firmsMsg);
  if (firms?.error !== "config_error") {
    fail("firms_hotspots expected config_error without key", firms);
  } else {
    console.log("PASS firms_hotspots config_error (no invented key)");
  }

  const nhcAdv = expectOk("nhc include_advisories", byId.get(idNhcAdv), {
    type: "TropicalStormList",
    confidence_tier: "official",
  });
  if (nhcAdv) {
    if (!Array.isArray(nhcAdv.advisories)) fail("nhc advisories missing", { keys: Object.keys(nhcAdv) });
    else console.log("PASS nhc_storms include_advisories count=", nhcAdv.advisory_count ?? nhcAdv.advisories.length);
    if (!Array.isArray(nhcAdv.outlooks)) fail("nhc outlooks missing", { keys: Object.keys(nhcAdv) });
    else console.log("PASS nhc_storms include_outlook count=", nhcAdv.outlook_count ?? nhcAdv.outlooks.length);
  }

  const types = expectOk("nws_alerts types", byId.get(idTypes), {
    type: "NwsAlertTypes",
    confidence_tier: "official",
  });
  if (types) {
    if (!Array.isArray(types.eventTypes) || types.count < 1) {
      fail("nws_alerts types empty", { count: types.count });
    } else {
      console.log("PASS nws_alerts types count=", types.count);
    }
  }

  const kp3h = expectOk("swpc kp_3h", byId.get(idKp3h), {
    type: "SpaceWeatherSnapshot",
    confidence_tier: "specialist",
  });
  if (kp3h) {
    if (!kp3h.kp_3h || kp3h.kp_3h.error) fail("swpc kp_3h missing", kp3h.kp_3h);
    else console.log("PASS swpc_snapshot include_kp_3h Kp=", kp3h.kp_3h.latest?.Kp);
  }
}

console.log("tools:", names.join(", "));
console.log("protocolVersion:", init?.result?.protocolVersion);
console.log("mode:", EXTENDED ? "extended" : "core");
if (failed) {
  console.error("FAIL smoke");
  process.exit(1);
}
console.log("PASS smoke");
process.exit(0);
