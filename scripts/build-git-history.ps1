# Builds incremental git history for teaching purposes.
# Selectively stages files per phase — does not delete working tree files.
# Run: powershell -ExecutionPolicy Bypass -File scripts/build-git-history.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

if (Test-Path ".git") {
  Write-Host "Removing existing .git..."
  Remove-Item -Recurse -Force ".git"
}

function Git-Commit {
  param([string]$Message, [string[]]$Add)
  git add @Add
  git commit -m $Message
}

function Merge-Feature {
  param([string]$Branch, [string]$Message)
  git checkout main
  git merge $Branch --no-ff -m $Message
  git branch -d $Branch
}

git init
git checkout -b main

# Phase 00: documentation
Git-Commit "Add project documentation and git workflow guide" @("docs", "README.md")

# Phase 01: scaffold
git checkout -b feature/01-scaffold
Git-Commit "Scaffold Next.js app with TypeScript and Tailwind" @(
  ".gitignore", "package.json", "package-lock.json",
  "next.config.ts", "tsconfig.json", "eslint.config.mjs", "postcss.config.mjs",
  "AGENTS.md", "CLAUDE.md", "public",
  "src/app/layout.tsx", "src/app/globals.css", "src/app/favicon.ico"
)
Merge-Feature "feature/01-scaffold" "Merge feature/01-scaffold: Next.js scaffold"

# Phase 02: supabase client
git checkout -b feature/02-supabase-client
Git-Commit "Add Supabase client and environment template" @(
  ".env.example", "src/lib/supabase.ts", "src/lib/supabase"
)
Merge-Feature "feature/02-supabase-client" "Merge feature/02-supabase-client: Supabase client"

# Phase 03: database schema
git checkout -b feature/03-database-schema
Git-Commit "Add player, draft, and fantasy stats database schema" @(
  "supabase/migrations/001_player_fantasy_schema.sql", "src/types/database.ts"
)
Merge-Feature "feature/03-database-schema" "Merge feature/03-database-schema: database schema"

# Phase 04: homepage
git checkout -b feature/04-homepage
Git-Commit "Add homepage with database status and setup guidance" @(
  "src/app/page.tsx", "src/components/setup-notice.tsx"
)
Merge-Feature "feature/04-homepage" "Merge feature/04-homepage: homepage"

# Phase 05: player identity
git checkout -b feature/05-player-identity
Git-Commit "Add player identity metadata for imports and name disambiguation" @(
  "supabase/migrations/002_player_identity_metadata.sql"
)
Merge-Feature "feature/05-player-identity" "Merge feature/05-player-identity: player identity"

# Phase 06: data import
git checkout -b feature/06-data-import
Git-Commit "Fix career stats refresh for Supabase DELETE policy" @(
  "supabase/migrations/003_fix_refresh_career_stats.sql"
)
Git-Commit "Add nflverse import pipeline for draft and fantasy data" @(
  "scripts/import-nflverse.ts", "scripts/lib/nflverse.ts", "src/lib/normalize-name.ts", "package.json"
)
Merge-Feature "feature/06-data-import" "Merge feature/06-data-import: nflverse import"

# Phase 07: player pages
git checkout -b feature/07-player-pages
Git-Commit "Add player rankings and detail pages with position filters" @(
  "src/app/players", "src/components/players-table.tsx"
)
Merge-Feature "feature/07-player-pages" "Merge feature/07-player-pages: player pages"

# Phase 08: draft history 1980+
git checkout -b feature/08-draft-history
Git-Commit "Expand draft import to 1980+ for pre-2000 drafted veterans" @(
  "supabase/migrations/004_expand_draft_history.sql",
  "src/app/page.tsx",
  "scripts/import-nflverse.ts",
  "scripts/lib/nflverse.ts"
)
Merge-Feature "feature/08-draft-history" "Merge feature/08-draft-history: draft history 1980+"

# Phase 09: import dedupe
git checkout -b feature/09-import-dedupe
Git-Commit "Dedupe rare double-drafted players during import" @("scripts/import-nflverse.ts")
Merge-Feature "feature/09-import-dedupe" "Merge feature/09-import-dedupe: import dedupe"

# Meta: history builder script
Git-Commit "Add script to recreate teaching git history" @("scripts/build-git-history.ps1")

Write-Host "`nGit history built. Run: git log --oneline --graph -30"
