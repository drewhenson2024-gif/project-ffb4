# Phase 05 — Player Identity Metadata

## Goal

Support name normalization, suffix handling (Jr./III), and undrafted player tracking.

## Migration

Run after `001`:

- `supabase/migrations/002_player_identity_metadata.sql`

## New columns on `players`

- `display_name`, `name_key`, `suffix`
- `pfr_player_id` — cross-reference to Pro Football Reference
- `is_undrafted` — verified no skill-position draft record
- `debut_season`, `final_season`

## View update

`player_profiles` is dropped and recreated to include new fields (Postgres cannot reorder view columns in place).

## Files added

- `supabase/migrations/002_player_identity_metadata.sql`
- Updated `src/types/database.ts`

## Git

Branch: `feature/05-player-identity`  
Commit: `Add player identity metadata for imports and name disambiguation`
