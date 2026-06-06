# Phase 04 — Homepage

## Goal

Landing page that detects database state and guides setup.

## Behavior

1. **Missing tables** → show setup notice (run migrations)
2. **Empty database** → show import instructions
3. **Data present** → show player/career counts + link to rankings

## Files added

- `src/app/page.tsx`
- `src/components/setup-notice.tsx`

## Git

Branch: `feature/04-homepage`  
Commit: `Add homepage with database status and setup guidance`
