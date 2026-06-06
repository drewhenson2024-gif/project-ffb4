import { config } from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { draftPickBucket } from "../src/lib/projections/draft-buckets";
import { isCurrentRookie, recentSeasonYears } from "../src/lib/projections/career-complete";

config({ path: path.resolve(process.cwd(), ".env.local") });

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

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  const careersPaged = await fetchAll(supabase, "player_career_stats", "player_id, draft_year, draft_pick_overall, first_season, last_season, seasons_played");
  const { data: careersSingle } = await supabase.from("player_career_stats").select("player_id, draft_year, draft_pick_overall, first_season, last_season, seasons_played");

  const maxYear = (
    await supabase.from("fantasy_season_stats").select("season_year").order("season_year", { ascending: false }).limit(1).single()
  ).data?.season_year as number;

  const players = await fetchAll(supabase, "players", "id, is_undrafted");
  const playerById = new Map(players.map((p) => [p.id as number, p]));

  let after2000 = 0;
  let hasSeasons = 0;
  let notRookie = 0;
  let hasBucket = 0;
  let noBucket = 0;
  let skippedRookie = 0;

  for (const career of careersPaged) {
    const player = playerById.get(career.player_id as number);
    const isUndrafted = (player?.is_undrafted as boolean) ?? !career.draft_pick_overall;
    const draftYear = career.draft_year as number | null;
    const firstSeason = career.first_season as number | null;
    const inCohort = isUndrafted
      ? firstSeason != null && firstSeason >= 2000
      : draftYear != null && draftYear >= 2000;
    if (!inCohort) continue;
    after2000++;
    if ((career.seasons_played as number) < 1) continue;
    hasSeasons++;

    if (isCurrentRookie(career.seasons_played as number, career.first_season as number, career.last_season as number, maxYear)) {
      skippedRookie++;
      continue;
    }
    notRookie++;

    const bucket = draftPickBucket(career.draft_pick_overall as number | null, isUndrafted);
    if (bucket) hasBucket++;
    else noBucket++;
  }

  console.log({
    careersSinglePage: careersSingle?.length ?? 0,
    careersPaged: careersPaged.length,
    afterFirstSeason2000: after2000,
    hasSeasons,
    notRookie,
    skippedRookie,
    hasBucket,
    noBucket,
    expectedCohort: hasBucket,
  });
}

main().catch(console.error);
