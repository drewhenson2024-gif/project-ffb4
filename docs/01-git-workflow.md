# Git Workflow — FFB4

This project uses git as a **timeline of decisions**. Every meaningful step gets its own commit on a feature branch, then merges back to `main`. This section explains *why* and *how*.

## Core rules

1. **`main` is always runnable.** Do not commit broken code to `main`.
2. **One logical change per commit.** A commit should answer: "What did we accomplish?"
3. **Use feature branches for every phase.** Branch name format: `feature/NN-short-name` (e.g. `feature/03-database-schema`).
4. **Merge with `--no-ff`** to preserve branch history in the graph.
5. **Write commit messages in imperative mood:** "Add homepage" not "Added homepage".

## Branching model

```
main
 │
 ├── feature/01-scaffold
 ├── feature/02-supabase-client
 ├── feature/03-database-schema
 └── ...
```

We use a simple **feature-branch workflow** (not Git Flow). No long-lived `develop` branch — `main` is the integration branch.

## Daily commands you will use

### Start a new feature

```bash
git checkout main
git pull origin main          # after remote is set up
git checkout -b feature/05-player-identity
```

### Check what changed

```bash
git status                    # staged vs unstaged files
git diff                      # unstaged changes
git diff --staged             # staged changes (what the next commit will include)
git log --oneline --graph -15 # recent history with branch merges
```

### Commit (only related files)

```bash
git add src/lib/supabase/server.ts .env.example
git commit -m "Add Supabase server client and environment template"
```

**Avoid** `git add .` unless you have reviewed every changed file.

### Finish a feature

```bash
git checkout main
git merge feature/05-player-identity --no-ff -m "Merge feature/05-player-identity: player identity metadata"
git branch -d feature/05-player-identity
```

### Push to GitHub

```bash
git push -u origin main
git push -u origin feature/05-player-identity   # optional: share branch before merge
```

## Commit message format

```
Short summary (50 chars or less)

Optional body explaining WHY, not just what.
Reference design doc: docs/phases/05-player-identity.md
```

**Good examples from this repo:**

- `Scaffold Next.js app with TypeScript and Tailwind`
- `Add normalized player, draft, and fantasy stats schema`
- `Expand draft import to 1980+ for pre-2000 drafted veterans`

**Bad examples:**

- `fix stuff`
- `WIP`
- `updates`

## When you need to rework something

This is normal — especially before we tackle predictions again.

### Small fix on current branch

Stay on your feature branch, fix, commit:

```bash
git add scripts/import-nflverse.ts
git commit -m "Dedupe rare double-drafted players during import"
```

### Fix after merge (new branch)

Never rewrite `main` history if already pushed. Branch from `main`:

```bash
git checkout main
git checkout -b fix/import-pagination
# make fix
git commit -m "Fix import pagination for large player batches"
git checkout main
git merge fix/import-pagination --no-ff
```

### Inspect an old version

```bash
git log --oneline -- scripts/import-nflverse.ts   # commits touching a file
git show abc1234:scripts/import-nflverse.ts       # file at that commit
```

## Connecting to GitHub

`gh` is not required. After creating a repo on GitHub:

```bash
git remote add origin https://github.com/YOUR_USER/project-ffb4.git
git push -u origin main
```

## What we deliberately avoid (for now)

- **Force push to `main`** — destroys shared history
- **`git commit --amend` on pushed commits** — rewrites history others may rely on
- **Giant commits** mixing schema + UI + scripts — hard to review and revert

## Phase ↔ branch ↔ doc mapping

See [roadmap.md](./roadmap.md). Each phase has:

- A design doc in `docs/phases/`
- A matching feature branch
- At least one focused commit before merge
