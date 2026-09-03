# Cursor Windows plugin MCP spawn (upstream)

Maintainer note for Cursor / Agent Plugins hosts. User-facing install stays in the README.

Windows Cursor (`plugin-weather-hazards-weather-hazards`) has been observed spawning the plugin MCP with a working directory that is **not** the plugin root. Relative `./server.mjs` then resolves under the user home folder:

```
Error: Cannot find module 'C:\Users\<user>\server.mjs'
```

## Host bugs (proven on the same Windows Cursor host as steam-web)

Do **not** retry these shapes in shipped `mcp.json`:

| Attempt | Result |
|---------|--------|
| `command: node`, `args: ["./server.mjs"]` with no plugin-relative `cwd` | Resolves as `%USERPROFILE%\server.mjs` (cwd = user home) |
| `${PLUGIN_ROOT}` in `mcp.json` args | **Not expanded** — literal path token |
| Relative `scripts\run-mcp.cmd` | Only works if cwd is already the plugin root |
| `command: "./scripts/run-mcp.cmd"` | Resolved against the **Cursor install dir**, not `PLUGIN_ROOT` |
| `"cwd": "${PLUGIN_ROOT}"` | `spawn C:\WINDOWS\system32\cmd.exe ENOENT` (cwd treated as invalid) |
| Absolute `node.exe` + absolute `…\weather-hazards\server.mjs` | Works — **user `mcp.json` only**. Never ship machine-absolute paths in this repo |

Plugin-relative `./` as `command` is also resolved against the Cursor install directory, not the plugin root.

## What this repo ships

Public `mcp.json` stays portable:

- `command`: `node`
- `args`: `["./server.mjs"]`
- `cwd`: `"./"` — Agent Plugins intent is that `./` is plugin-relative, so `server.mjs` is not loaded from the home folder

No `${PLUGIN_ROOT}` in `command` or `args`. No `"cwd": "${PLUGIN_ROOT}"`. No `./scripts/run-mcp.cmd` as `command`. No `C:\Program Files\nodejs\node.exe` or `%USERPROFILE%` paths.

If a future host actually injects a child-env `PLUGIN_ROOT`, a `cmd.exe` line using `%PLUGIN_ROOT%\server.mjs` could be considered. Until that is proven, do not add a Windows launcher.

## Known-good escape hatch

User file `%USERPROFILE%\.cursor\mcp.json` with full paths to `node.exe` and the **installed** plugin `server.mjs`. See the README Windows section. Placeholders only (`YOUR_USERNAME`); never commit real machine paths.

This is a **Cursor host** defect (cwd + placeholder expansion), not a weather-hazards runtime bug. Grok Bot and other hosts that run `node ./server.mjs` from the plugin directory are unchanged.
