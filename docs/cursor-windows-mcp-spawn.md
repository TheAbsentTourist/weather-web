# Cursor Windows plugin MCP spawn (upstream)

Maintainer note for Cursor / Agent Plugins hosts. User-facing install stays in the README.

Windows Cursor (`plugin-weather-web-weather-web`) has been observed spawning the plugin MCP with a working directory that is **not** the plugin root. Relative `./server.mjs` then resolves under the user home folder:

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
| Absolute `node.exe` + absolute `…\weather-web\server.mjs` | Works — **user `mcp.json` only**. Never ship machine-absolute paths in this repo |

Plugin-relative `./` as `command` is also resolved against the Cursor install directory, not the plugin root.

## What this repo ships

Public `mcp.json` is a portable npx setup (no local paths, no `cwd`):

- `command`: `npx`
- `args`: `["-y", "github:TheAbsentTourist/weather-web"]`
- The `weather-web` bin is `server.mjs` (`#!/usr/bin/env node`)

No `${PLUGIN_ROOT}` in `command` or `args`. No `"cwd"`. No `./server.mjs`. No `./scripts/run-mcp.cmd` as `command`. No `C:\Program Files\nodejs\node.exe` or `%USERPROFILE%` paths.

`npx` installs the package from GitHub and runs the bin, so the server does not need the plugin folder as its working directory. Blank and unexpanded `${VAR}` env values are treated as unset.

## Known-good escape hatch

User file `%USERPROFILE%\.cursor\mcp.json` with full paths to `node.exe` and the **installed** plugin `server.mjs`. See the README Windows section. Placeholders only (`YOUR_USERNAME`); never commit real machine paths.

This is a **Cursor host** defect (cwd + placeholder expansion), not a weather-web runtime bug. Grok Bot Directory and other hosts run the shipped `npx` command as written.
