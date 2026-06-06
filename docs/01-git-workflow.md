# Git Workflow — FFB4

This project uses git as a **timeline of decisions** — one entry on `main` per roadmap phase when possible. This section explains *why* and *how*.

## Core rules

1. **`main` is always runnable.** Do not commit broken code to `main`.
2. **One commit per phase on `main` (preferred).** When a phase is done and tested, land it as a single commit.
3. **Phase-labeled messages.** Every commit names its phase: `Phase 10: ...`
4. **Sub-commits when needed.** If a phase requires multiple commits, use `Phase 10.a`, `Phase 10.b`, etc. — never unlabeled `WIP` or `fix stuff`.
5. **Use feature branches for work in progress.** Branch format: `feature/NN-short-name` (e.g. `feature/10-player-evaluation`). Squash to one commit on `main` when the phase ships.
6. **Write commit messages in imperative mood:** "Add PAB rates page" not "Added PAB rates page".

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

### Finish a feature (one commit on `main`)

```bash
git checkout main
git merge --squash feature/10-player-evaluation
git commit -m "Phase 10: PAB calculations (tier rates, /pab page, roadmap)"
git push origin main
git branch -d feature/10-player-evaluation
```

`--squash` combines all branch work into **one** commit on `main` — no extra merge commit.

### Push to GitHub

```bash
git push -u origin main
git push -u origin feature/05-player-identity   # optional: share branch before merge
```

## Commit message format

### Single commit (preferred — phase complete)

```
Phase NN: short description of what shipped
```

Examples:

- `Phase 10: PAB calculations (tier rates, /pab page, roadmap)`
- `Phase 09: import dedupe for double-drafted players`
- `Phase 03: player, draft, and fantasy stats database schema`

### Multiple commits in one phase (when necessary)

Use letter suffixes so history stays scannable:

```
Phase NN.a: first logical chunk
Phase NN.b: second logical chunk
Phase NN.c: docs / roadmap update for phase
```

Examples for phase 11:

- `Phase 11.a: career projection types and training data loader`
- `Phase 11.b: projection model and backtest script`
- `Phase 11.c: wire realized + projected PAB to player pages`

**Rules for sub-commits:**

- Letters are sequential (`a`, `b`, `c`) within the same phase.
- Each sub-commit is still one logical unit — not "save every 10 minutes."
- Prefer squashing `10.a` + `10.b` into one `Phase 10:` commit on `main` when the phase is done.

**Bad examples:**

- `fix stuff`
- `WIP`
- `updates`
- `Adding NFL Data` (no phase number)

### Non-phase work — **Chore** commits

Use **Chore** for changes that are **not** part of a roadmap phase: git docs, README tweaks, tooling, repo hygiene, commit-policy updates, etc.

```
Chore N: short description of what changed
```

`N` increments across the whole project (`Chore 1`, `Chore 2`, …) — not per category.

Examples:

- `Chore 1: define phase and chore commit message formats`
- `Chore 2: fix typo in fresh-start setup checklist`
- `Chore 3: add postgres to lockfile project name`

If a chore needs multiple commits before it is done, use letter suffixes like phases:

- `Chore 4.a: draft git workflow rewrite`
- `Chore 4.b: align README setup steps with workflow doc`

**Phase vs Chore:**

| Label | When to use |
|-------|-------------|
| `Phase NN` | Roadmap feature work ([roadmap.md](./roadmap.md)) |
| `Chore N` | Everything else (docs, git rules, deps hygiene, unrelated fixes) |

## When you need to rework something

This is normal — especially before we tackle predictions again.

### Small fix on current branch

Stay on your feature branch, fix, commit with phase label:

```bash
git add scripts/import-nflverse.ts
git commit -m "Phase 09.b: dedupe rare double-drafted players during import"
```

### Fix after merge (new branch)

Never rewrite `main` history if already pushed. Branch from `main`:

```bash
git checkout main
git checkout -b fix/import-pagination
# make fix
git commit -m "Chore 5: fix import pagination for large player batches"
git checkout main
git merge fix/import-pagination --no-ff
```

### Inspect an old version

```bash
git log --oneline -- scripts/import-nflverse.ts   # commits touching a file
git show abc1234:scripts/import-nflverse.ts       # file at that commit
```

## Connecting to GitHub

FFB4 uses a **separate** GitHub repository from FFB3. Create `project-ffb4` as a new repo — do not push to the FFB3 remote.

`gh` is not required. After creating the new repo on GitHub:

```bash
git remote add origin https://github.com/drewhenson2024-gif/project-ffb4.git
git push -u origin main
```

Confirm with `git remote -v` that the URL says `project-ffb4`, not `project-ffb3`.

## What we deliberately avoid (for now)

- **Unlabeled commits** — always include `Phase NN`, `Phase NN.a`, or `Chore N`
- **Multiple merge commits per phase** — use `--squash`, not `--no-ff`, for one commit on `main`
- **`git commit --amend` on pushed commits** — rewrites history; squash locally before first push instead
- **Force push to `main`** — only when squashing already-pushed phase commits (rare; coordinate first)
- **Secrets in commits** — `.env.local` stays gitignored

## When to commit

| Situation | Commit? | Message style |
|-----------|---------|---------------|
| Phase complete and tested | Yes — one on `main` | `Phase 10: ...` |
| Large phase split into steps | Yes — on branch | `Phase 11.a`, `Phase 11.b`, ... |
| Docs/git/tooling (not a phase) | Yes | `Chore N: ...` |
| Broken / half-done | No | — |
| Typo fix before phase ships | Bundle into phase commit | — |
| `.env.local` changes | Never | — |

## Phase ↔ branch ↔ doc mapping

See [roadmap.md](./roadmap.md). Each phase has:

- A design doc in `docs/phases/`
- A matching feature branch (optional but recommended)
- **One commit on `main`** when shipped (or `NN.a` / `NN.b` if split, then squash if desired)
