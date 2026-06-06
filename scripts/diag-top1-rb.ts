import { config } from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { draftPickBucket } from "../src/lib/projections/draft-buckets";
import { isCurrentRookie, recentSeasonYears } from "../src/lib/projections/career-complete";

config({ path: path.resolve(process.cwd(), ".env.local") });

const MIN_COHORT_YEAR = 2000;
const PAGE = 1000;

async function fetchAll(supabase: ReturnType<typeof createClient>, table: string, select: string) {
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

function inCohort(career: Record<string, unknown>, isUndrafted: boolean) {
  const debut = career.first_season as number | null;
  const draftYear = career.draft_year as number | null;
  if (isUndrafted) {
    return debut != null && debut >= MIN_COHORT_YEAR;
  }
  return draftYear != null && draftYear >= MIN_COHORT_YEAR;
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  const maxYear = (
    await supabase.from("fantasy_season_stats").select("season_year").order("season_year", { ascending: false }).limit(1).single()
  ).data?.season_year as number;

  const [careers, players] = await Promise.all([
    fetchAll(supabase, "player_career_stats", "player_id, draft_year, draft_pick_overall, draft_position, first_season, last_season, seasons_played"),
    fetchAll(supabase, "players", "id, full_name, is_undrafted, primary_position"),
  ]);

  const playerById = new Map(players.map((p) => [p.id as number, p]));

  const matches: Record<string, unknown>[] = [];

  for (const career of careers) {
    const player = playerById.get(career.player_id as number);
    const isUndrafted = (player?.is_undrafted as boolean) ?? !career.draft_pick_overall;

    if (!inCohort(career, isUndrafted)) continue;
    if ((career.seasons_played as number) < 1) continue;

    if (
      isCurrentRookie(
        career.seasons_played as number,
        career.first_season as number,
        career.last_season as number,
        maxYear,
      )
    ) {
      continue;
    }

    const position = (career.draft_position ?? player?.primary_position ?? "WR") as string;
    const bucket = draftPickBucket(career.draft_pick_overall as number | null, isUndrafted);

    if (bucket === "top-1" && position === "RB") {
      matches.push({
        name: player?.full_name,
        player_id: career.player_id,
        draft_year: career.draft_year,
        draft_pick: career.draft_pick_overall,
        draft_position: career.draft_position,
        primary_position: player?.primary_position,
        first_season: career.first_season,
        last_season: career.last_season,
      });
    }
  }

  console.log("top-1 + RB in draft capital cohort:", matches.length);
  console.log(JSON.stringify(matches, null, 2));

  // Also: anyone with pick #1 in cohort regardless of position
  const allPick1: Record<string, unknown>[] = [];
  for (const career of careers) {
    const player = playerById.get(career.player_id as number);
    const isUndrafted = (player?.is_undrafted as boolean) ?? !career.draft_pick_overall;
    if (!inCohort(career, isUndrafted)) continue;
    if (career.draft_pick_overall !== 1) continue;
    allPick1.push({
      name: player?.full_name,
      draft_year: career.draft_year,
      draft_position: career.draft_position,
      primary_position: player?.primary_position,
      first_season: career.first_season,
    });
  }
  console.log("\nAll #1 overall picks in cohort (any position):", allPick1.length);
  for (const row of allPick1) console.log(row);
}

main().catch(console.error);
