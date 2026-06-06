# Phase 10 — PAB Calculations

## Goal

Compute **Points Above Bench (PAB)** tier rates from historical season data and league roster settings — without career projections or dynasty valuation.

## Scope (this phase)

| Included | Excluded (later phases) |
|----------|-------------------------|
| League tier thresholds (elite / star / starter / bench) | Career projection models |
| Position PAB rates from last 6 seasons | Dynasty calibration |
| Season classification helpers | Projected remaining PAB |
| `/pab` page with league config form | Full player valuation UI |

## How PAB works

1. **Thresholds** — derived from league size, starters per position, and bench spots.
2. **Classification** — each season, rank all QBs/RBs/WRs/TEs at that position; assign tiers by rank.
3. **Tier averages** — mean fantasy points per tier across the last 6 seasons.
4. **PAB rate** — per-tier value above bench average (bench PAB = 0).

Realized career PAB for a player = sum of PAB rates for each elite/star/starter season they played.

## Files

```
src/lib/pab/
  types.ts           — LeagueConfig, tiers, defaults
  thresholds.ts      — rank → tier from league settings
  scoring.ts           — PPR / half / standard column
  compute-pab.ts     — position PAB rates
  classify-seasons.ts — per-player season tiers + realized PAB
  career-pab.ts        — tier count math
  season-data.ts       — load seasons from Supabase
  parse-config.ts      — URL search params ↔ league config

src/app/pab/page.tsx
src/components/league-config-form.tsx
src/components/pab-results.tsx
```

## Route

`/pab` — adjust league settings, view tier thresholds and PAB rates by position.

## Git

Branch: `feature/10-player-evaluation`

## Next (phase 11+)

- Show realized career PAB on player pages
- Career projections (FFB3 lesson: design doc first)
