# project-ffb4

A clean rebuild of the fantasy football player database — **new GitHub repo, new Supabase database, fresh data import.** Code lessons from FFB3; infrastructure starts from zero.

**Read first:**
- [docs/00-project-overview.md](docs/00-project-overview.md) — what this project is
- [docs/02-fresh-start-setup.md](docs/02-fresh-start-setup.md) — create new Supabase + GitHub (do not reuse FFB3)
- [docs/01-git-workflow.md](docs/01-git-workflow.md) — how we use git

## Stack

- **Frontend:** Next.js, React, Tailwind CSS
- **Database:** Supabase (PostgreSQL)
- **Data:** [nflverse](https://github.com/nflverse/nflverse-data)

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env.local
```

Create a **new** Supabase project and fill in its URL and keys — do not use FFB3 credentials. Full steps: [docs/02-fresh-start-setup.md](docs/02-fresh-start-setup.md).

3. Run migrations in the Supabase SQL Editor (in order):

- `supabase/migrations/001_player_fantasy_schema.sql`
- `supabase/migrations/002_player_identity_metadata.sql`
- `supabase/migrations/003_fix_refresh_career_stats.sql`
- `supabase/migrations/004_expand_draft_history.sql`

4. Import nflverse data:

```bash
npm run import:data
```

Then refresh career totals:

```sql
select refresh_player_career_stats();
```

5. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Git workflow

Each feature phase uses a `feature/NN-name` branch, focused commits, and a `--no-ff` merge to `main`. See [docs/01-git-workflow.md](docs/01-git-workflow.md) for the full guide.

```bash
git log --oneline --graph -20   # view phase history
```

## Scope

**Included:** player schema, nflverse import, career rankings UI.

**Deferred:** player valuation, career projections (FFB3 lesson — revisit in phase 10+).
