/**
 * Walk through dynasty pick value calculation for one sample year.
 * Run: npx tsx scripts/explain-dynasty-picks.ts
 */
import { config } from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_LEAGUE_CONFIG } from "../src/lib/pab/types";
import { buildDraftCapitalReport } from "../src/lib/projections/draft-capital";
import { draftCapitalAtPick } from "../src/lib/projections/draft-capital-smooth";
import {
  computeDynastyPickValues,
  DYNASTY_PICK_HISTORY_YEARS,
  DYNASTY_PICK_POOL_SIZE,
} from "../src/lib/projections/dynasty-pick-values";
import { loadAllSeasonStats } from "../src/lib/projections/season-data";

config({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const leagueConfig = DEFAULT_LEAGUE_CONFIG;

  const [capitalReport, seasonRows, { data: draftPicks }] = await Promise.all([
    buildDraftCapitalReport(supabase, leagueConfig),
    loadAllSeasonStats(supabase),
    supabase.from("draft_picks").select("draft_year, pick_overall, position"),
  ]);

  const currentSeason = Math.max(...seasonRows.map((r) => r.season_year));
  const picksByYear = new Map<number, { draft_year: number; pick_overall: number; position: string }[]>();
  for (const p of draftPicks ?? []) {
    if (p.draft_year < 2000) continue;
    const list = picksByYear.get(p.draft_year) ?? [];
    list.push(p);
    picksByYear.set(p.draft_year, list);
  }

  const yearsUsed = [...picksByYear.keys()]
    .filter((y) => y !== currentSeason)
    .sort((a, b) => b - a)
    .slice(0, DYNASTY_PICK_HISTORY_YEARS)
    .sort((a, b) => a - b);

  const sampleYear = 2017;
  const models = capitalReport.models;

  console.log("=== Step 0: Draft capital curves (from /draft-capital) ===\n");
  for (const pos of ["QB", "RB", "WR", "TE"] as const) {
    const m = models[pos];
    console.log(
      `  ${pos}: intercept=${m.intercept.toFixed(1)}, slope=${m.slope.toFixed(1)}, offsets R1=${m.segmentOffsets.round1.toFixed(1)} R2-3=${m.segmentOffsets.rounds2_3.toFixed(1)} R4-7=${m.segmentOffsets.rounds4_7.toFixed(1)}`,
    );
  }

  console.log(`\n=== Step 1: Score every ${sampleYear} pick on the curve ===\n`);
  console.log("  value = draftCapitalAtPick(position, nfl_pick_overall)");
  console.log("  (per-pick smoothed log curve — not career PAB)\n");

  const yearPicks = (picksByYear.get(sampleYear) ?? [])
    .filter((p) => ["QB", "RB", "WR", "TE"].includes(p.position))
    .map((p) => ({
      ...p,
      value: draftCapitalAtPick(models[p.position as keyof typeof models], p.pick_overall),
    }))
    .sort((a, b) => b.value - a.value);

  console.log(`  Top 10 of ${yearPicks.length} skill picks in ${sampleYear}:`);
  for (const p of yearPicks.slice(0, 10)) {
    console.log(
      `    rank-by-value  ${p.position} pick ${String(p.pick_overall).padStart(3)} → ${p.value.toFixed(1)}`,
    );
  }

  const top48 = yearPicks.slice(0, DYNASTY_PICK_POOL_SIZE);
  console.log(`\n=== Step 2: Keep top ${DYNASTY_PICK_POOL_SIZE} for ${sampleYear} ===\n`);
  console.log(`  Rank 1 value: ${top48[0]?.value.toFixed(1)}`);
  console.log(`  Rank 7 value: ${top48[6]?.value.toFixed(1)}`);
  console.log(`  Rank 48 value: ${top48[47]?.value.toFixed(1)}`);

  const rows = computeDynastyPickValues(
    models,
    picksByYear as Map<number, { draft_year: number; pick_overall: number; position: "QB" | "RB" | "WR" | "TE" }[]>,
    yearsUsed,
    DYNASTY_PICK_POOL_SIZE,
    leagueConfig.teams,
  );

  console.log(`\n=== Step 3: Average each rank across ${yearsUsed.length} years ===\n`);
  console.log(`  Years: ${yearsUsed[0]}–${yearsUsed[yearsUsed.length - 1]} (exclude ${currentSeason})\n`);
  for (const rank of [1, 7, 12, 24, 48]) {
    const row = rows[rank - 1];
    console.log(
      `  Rank ${row.rank} (${row.slotLabel}): avg = ${row.avgCapitalValue.toFixed(1)}  (n=${row.sampleYears} years)`,
    );
  }
}

main().catch(console.error);
