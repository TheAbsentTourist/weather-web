# Arena synthesis — weather-hazards 0.1.0

## Base
**candidate-2** — SOURCE_REGISTRY drives tools/handlers; per-source WEATHER_ENABLE_*;
MeteoAlarm Accept `*/*` fix; GDACS prefers rss_24h over slow SEARCH; fuller smoke
(swpc + meteoalarm + firms config_error).

## Cross-rubric (parent)
| Criterion | c1 | c2 | c3 |
|---|---|---|---|
| Domain shapes / lanes | 2 | 2 | 2 |
| Core/optional gating | 2 | 2 | 2 |
| Zero-dep manifests | 2 | 2 | 2 |
| Slim + confidence_tier | 2 | 2 | 2 |
| Live core + excludes | 2 | 2 | 2 |
| RATIONALE | 1 | 2 | 2 |
| Extensibility (registry) | 1 | 2 | 1 |
| Size / reader load | 2 | 1 | 2 |

## Grafts
- From **c1**: homepage/repository on plugin.json; soft default point already present in c2.
- From **c3**: experience-first 7-tool core naming alignment already matched (`nws_forecast`, `usgs_quakes`, `nhc_storms`); rejected mega-tool (already in c2 RATIONALE). Did **not** flatten SOURCE_REGISTRY back to TOOLS/HANDLERS (would lose the domain structure).

## Rejected from losers
- c1/c3 flat CORE_TOOLS+HANDLERS — drifts from source metadata.
- Shrinking server by deleting GDACS rss fallback or MeteoAlarm Accept note — those were live-proven fixes.

## Verification
See VERIFY.md (from base) then re-run smoke after local install.
