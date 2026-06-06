/**
 * Backtest career projection: sweep comp/regression blends (10% grid).
 * Run: npm run backtest:projection
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "node:path";
import {
  careerPabFromTierCounts,
  type TierPabRates,
} from "../src/lib/pab/career-pab";
import { DEFAULT_LEAGUE_CONFIG } from "../src/lib/pab/types";
import type { Position } from "../src/types/database";
import {
  buildAllCheckpoints,
  buildPlayerCareers,
  type ProjectionCheckpoint,
} from "../src/lib/projections/checkpoints";
import type { CareerQuartile } from "../src/lib/projections/career-stage";
import {
  isCareerComplete,
  recentSeasonYears,
} from "../src/lib/projections/career-complete";
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

const PAGE_SIZE = 1000;
const LEAGUE = DEFAULT_LEAGUE_CONFIG;
const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];
const BLENDS = Array.from({ length: 11 }, (_, i) => i / 10);
const TRAIN_FRACTION = 0.8;

type PlayerRow = {
  id: number;
  is_undrafted: boolean;
  primary_position: Position;
  birth_date: string | null;
};

async function fetchAll<T>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  select: string,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function section(title: string) {
  console.log(`\n${"=".repeat(72)}\n${title}\n${"=".repeat(72)}`);
}

function splitPlayers(playerIds: number[]) {
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const trainSize = Math.floor(shuffled.length * TRAIN_FRACTION);
  return {
    train: new Set(shuffled.slice(0, trainSize)),
    test: new Set(shuffled.slice(trainSize)),
  };
}

function actualRemainingPab(
  checkpoint: ProjectionCheckpoint,
  rates: TierPabRates,
): number {
  return careerPabFromTierCounts(checkpoint.remainingTiers, rates);
}

type ErrorBucket = { errors: number[]; count: number };

function bucketKey(
  position: Position,
  quartile: CareerQuartile,
  blend: number,
): string {
  return `${position}-Q${quartile}-blend${blend}`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");

  const supabase = createClient(url, key);
  const maxYear = (
    await supabase
      .from("fantasy_season_stats")
      .select("season_year")
      .order("season_year", { ascending: false })
      .limit(1)
      .single()
  ).data?.season_year as number;

  section("Loading data");
  const [seasons, careers, players] = await Promise.all([
    fetchAll<SeasonStatRow>(
      supabase,
      "fantasy_season_stats",
      "player_id, season_year, position, fantasy_points_ppr, fantasy_points_half_ppr, fantasy_points_standard, games_played",
    ),
    fetchAll<CareerMeta & { first_season: number | null }>(
      supabase,
      "player_career_stats",
      "player_id, draft_year, draft_pick_overall, draft_position, last_season, first_season",
    ),
    fetchAll<PlayerRow>(
      supabase,
      "players",
      "id, is_undrafted, primary_position, birth_date",
    ),
  ]);

  const currentSeason = maxYear;
  const recent = new Set(recentSeasonYears(currentSeason));
  const recentPlayers = new Set<number>();
  for (const row of seasons) {
    if (recent.has(row.season_year)) recentPlayers.add(row.player_id);
  }

  const completeIds = new Set(
    careers
      .filter((c) =>
        isCareerComplete(
          c.last_season,
          recentPlayers.has(c.player_id),
          currentSeason,
        ),
      )
      .map((c) => c.player_id),
  );

  const playerById = new Map(players.map((p) => [p.id, p]));
  const ratesByPosition = buildTierRatesByPosition(LEAGUE, seasons, maxYear);
  const seasonPab = buildPlayerSeasonPab(seasons, LEAGUE, ratesByPosition);

  const playerMeta = new Map<
    number,
    {
      position: Position;
      isUndrafted: boolean;
      draftPick: number | null;
      draftYear: number | null;
      birthDate: string | null;
    }
  >();

  for (const career of careers) {
    if (!completeIds.has(career.player_id)) continue;
    const player = playerById.get(career.player_id);
    const seasonMap = seasonPab.get(career.player_id);
    if (!seasonMap) continue;

    const position =
      career.draft_position ??
      player?.primary_position ??
      [...seasonMap.values()][0]?.position ??
      "WR";

    playerMeta.set(career.player_id, {
      position,
      isUndrafted: player?.is_undrafted ?? !career.draft_pick_overall,
      draftPick: career.draft_pick_overall,
      draftYear: career.draft_year,
      birthDate: player?.birth_date ?? null,
    });
  }

  const careerInputs = buildPlayerCareers(
    new Map(
      [...seasonPab.entries()].map(([id, map]) => [
        id,
        new Map(
          [...map.entries()].map(([year, entry]) => [
            year,
            {
              tier: entry.tier,
              games: entry.games,
              position: entry.position,
              pab: entry.pab,
            },
          ]),
        ),
      ]),
    ),
    playerMeta,
  ).filter((career) => completeIds.has(career.playerId) && career.seasons.size >= 2);

  const allCheckpoints = buildAllCheckpoints(careerInputs);
  const { train, test } = splitPlayers(careerInputs.map((c) => c.playerId));
  const trainCheckpoints = allCheckpoints.filter((row) => train.has(row.playerId));
  const models = trainProjectionModels(trainCheckpoints);

  section("Training summary");
  console.log(`Completed careers: ${careerInputs.length}`);
  console.log(`Checkpoints: ${allCheckpoints.length} (train ${trainCheckpoints.length})`);
  console.log(`League: ${LEAGUE.teams} teams, ${LEAGUE.scoring}`);
  console.log(`Blend grid: 0.0–1.0 in steps of 0.1`);

  const errorsByKey = new Map<string, ErrorBucket>();
  let totalPredictions = 0;

  for (const career of careerInputs.filter((c) => test.has(c.playerId))) {
    const totalSeasons = career.seasons.size;
    const rates = ratesByPosition.get(career.position)!;

    for (let yearsPlayed = 1; yearsPlayed < totalSeasons; yearsPlayed++) {
      const checkpoint = allCheckpoints.find(
        (row) =>
          row.playerId === career.playerId && row.yearsPlayed === yearsPlayed,
      );
      if (!checkpoint) continue;

      const compPool = trainCheckpoints
        .filter((row) => row.playerId !== career.playerId)
        .map(checkpointToCompCandidate);

      const actual = actualRemainingPab(checkpoint, rates);

      for (const compWeight of BLENDS) {
        const result = predictCheckpoint(models, compPool, checkpoint, rates, {
          compWeight,
        });
        const error = Math.abs(result.predictedPab - actual);
        totalPredictions += 1;

        const key = bucketKey(
          checkpoint.position,
          checkpoint.careerQuartile,
          compWeight,
        );
        const bucket = errorsByKey.get(key) ?? { errors: [], count: 0 };
        bucket.errors.push(error);
        bucket.count += 1;
        errorsByKey.set(key, bucket);
      }
    }
  }

  section("Best blend per position × quartile");
  const recommended: Record<string, number> = {};
  for (const position of POSITIONS) {
    for (const quartile of [1, 2, 3, 4] as CareerQuartile[]) {
      let bestBlend = 0.5;
      let bestMae = Infinity;
      for (const blend of BLENDS) {
        const bucket = errorsByKey.get(bucketKey(position, quartile, blend));
        if (!bucket?.count) continue;
        const mae =
          bucket.errors.reduce((a, b) => a + b, 0) / bucket.errors.length;
        if (mae < bestMae) {
          bestMae = mae;
          bestBlend = blend;
        }
      }
      const key = `${position}-Q${quartile}`;
      recommended[key] = bestBlend;
      console.log(
        `${key}: compWeight=${bestBlend} (${Math.round(bestBlend * 100)}% comp), MAE≈${bestMae === Infinity ? "n/a" : bestMae.toFixed(1)}`,
      );
    }
  }

  section("Copy into projection-blends.ts");
  console.log("export const BACKTEST_TUNED_COMP_WEIGHT = {");
  for (const position of POSITIONS) {
    const cells = [1, 2, 3, 4]
      .map((q) => recommended[`${position}-Q${q}`] ?? 0)
      .join(", ");
    console.log(`  ${position}: { ${cells} },`);
  }
  console.log("};");

  section("Summary");
  console.log(`Total predictions evaluated: ${totalPredictions}`);
  let regMae = 0;
  let compMae = 0;
  let regN = 0;
  let compN = 0;
  for (const position of POSITIONS) {
    for (const quartile of [1, 2, 3, 4] as CareerQuartile[]) {
      const reg = errorsByKey.get(bucketKey(position, quartile, 0));
      const comp = errorsByKey.get(bucketKey(position, quartile, 1));
      if (reg?.count) {
        regMae += reg.errors.reduce((a, b) => a + b, 0);
        regN += reg.count;
      }
      if (comp?.count) {
        compMae += comp.errors.reduce((a, b) => a + b, 0);
        compN += comp.count;
      }
    }
  }
  console.log(
    `Regression-only MAE (all buckets): ${regN ? (regMae / regN).toFixed(1) : "n/a"}`,
  );
  console.log(
    `Comp-only MAE (all buckets):       ${compN ? (compMae / compN).toFixed(1) : "n/a"}`,
  );
  console.log(
    "regression: extended 18 features; comps: k-NN + median aggregation.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
