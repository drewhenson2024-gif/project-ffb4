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
| 10 — Player valuation | `feature/10-valuation` | *(not started)* | planned |

## Out of scope for baseline (phase 10+)

Revisit only after baseline is stable on GitHub with clean history:

- PAB / tier classification
- Career projection models
- Dynasty ranking calibration
- Valuation UI

## Lessons carried from FFB3

1. **Data layer first** — schema + import before UI features that depend on it.
2. **One migration per concern** — easier to debug than monolithic SQL.
3. **Offline scripts for heavy work** — import runs locally, not in API routes.
4. **Stop before predictions** — FFB3's projection work needed rework; we defer it intentionally.
