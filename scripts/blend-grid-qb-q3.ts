/** Print full blend MAE grid for QB-Q3 on held-out test checkpoints. */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "node:path";
import { careerPabFromTierCounts } from "../src/lib/pab/career-pab";
import { DEFAULT_LEAGUE_CONFIG } from "../src/lib/pab/types";
import {
  buildAllCheckpoints,
  buildPlayerCareers,
} from "../src/lib/projections/checkpoints";
import { isCareerComplete, recentSeasonYears } from "../src/lib/projections/career-complete";
import { checkpointToCompCandidate } from "../src/lib/projections/comp-matching";
import { predictCheckpoint } from "../src/lib/projections/projection-predict";
import { trainProjectionModels } from "../src/lib/projections/projection-models";
import {
  buildPlayerSeasonPab,
  buildTierRatesByPosition,
  type CareerMeta,
  type SeasonStatRow,
} from "../src/lib/projections/player-profiles";

config({ path: path.resolve(process.cwd(), ".env.local") });

const BLENDS = Array.from({ length: 11 }, (_, i) => i / 10);

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const maxYear = (
    await supabase.from("fantasy_season_stats").select("season_year").order("season_year", { ascending: false }).limit(1).single()
  ).data?.season_year as number;

  type PlayerRow = { id: number; is_undrafted: boolean; primary_position: string; birth_date: string | null };

  const PAGE = 1000;
  async function fetchAll<T>(table: string, select: string) {
    const rows: T[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase.from(table).select(select).range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...(data as T[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return rows;
  }

  const [seasons, careers, players] = await Promise.all([
    fetchAll<SeasonStatRow>("fantasy_season_stats", "player_id, season_year, position, fantasy_points_ppr, fantasy_points_half_ppr, fantasy_points_standard, games_played"),
    fetchAll<CareerMeta>("player_career_stats", "player_id, draft_year, draft_pick_overall, draft_position, last_season, first_season"),
    fetchAll<PlayerRow>("players", "id, is_undrafted, primary_position, birth_date"),
  ]);

  const recent = new Set(recentSeasonYears(maxYear));
  const recentPlayers = new Set(seasons.filter((r) => recent.has(r.season_year)).map((r) => r.player_id));
  const completeIds = new Set(careers.filter((c) => isCareerComplete(c.last_season, recentPlayers.has(c.player_id), maxYear)).map((c) => c.player_id));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const ratesByPosition = buildTierRatesByPosition(DEFAULT_LEAGUE_CONFIG, seasons, maxYear);
  const seasonPab = buildPlayerSeasonPab(seasons, DEFAULT_LEAGUE_CONFIG, ratesByPosition);

  const playerMeta = new Map<number, { position: import("@/types/database").Position; isUndrafted: boolean; draftPick: number | null; draftYear: number | null; birthDate: string | null }>();
  for (const career of careers) {
    if (!completeIds.has(career.player_id)) continue;
    const player = playerById.get(career.player_id);
    const seasonMap = seasonPab.get(career.player_id);
    if (!seasonMap) continue;
    const position = (career.draft_position ?? player?.primary_position ?? [...seasonMap.values()][0]?.position ?? "WR") as import("@/types/database").Position;
    playerMeta.set(career.player_id, { position, isUndrafted: player?.is_undrafted ?? !career.draft_pick_overall, draftPick: career.draft_pick_overall, draftYear: career.draft_year, birthDate: player?.birth_date ?? null });
  }

  const careerInputs = buildPlayerCareers(
    new Map([...seasonPab.entries()].map(([id, map]) => [id, new Map([...map.entries()].map(([y, e]) => [y, { tier: e.tier, games: e.games, position: e.position, pab: e.pab }]))])),
    playerMeta,
  ).filter((c) => completeIds.has(c.playerId) && c.seasons.size >= 2);

  const allCheckpoints = buildAllCheckpoints(careerInputs);
  const train = new Set(careerInputs.filter((c) => c.playerId % 5 !== 0).map((c) => c.playerId));
  const test = new Set(careerInputs.filter((c) => c.playerId % 5 === 0).map((c) => c.playerId));
  const trainCheckpoints = allCheckpoints.filter((r) => train.has(r.playerId));
  const models = trainProjectionModels(trainCheckpoints);

  const errors: Record<number, number[]> = Object.fromEntries(BLENDS.map((b) => [b, []]));

  for (const career of careerInputs.filter((c) => test.has(c.playerId) && c.position === "QB")) {
    const rates = ratesByPosition.get("QB")!;
    for (let yp = 1; yp < career.seasons.size; yp++) {
      const checkpoint = allCheckpoints.find((r) => r.playerId === career.playerId && r.yearsPlayed === yp);
      if (!checkpoint || checkpoint.careerQuartile !== 3) continue;
      const compPool = trainCheckpoints.filter((r) => r.playerId !== career.playerId).map(checkpointToCompCandidate);
      const actual = careerPabFromTierCounts(checkpoint.remainingTiers, rates);
      for (const blend of BLENDS) {
        const pred = predictCheckpoint(models, compPool, checkpoint, rates, { compWeight: blend });
        errors[blend].push(Math.abs(pred.predictedPab - actual));
      }
    }
  }

  console.log("\nQB-Q3 blend MAE (deterministic test split, extended reg + median comps)\n");
  console.log("comp%   MAE     n");
  let best = { blend: 0, mae: Infinity };
  for (const blend of BLENDS) {
    const n = errors[blend].length;
    const mae = n ? errors[blend].reduce((a, b) => a + b, 0) / n : 0;
    const mark = blend === 1 ? " ← current" : "";
    console.log(`${String(Math.round(blend * 100)).padStart(4)}%  ${mae.toFixed(1).padStart(6)}  ${n}${mark}`);
    if (mae < best.mae) best = { blend, mae };
  }
  console.log(`\nBest: ${Math.round(best.blend * 100)}% comp (MAE ${best.mae.toFixed(1)})`);
}

main().catch(console.error);
