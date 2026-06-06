# Phase 09 — Import Dedupe Fix

## Goal

Handle rare nflverse cases where the same player appears twice in draft data (e.g. supplemental picks).

## Change

Import script deduplicates by player identity before upserting `draft_picks`.

## Git

Branch: `feature/09-import-dedupe`  
Commit: `Dedupe rare double-drafted players during import`
