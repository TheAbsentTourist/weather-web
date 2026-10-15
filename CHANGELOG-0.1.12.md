# CHANGELOG 0.1.12

Pre-submission review pass. No tool behavior changes.

- `assets/logo-plate.png` regenerated: full-bleed background redrawn from a fitted vertical gradient (no seam at the old rounded corners), 1024x1024 RGB, opaque. README now shows the plated logo.
- `mcp.json`: dropped `${WEATHER_OPTIONAL}` from the shipped env. Cursor's submission checklist requires every `${VAR}` in `mcp.json` to be declared in `.cursor-plugin/plugin.json` variables, and the master toggle is intentionally not in Configure. It still works from `$PLUGIN_DATA/config.json` or the CLI. `scripts/mcp-path-test.mjs` now enforces this with no exceptions.
- `.cursor-plugin/plugin.json` checked against the documented field table at cursor.com/docs/reference/plugins (no published JSON schema exists).
- GitHub repo: homepage and topics set.
- Commits now use the GitHub noreply author address.
- Version 0.1.12 synced.
