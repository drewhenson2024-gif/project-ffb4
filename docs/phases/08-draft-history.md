# Phase 08 — Draft History 1980+

## Goal

Link veterans drafted before 2000 to their 2000+ fantasy stats (e.g. Tom Brady, 1999 draft class).

## Problem

Fantasy stats only exist from 2000 onward. Draft data back to 1980 lets us attach pre-2000 draft context to modern stat lines.

## Changes

- Migration `004_expand_draft_history.sql` — relax `draft_year` check to `>= 1980`
- Import script pulls draft CSV from 1980+
- Homepage copy updated

## Git

Branch: `feature/08-draft-history`  
Commit: `Expand draft import to 1980+ for pre-2000 drafted veterans`
