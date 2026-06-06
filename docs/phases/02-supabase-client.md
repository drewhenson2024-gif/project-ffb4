# Phase 02 — Supabase Client

## Goal

Wire up Supabase connection for server-side data fetching in Next.js App Router.

## Environment variables

Copy `.env.example` to `.env.local` and fill in values from the [Supabase dashboard](https://supabase.com/dashboard):

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public anon/publishable key |
| `SUPABASE_SECRET_KEY` | Service role key (import scripts only) |

## Files added

- `.env.example`
- `src/lib/supabase.ts` — browser client (future use)
- `src/lib/supabase/server.ts` — server component client

## Design choice

Server components call `createServerClient()` directly. We avoid fetching league data in client components to keep secrets out of the bundle.

## Git

Branch: `feature/02-supabase-client`  
Commit: `Add Supabase client and environment template`
