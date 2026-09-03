#!/usr/bin/env node
/**
 * Offline mcp.json spawn-shape checks. No live weather fetches.
 *
 * Public mcp.json must stay portable:
 *   command node | cmd.exe
 *   args without machine-absolute paths (C:\Users, Program Files)
 *   no ${PLUGIN_ROOT} in command
 *   if command is node and args are ["./server.mjs"], cwd must be "./"
 *
 * Cursor Windows plugin spawn bugs (cwd = home, unexpanded ${PLUGIN_ROOT},
 * cwd: "${PLUGIN_ROOT}" ENOENT) are documented in
 * docs/cursor-windows-mcp-spawn.md. The user mcp.json workaround stays
 * out of this shipped file.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mcpRaw = readFileSync(join(root, "mcp.json"), "utf8");
const mcp = JSON.parse(mcpRaw);
const server = mcp.mcpServers?.["weather-hazards"];

assert.ok(server, "weather-hazards server missing from mcp.json");
assert.equal(server.type, "stdio");

const portableCommands = new Set(["node", "cmd.exe"]);
assert.ok(
  portableCommands.has(server.command),
  `command must be portable (node or cmd.exe), got ${JSON.stringify(server.command)}`,
);
assert.doesNotMatch(String(server.command), /\$\{PLUGIN_ROOT\}/);
assert.doesNotMatch(String(server.command), /C:\\Users|Program Files/i);
assert.notEqual(server.command, "./scripts/run-mcp.cmd");
assert.notEqual(server.command, "scripts\\run-mcp.cmd");

const args = server.args ?? [];
assert.ok(Array.isArray(args), "args must be an array");
for (const arg of args) {
  const text = String(arg);
  assert.doesNotMatch(text, /C:\\Users/i, "args must not contain C:\\Users (user mcp.json only)");
  assert.doesNotMatch(text, /Program Files/i, "args must not contain Program Files");
  assert.doesNotMatch(text, /\$\{PLUGIN_ROOT\}/, "Cursor does not expand ${PLUGIN_ROOT} in args");
}

const usesPluginRootEnv = args.some((a) => String(a).includes("%PLUGIN_ROOT%"));
if (usesPluginRootEnv) {
  assert.equal(server.command, "cmd.exe", "%PLUGIN_ROOT% in args is only for a cmd.exe child-env launch");
  console.log(
    "mcp-path-test: %PLUGIN_ROOT% present in args — only valid if the Cursor host injects PLUGIN_ROOT into the child env. If spawn still looks under %USERPROFILE%, treat it as a Cursor host bug; use the README user mcp.json workaround.",
  );
}

if (server.command === "node" && args.length === 1 && args[0] === "./server.mjs") {
  assert.equal(server.cwd, "./", 'node + ./server.mjs requires cwd "./" so the host resolves against plugin root, not the user home folder');
}

assert.notEqual(server.cwd, "${PLUGIN_ROOT}", 'cwd "${PLUGIN_ROOT}" is a proven Windows Cursor spawn failure');
assert.doesNotMatch(mcpRaw, /C:\\\\Users|C:\\Users/i);
assert.doesNotMatch(mcpRaw, /Program Files/i);
assert.doesNotMatch(mcpRaw, /\$\{PLUGIN_ROOT\}/);

assert.equal(server.env?.FIRMS_MAP_KEY, "${FIRMS_MAP_KEY}");
assert.equal(server.env?.WEATHER_OPTIONAL, "${WEATHER_OPTIONAL}");
assert.equal(server.env?.WEATHER_ENABLE_EONET, "${WEATHER_ENABLE_EONET}");
assert.equal(server.env?.WEATHER_ENABLE_GDACS, "${WEATHER_ENABLE_GDACS}");
assert.equal(server.env?.WEATHER_ENABLE_GVP, "${WEATHER_ENABLE_GVP}");
assert.equal(server.env?.WEATHER_ENABLE_OPEN_METEO, "${WEATHER_ENABLE_OPEN_METEO}");

const cursorPlugin = JSON.parse(readFileSync(join(root, ".cursor-plugin/plugin.json"), "utf8"));
const vars = cursorPlugin.variables?.properties ?? {};
assert.ok(vars.FIRMS_MAP_KEY, "FIRMS_MAP_KEY must be declared in .cursor-plugin/plugin.json variables");
assert.equal(vars.FIRMS_MAP_KEY.type, "string");
assert.equal(vars.WEATHER_OPTIONAL, undefined, "WEATHER_OPTIONAL must not appear in Configure variables");
assert.ok(!cursorPlugin.variables?.required?.length, "Configure variables must not be required");
assert.ok(!cursorPlugin.variables?.required?.includes("FIRMS_MAP_KEY"));

const configureVars = ["WEATHER_ENABLE_EONET", "WEATHER_ENABLE_GDACS", "WEATHER_ENABLE_GVP", "WEATHER_ENABLE_OPEN_METEO"];
for (const name of configureVars) {
  assert.ok(vars[name], `${name} must be declared in .cursor-plugin/plugin.json variables`);
  assert.deepEqual(vars[name].enum, ["", "1"], `${name} should be a "" / "1" toggle`);
}

const placeholders = new Set();
for (const value of Object.values(server.env ?? {})) {
  for (const m of String(value).matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)) {
    placeholders.add(m[1]);
  }
}
for (const name of placeholders) {
  if (name === "WEATHER_OPTIONAL") continue;
  assert.ok(vars[name], `mcp.json env placeholder \${${name}} must appear in .cursor-plugin/plugin.json variables.properties`);
}

console.log("mcp-path-test: PASS");
