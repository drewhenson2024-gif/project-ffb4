# Project FFB4 — Overview

## What this project is

A **minimal fantasy football player database** built with Next.js and Supabase. It stores NFL skill-position players (QB, RB, WR, TE), links them to draft history, imports yearly fantasy stats from nflverse, and displays career rankings in a simple web UI.

## Why FFB4 exists

FFB3 proved the core data pipeline and UI worked well. It became hard to maintain once we added **player valuation and career projections** — that work grew quickly, was hard to test, and the repo history became difficult to follow.

FFB4 is a **clean restart** — new GitHub repo, new Supabase project, new data import. We keep only the *code patterns* from FFB3 that worked; we do **not** reuse FFB3's database, API keys, or repository.

See [02-fresh-start-setup.md](./02-fresh-start-setup.md) for creating new infrastructure.

FFB4 keeps only what worked:

| Included (working) | Excluded (deferred) |
|---|---|
| Supabase schema for players, drafts, season stats | Player valuation / PAB tiers |
| nflverse import pipeline | Career projection models |
| Career stats refresh function | Dynasty calibration |
| Homepage + player rankings + detail pages | Backtest / ablation scripts |

We will revisit predictions later, on a solid foundation, with design docs and version control from day one.

## Tech stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS 4
- **Database:** Supabase (PostgreSQL)
- **Data source:** [nflverse](https://github.com/nflverse/nflverse-data)
- **Hosting:** Vercel (planned)

## Repository layout

```
project-ffb4/
├── docs/                    # Design documents (read these first)
│   ├── 00-project-overview.md
│   ├── 01-git-workflow.md
│   ├── roadmap.md
│   └── phases/              # One doc per build phase
├── src/
│   ├── app/                 # Next.js pages
│   ├── components/          # UI components
│   ├── lib/                 # Shared utilities
│   └── types/               # TypeScript types
├── scripts/                 # Data import (run locally)
├── supabase/migrations/     # SQL schema (run in Supabase SQL Editor)
└── data/cache/              # nflverse download cache (gitignored)
```

## Data model (high level)

```
players ──┬── draft_picks (1980+)
          └── fantasy_season_stats (2000+)
                    │
                    ▼
            player_career_stats (aggregated via SQL function)
                    │
                    ▼
            player_profiles (read-only view for the website)
```

## How to read the docs

1. Start with this file.
2. Read [01-git-workflow.md](./01-git-workflow.md) before touching git.
3. Follow [roadmap.md](./roadmap.md) for phase order and status.
4. Open the matching file in `docs/phases/` when working on a feature.
