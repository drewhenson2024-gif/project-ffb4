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
- **Publishable key** (anon/public) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **Secret key** (service role) → `SUPABASE_SECRET_KEY`

The secret key is only for local import scripts. Never commit it or expose it in the browser.

### Run migrations from Cursor's terminal (recommended)

We use the [Supabase CLI](https://supabase.com/docs/guides/cli) so you never copy-paste SQL into a browser.

**One-time CLI setup** (run in Cursor terminal from project root):

```bash
npx supabase login
npm run db:link
```

`db:link` asks for your **project ref** — the short ID in your Supabase dashboard URL:
`https://supabase.com/dashboard/project/<project-ref>`.

Enter your database password when prompted.

**Push all migrations** to your empty database:

```bash
npm run db:push
```

This runs every file in `supabase/migrations/` in order. You should end up with empty tables (`players`, `draft_picks`, etc.) — that is correct.

<details>
<summary>Alternative: Supabase web SQL Editor</summary>

Dashboard → SQL Editor → paste each file manually:

1. `supabase/migrations/001_player_fantasy_schema.sql`
2. `supabase/migrations/002_player_identity_metadata.sql`
3. `supabase/migrations/003_fix_refresh_career_stats.sql`
4. `supabase/migrations/004_expand_draft_history.sql`

</details>

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

Edit `.env.local` with keys from your **new** Supabase project (step 1).

`.env.local` is gitignored. Each machine and each developer uses their own copy.

---

## Step 4 — Import data (first time only)

This downloads nflverse CSVs and fills your **new** empty database:

```bash
npm run import:data
```

Then refresh career totals from the terminal:

```bash
npx supabase db execute --sql "select refresh_player_career_stats();"
```

Import can take several minutes. Cached CSVs land in `data/cache/` (gitignored).

---

## Step 5 — Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You should see player counts once import + refresh complete.

---

## Checklist

- [ ] New Supabase project created (not FFB3)
- [ ] All 4 migrations run on empty database
- [ ] New GitHub repo `project-ffb4` created (not linked to FFB3)
- [ ] `git remote -v` points to the new repo
- [ ] `.env.local` has new Supabase keys
- [ ] `npm run import:data` completed
- [ ] `refresh_player_career_stats()` ran successfully
- [ ] Homepage shows player counts

---

## What we copied vs what is new

**Copied (code only):** Next.js app structure, SQL schema design, import scripts, UI patterns — the parts of FFB3 that worked before predictions.

**New (infrastructure):** GitHub repository, Supabase project, environment secrets, database rows, deployment targets.
