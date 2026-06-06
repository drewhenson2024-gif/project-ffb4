# Phase 03 — Database Schema

## Goal

Define the core PostgreSQL schema for players, draft picks, season stats, and career aggregates.

## Migration

Run in Supabase SQL Editor:

- `supabase/migrations/001_player_fantasy_schema.sql`

FFB4 skips FFB3's deprecated prototype `teams` table (never created here).

## Tables

| Table | Purpose |
|-------|---------|
| `players` | Master identity (QB/RB/WR/TE) |
| `draft_picks` | One row per drafted player |
| `fantasy_season_stats` | Raw yearly stats (2000+) |
| `player_career_stats` | Aggregated career totals |

## SQL function

`refresh_player_career_stats()` rebuilds career totals from season stats. Run after each import:

```sql
select refresh_player_career_stats();
```

## View

`player_profiles` joins player identity + career stats for the website.

## Files added

- `supabase/migrations/001_player_fantasy_schema.sql`
- `src/types/database.ts`

## Git

Branch: `feature/03-database-schema`  
Commit: `Add player, draft, and fantasy stats database schema`
