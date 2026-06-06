# Phase 07 — Player Pages

## Goal

Browse top career PPR scorers and view individual player season logs.

## Routes

| Route | Purpose |
|-------|---------|
| `/players` | Rankings table with position + undrafted filters |
| `/players/[id]` | Player detail + season-by-season stats |

## Components

- `src/components/players-table.tsx` — sortable career rankings
- Uses `player_profiles` view and `fantasy_season_stats` table

## Name disambiguation

Players with common names show draft/debut year: `Josh Allen (2018)`.

## Git

Branch: `feature/07-player-pages`  
Commit: `Add player rankings and detail pages with position filters`
