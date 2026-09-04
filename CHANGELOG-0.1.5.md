# CHANGELOG — weather-web 0.1.5

Date: 2026-09-03

## Summary

Windows Cursor plugin MCP spawn: portable `cwd` so `./server.mjs` is not resolved under the user home folder. Docs + assert only for host bugs. No new tools. No invented FIRMS key.

## Global

- Version **0.1.5** (`package.json`, `plugin.json`, `serverInfo`, UA strings, README, VERIFY, this file).
- Default User-Agent: `WeatherHazardsPlugin/0.1.5 (contact: chucktastictime@gmail.com)`.
- JTWC UA: `Mozilla/5.0 (compatible; WeatherHazardsPlugin/0.1.5; +https://github.com/TheAbsentTourist/weather-web)`.

## Windows MCP cwd

- **`mcp.json`:** keep stdio `node` + `["./server.mjs"]`. Add plugin-relative `"cwd": "./"` (Agent Plugins schema). Do not ship `${PLUGIN_ROOT}` in command/args, `"cwd": "${PLUGIN_ROOT}"`, `./scripts/run-mcp.cmd` as command, or machine-absolute `node.exe` / `%USERPROFILE%` paths.
- **README:** install as a real directory under `~/.cursor/plugins/local/weather-hazards` (Windows + macOS/Linux paths). User `%USERPROFILE%\.cursor\mcp.json` workaround (placeholder `YOUR_USERNAME`) if Cursor still looks for `server.mjs` in the home folder. Env vars unchanged.
- **`scripts/mcp-path-test.mjs`:** assert portable command, no `C:\Users` / `Program Files` in args, `cwd` `"./"` when using `node` + `./server.mjs`, no `${PLUGIN_ROOT}` in command.
- **`docs/cursor-windows-mcp-spawn.md`:** Cursor host bugs (cwd = home or install dir, unexpanded `${PLUGIN_ROOT}`, plugin-relative `./` command vs Cursor install dir, `cwd: "${PLUGIN_ROOT}"` ENOENT). Absolute paths stay in user `mcp.json` only.

## Not in 0.1.5

- Windows `cmd.exe` launcher or `%PLUGIN_ROOT%` args (unproven host injection)
- Hardcoded `C:\Program Files\nodejs\node.exe` in shipped `mcp.json`
- Tool / SOURCE_REGISTRY changes
