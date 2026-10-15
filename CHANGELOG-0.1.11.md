# CHANGELOG 0.1.11

Marketplace-readiness pass (Review Remy parked fix list). No tool behavior changes.

- Root `plugin.json`: removed undeclared `logo` field; it now validates against the agent-plugins.org 1.0.0 plugin schema.
- `.cursor-plugin/plugin.json`: `logo` now points to `assets/logo-plate.png`.
- New `assets/logo-plate.png`: same art on a solid 1024x1024 background plate (no transparency) for marketplace listings. `assets/logo.png` is kept for the README.
- New `PRIVACY.md` and `SECURITY.md` (parity with steam-web); README links them.
- `package.json`: added `bugs`, `author.url`, `#readme` homepage.
- README changelog link fixed. VERIFY.md refreshed.
- Version 0.1.11 synced across manifests, server, User-Agent, smoke.
