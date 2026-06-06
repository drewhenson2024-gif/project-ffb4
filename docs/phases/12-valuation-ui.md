# Phase 12 — Valuation UI & Draft Capital

## Goal

Surface phase 11 career projections on the website in two views:

1. **Active valuations** — projected remaining PAB for every current NFL player (non-rookie).
2. **Draft capital** — historical average career PAB by draft pick segment × position (rookies since 2000, excluding current-year rookies).

Both views use the **same league config** as `/pab` (cookie-backed).

## Scope

| Included | Excluded |
|----------|----------|
| `/valuations` — sortable active player table | Dynasty calibration (phase 13+) |
| `/draft-capital` — segment × position averages | Per-player draft capital page |
| `resolveLeagueConfig()` cookie + `/pab` form sync | Caching / incremental projection refresh |
| Draft pick segmentation (round 1 slices + R2–7 halves) | Round 8+ picks (excluded from buckets) |

## Draft pick segments

Round 1 uses **exclusive** overall-pick bands (32 picks per round, NFL standard):

| Bucket ID | Overall picks | Label |
|-----------|---------------|-------|
| `top-1` | 1 | Top 1 |
| `top-2` | 2 | Top 2 |
| `top-4` | 3–4 | Top 4 |
| `top-8` | 5–8 | Top 8 |
| `top-16` | 9–16 | Top 16 |
| `top-32` | 17–32 | Top 32 |
| `r2-first` … `r7-second` | Each round 2–7 split: picks 1–16 vs 17–32 in round | Per-round halves |
| `undrafted` | — | Undrafted |

Picks in round 8+ are excluded from segment averages.

### Smoothing (display values)

Mirrors **Fantasy Football 1.0 → DraftPickValue** tab:

1. **Four position-specific log curves** — `V(p) = intercept − slope × ln(p)` per QB/RB/WR/TE column (no shared slope across positions).
2. **Fit** — weighted L1 on middle buckets (Top 4 through Round 7; Top 1 / Top 2 excluded as outliers). Coarse grid + local refinement; position-tuned slope bounds.
3. **Display** — each bucket = `AVERAGE` of per-pick log values over its pick range (FF1 DraftPickValue pattern). Top 1 / Top 2 and tail come from that position's curve.
4. **Monotone** — guaranteed by `slope > 0` on the log (each pick strictly ≤ prior pick).
5. **Band calibration** — after fit, small vertical offsets per round band (R1, R2–3, R4–7) pull each band’s net delta toward zero while preserving slope; offsets are capped at picks 33 and 97 for monotonicity.

`rawCells` retained for comparison; UI shows delta when |Δ| ≥ 0.5 PAB.

## Player inclusion (draft capital)

- **Drafted:** `draft_year >= 2000`
- **Undrafted:** `first_season >= 2000`
- Paginated career/player loads (Supabase 1000-row page limit)
- Skip **current-year rookies** (`isCurrentRookie`)
- **Metric:** total career PAB — realized for completed careers; realized + projected remaining for active players

## Active valuations

- Source: `runCareerProjections()` (phase 11 pipeline)
- Skip completed careers and current-year rookies (same rules as training)
- Default sort: projected remaining PAB descending
- Columns: player, position, draft, years played, realized PAB, projected remaining, total career PAB

## League config

| Piece | Behavior |
|-------|----------|
| `/pab` form submit | Write `ffb4_league_config` cookie + URL params |
| `/valuations`, `/draft-capital` | Read cookie server-side → `resolveLeagueConfig()` |
| No cookie | `DEFAULT_LEAGUE_CONFIG` (16-team PPR) |

## Files

```
src/lib/pab/resolve-league-config.ts — resolveLeagueConfig() (server-only)
src/lib/pab/league-config-cookie.ts — cookie name + serialize
src/lib/projections/draft-buckets.ts
src/lib/projections/draft-capital.ts
src/lib/projections/valuation-rows.ts

src/app/valuations/page.tsx
src/app/draft-capital/page.tsx
src/components/valuations-table.tsx
src/components/draft-capital-table.tsx
src/components/league-config-form.tsx  — set cookie on submit
```

## Acceptance criteria

- [ ] `/valuations` lists active projected players with PAB columns
- [ ] `/draft-capital` shows avg total career PAB per segment × position with sample sizes
- [ ] Changing league settings on `/pab` updates both pages after cookie is set
- [ ] Current-year rookies excluded from both views
- [ ] Roadmap updated; phase 11 marked done

## Git

Branch: `feature/12-valuation`
