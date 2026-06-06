# Fresh Start Setup — New GitHub + New Supabase

FFB4 is **not** a fork or extension of FFB3's infrastructure. We reused *ideas and code patterns* from FFB3, but everything else starts empty.

| Resource | FFB3 | FFB4 |
|----------|------|------|
| GitHub repo | `project-ffb3` | **`project-ffb4`** (create new) |
| Supabase project | old project | **new project** (create new) |
| `.env.local` | old keys | **new keys** |
| Database data | existing rows | **empty until you import** |
| Vercel deployment | (if any) | **new deployment** (later) |

Do **not** point FFB4 at FFB3's Supabase URL or copy FFB3's `.env.local` values.

---

## Step 1 — Create a new Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New project**
3. Name it something like `project-ffb4` (name is for your reference only)
4. Choose a region and set a database password — save the password somewhere safe
5. Wait for the project to finish provisioning

### Get API keys

In the new project: **Project Settings → API**

Copy these into `.env.local` (see step 3):

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **Publishable key** → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **Secret key** (service role) → `SUPABASE_SECRET_KEY`

The secret key is only for local import scripts. Never commit it or expose it in the browser.

### Get database connection string (for migrations)

Click the green **Connect** button at the top of the dashboard (not the Schema Visualizer page).

1. Tab: **Connection string** → **URI**
2. Mode: **Session pooler** (Shared Pooler, IPv4) — **not** Direct Connection
3. Copy the URI. It looks like:

```text
postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Add to `.env.local` as `DATABASE_URL=...`

**Password rules in the URI:**

| Mistake | Fix |
|---------|-----|
| `[YOUR-PASSWORD]` left as literal text | Replace with your real password, **no square brackets** |
| Password contains `!`, `@`, `#` | URL-encode (`!` → `%21`) or use Supabase's copy button |
| `postgres` user on `db.xxx.supabase.co` (direct) | Use **pooler** host and `postgres.<project-ref>` user |

Direct connection (`db.<ref>.supabase.co`) often fails on IPv4 networks. Session pooler is the reliable default.

---

## Step 2 — Create a new GitHub repository

1. Go to [github.com/new](https://github.com/new)
2. Repository name: `project-ffb4`
3. Description (optional): "Fantasy football player database — clean rebuild"
4. **Do not** initialize with README, .gitignore, or license (we already have those locally)
5. Create the repository

### Connect your local repo

From the `project-ffb4` folder:

```bash
git remote add origin https://github.com/drewhenson2024-gif/project-ffb4.git
git push -u origin main
```

Verify on GitHub that you see the commit history with feature-branch merges — not FFB3's repo.

---

## Step 3 — Local environment

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local` with four values from your **new** Supabase project:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
DATABASE_URL=postgresql://postgres.<project-ref>:...@aws-0-<region>.pooler.supabase.com:5432/postgres
```

`.env.local` is gitignored. Each machine and each developer uses their own copy.

---

## Step 4 — Run migrations from Cursor's terminal

**Recommended (no browser login required):**

```bash
npm run db:push
```

This uses `DATABASE_URL` from `.env.local` via the Supabase CLI. All four files in `supabase/migrations/` are applied in order. Empty tables after this step is correct.

If `db:push` without a linked project fails, pass the URL explicitly (PowerShell):

```powershell
$url = (Get-Content .env.local | Where-Object { $_ -match '^DATABASE_URL=' }) -replace '^DATABASE_URL=',''
npx supabase db push --db-url $url --yes
```

<details>
<summary>Alternative A: Supabase CLI login + link</summary>

```bash
npx supabase login    # opens browser — spell "supabase" correctly
npm run db:link       # enter project ref + database password
npm run db:push
```

</details>

<details>
<summary>Alternative B: Supabase web SQL Editor</summary>

Dashboard → SQL Editor → paste each file manually:

1. `supabase/migrations/001_player_fantasy_schema.sql`
2. `supabase/migrations/002_player_identity_metadata.sql`
3. `supabase/migrations/003_fix_refresh_career_stats.sql`
4. `supabase/migrations/004_expand_draft_history.sql`

</details>

---

## Step 5 — Import data (first time only)

This downloads nflverse CSVs and fills your **new** empty database:

```bash
npm run import:data
```

The import script also calls `refresh_player_career_stats()` via RPC at the end. A separate refresh step is only needed if that RPC fails.

Expected output (approximate):

- ~4,900 players
- ~3,600 draft picks (1980+)
- ~14,000 season stat rows

Cached CSVs land in `data/cache/` (gitignored). **NFL data is not stored in GitHub** — it lives in Supabase and is loaded by the website at runtime.

---

## Step 6 — Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You should see player counts and a link to **Browse player rankings**.

Verify:

- `/players` — career rankings with position filters
- `/players/<id>` — player detail with season log

---

## Checklist (baseline — phases 00–09)

- [x] New Supabase project created (not FFB3)
- [x] All 4 migrations run on empty database
- [x] New GitHub repo `project-ffb4` created (not linked to FFB3)
- [x] `git remote -v` points to the new repo
- [x] `.env.local` has Supabase API keys + `DATABASE_URL` (pooler)
- [x] `npm run import:data` completed
- [x] Career stats refreshed (via import script)
- [x] Homepage shows player counts

**Next phase:** [10 — Player valuation](../roadmap.md) (planned — design doc first)

---

## What we copied vs what is new

**Copied (code only):** Next.js app structure, SQL schema design, import scripts, UI patterns — the parts of FFB3 that worked before predictions.

**New (infrastructure):** GitHub repository, Supabase project, environment secrets, database rows, deployment targets.

**In GitHub (not in repo):** nflverse CSV cache, `.env.local` secrets, Supabase row data.
