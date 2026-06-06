# Phase 06 — nflverse Data Import

## Goal

Import draft picks and fantasy season stats from nflverse CSV releases into Supabase.

## Data coverage

- **Draft picks:** 2000+ initially (expanded to 1980+ in phase 08)
- **Fantasy stats:** 2000–2025
- **Positions:** QB, RB, WR, TE only

## Migrations (run before import)

- `supabase/migrations/003_fix_refresh_career_stats.sql` — Supabase requires `WHERE` on `DELETE`

## Scripts

```bash
npm run import:data
```

Uses `SUPABASE_SECRET_KEY` for bulk upserts. Downloads CSVs to `data/cache/` (gitignored).

## Files added

- `scripts/import-nflverse.ts`
- `scripts/lib/nflverse.ts`
- `src/lib/normalize-name.ts`
- `package.json` script: `import:data`

## Post-import step

In Supabase SQL Editor:

```sql
select refresh_player_career_stats();
```

## Git

Branch: `feature/06-data-import`  
Commit: `Add nflverse import pipeline for draft and fantasy data`
