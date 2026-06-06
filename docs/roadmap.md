# FFB4 Roadmap

Track build progress here. Status: `planned` → `in-progress` → `done`.

| Phase | Branch | Design doc | Status |
|-------|--------|------------|--------|
| 00 — Documentation foundation | — | [00-project-overview.md](./00-project-overview.md) | done |
| 01 — Next.js scaffold | `feature/01-scaffold` | [phases/01-scaffold.md](./phases/01-scaffold.md) | done |
| 02 — Supabase client | `feature/02-supabase-client` | [phases/02-supabase-client.md](./phases/02-supabase-client.md) | done |
| 03 — Database schema | `feature/03-database-schema` | [phases/03-database-schema.md](./phases/03-database-schema.md) | done |
| 04 — Homepage | `feature/04-homepage` | [phases/04-homepage.md](./phases/04-homepage.md) | done |
| 05 — Player identity metadata | `feature/05-player-identity` | [phases/05-player-identity.md](./phases/05-player-identity.md) | done |
| 06 — nflverse import | `feature/06-data-import` | [phases/06-data-import.md](./phases/06-data-import.md) | done |
| 07 — Player pages | `feature/07-player-pages` | [phases/07-player-pages.md](./phases/07-player-pages.md) | done |
| 08 — Draft history 1980+ | `feature/08-draft-history` | [phases/08-draft-history.md](./phases/08-draft-history.md) | done |
| 09 — Import dedupe fix | `feature/09-import-dedupe` | [phases/09-import-dedupe.md](./phases/09-import-dedupe.md) | done |
| — Baseline verified | — | [02-fresh-start-setup.md](./02-fresh-start-setup.md) | done |
| 10 — PAB calculations | `feature/10-player-evaluation` | [phases/10-pab-calculations.md](./phases/10-pab-calculations.md) | done |
| 11 — Career projections | `feature/11-projections` | [phases/11-career-projections.md](./phases/11-career-projections.md) | done |
| 12 — Valuation UI | `feature/12-valuation` | [phases/12-valuation-ui.md](./phases/12-valuation-ui.md) | done |

## Current status

**Phase 12 complete:** `/valuations` and `/draft-capital` pages, draft-capital smoothing, league config cookie on `main`.

**Working on next:** Phase 13 — player detail PAB breakdown and dynasty calibration (see deferred below).

## Deferred to phase 13+

- Dynasty ranking calibration
- Player detail page PAB breakdown
- Sorting `/players` by total career PAB

## Lessons carried from FFB3

1. **Data layer first** — schema + import before UI features that depend on it.
2. **One migration per concern** — easier to debug than monolithic SQL.
3. **Offline scripts for heavy work** — import runs locally, not in API routes.
4. **PAB before projections** — establish tier rates and realized values before forecasting.
