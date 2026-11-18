# CHANGELOG 0.1.13

Shipped `mcp.json` now launches with `npx -y github:TheAbsentTourist/weather-web` and no `cwd` or local paths, so a directory validator can run the setup as written. `package.json` adds a `weather-web` bin (`server.mjs`, executable) and a `files` list (`server.mjs`, `skills`, `assets`, `LICENSE`, `README.md`). Blank and unexpanded `${VAR}` environment values are treated as unset instead of as a FIRMS key or feature flag. The server reads config only from `$PLUGIN_DATA/config.json` and does not locate package files with `process.cwd()`. Version 0.1.13.
