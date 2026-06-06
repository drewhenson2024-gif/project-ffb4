/**
 * Compare comp-matching variants on held-out checkpoints (global MAE).
 * Run: npm run sweep:comp
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "node:path";
import { careerPabFromTierCounts } from "../src/lib/pab/career-pab";
import { DEFAULT_LEAGUE_CONFIG } from "../src/lib/pab/types";
import type { Position } from "../src/types/database";
import {
  buildAllCheckpoints,
  buildPlayerCareers,
} from "../src/lib/projections/checkpoints";
import { isCareerComplete, recentSeasonYears } from "../src/lib/projections/career-complete";
import {
  checkpointToCompCandidate,
  DEFAULT_COMP_FEATURE_WEIGHTS,
  findCompRemainingTiers,
  type CompMatchingOptions,
} from "../src/lib/projections/comp-matching";
import { predictRemainingTiers, trainProjectionModels } from "../src/lib/projections/projection-models";
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

type PlayerRow = {
  id: number;
  is_undrafted: boolean;
  primary_position: Position;
  birth_date: string | null;
};

type Variant = {
  id: number;
  name: string;
  description: string;
  options?: CompMatchingOptions;
};

const TIER_HEAVY_WEIGHTS = DEFAULT_COMP_FEATURE_WEIGHTS.map((w, i) =>
  i >= 3 && i <= 5 ? 5.0 : w,
);

const VARIANTS: Variant[] = [
  {
    id: 0,
    name: "baseline",
    description: "Current k-NN: 18 features, weighted mean, k=15",
  },
  {
    id: 1,
    name: "tier-heavy-weights",
    description: "Boost elite/star/starter feature weights 3→5",
    options: { featureWeights: TIER_HEAVY_WEIGHTS },
  },
  {
    id: 2,
    name: "tight-k8",
    description: "Fewer neighbors: maxSamples 15→8",
    options: { maxSamples: 8 },
  },
  {
    id: 3,
    name: "wide-k25",
    description: "More neighbors: maxSamples 15→25",
    options: { maxSamples: 25 },
  },
  {
    id: 4,
    name: "distance-cutoff-2.5",
    description: "Drop neighbors with distance > 2.5",
    options: { maxDistance: 2.5 },
  },
  {
    id: 5,
    name: "median-aggregation",
    description: "Median tier counts instead of weighted mean",
    options: { aggregation: "median" },
  },
];

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

function splitPlayers(playerIds: number[]) {
  const train = new Set<number>();
  const test = new Set<number>();
  for (const id of playerIds) {
    if (id % 5 === 0) test.add(id);
    else train.add(id);
  }
  return { train, test };
}

function mae(errors: number[]): number {
  return errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : 0;
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const maxYear = (
    await supabase
      .from("fantasy_season_stats")
      .select("season_year")
      .order("season_year", { ascending: false })
      .limit(1)
      .single()
  ).data?.season_year as number;

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

  const recent = new Set(recentSeasonYears(maxYear));
  const recentPlayers = new Set(
    seasons.filter((r) => recent.has(r.season_year)).map((r) => r.player_id),
  );
  const completeIds = new Set(
    careers
      .filter((c) =>
        isCareerComplete(c.last_season, recentPlayers.has(c.player_id), maxYear),
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
      (career.draft_position ??
        player?.primary_position ??
        [...seasonMap.values()][0]?.position ??
        "WR") as Position;
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
  ).filter((c) => completeIds.has(c.playerId) && c.seasons.size >= 2);

  const allCheckpoints = buildAllCheckpoints(careerInputs);
  const { train, test } = splitPlayers(careerInputs.map((c) => c.playerId));
  const trainCheckpoints = allCheckpoints.filter((r) => train.has(r.playerId));
  const compPool = trainCheckpoints.map(checkpointToCompCandidate);
  const models = trainProjectionModels(trainCheckpoints);

  const testRows = careerInputs.filter((c) => test.has(c.playerId));
  const checkpoints: {
    checkpoint: (typeof allCheckpoints)[number];
    actual: number;
    position: Position;
  }[] = [];

  for (const career of testRows) {
    const rates = ratesByPosition.get(career.position)!;
    for (let yp = 1; yp < career.seasons.size; yp++) {
      const checkpoint = allCheckpoints.find(
        (r) => r.playerId === career.playerId && r.yearsPlayed === yp,
      );
      if (!checkpoint) continue;
      checkpoints.push({
        checkpoint,
        actual: careerPabFromTierCounts(checkpoint.remainingTiers, rates),
        position: career.position,
      });
    }
  }

  console.log(`\nComp variant sweep — ${checkpoints.length} test checkpoints\n`);
  console.log(
    `${"Rank".padStart(4)}  ${"MAE".padStart(7)}  ${"Name".padEnd(22)} Description`,
  );
  console.log("-".repeat(72));

  const results: { variant: Variant; mae: number; byPosition: Record<Position, number> }[] =
    [];

  // Regression-only reference
  const regErrors: number[] = [];
  const regByPos: Record<Position, number[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const row of checkpoints) {
    const pred = careerPabFromTierCounts(
      predictRemainingTiers(models, row.checkpoint),
      ratesByPosition.get(row.position)!,
    );
    const err = Math.abs(pred - row.actual);
    regErrors.push(err);
    regByPos[row.position].push(err);
  }
  results.push({
    variant: {
      id: -1,
      name: "regression-only",
      description: "Reference: OLS tier models, no comps",
    },
    mae: mae(regErrors),
    byPosition: Object.fromEntries(
      POSITIONS.map((p) => [p, mae(regByPos[p])]),
    ) as Record<Position, number>,
  });

  for (const variant of VARIANTS) {
    const errors: number[] = [];
    const byPos: Record<Position, number[]> = { QB: [], RB: [], WR: [], TE: [] };

    for (const row of checkpoints) {
      const comp = findCompRemainingTiers(
        compPool,
        row.checkpoint,
        variant.options,
      );
      const pred = careerPabFromTierCounts(
        comp.expectations,
        ratesByPosition.get(row.position)!,
      );
      const err = Math.abs(pred - row.actual);
      errors.push(err);
      byPos[row.position].push(err);
    }

    results.push({
      variant,
      mae: mae(errors),
      byPosition: Object.fromEntries(
        POSITIONS.map((p) => [p, mae(byPos[p])]),
      ) as Record<Position, number>,
    });
  }

  results.sort((a, b) => a.mae - b.mae);

  for (let i = 0; i < results.length; i++) {
    const row = results[i];
    console.log(
      `${String(i + 1).padStart(4)}  ${row.mae.toFixed(1).padStart(7)}  ${row.variant.name.padEnd(22)} ${row.variant.description}`,
    );
  }

  const winner = results[0];
  const bestComp = results.find((r) => r.variant.id >= 0)!;

  console.log("\n" + "=".repeat(72));
  console.log(`Lowest MAE overall: ${winner.variant.name} (${winner.mae.toFixed(1)} PAB)`);
  if (winner.variant.id < 0) {
    console.log(`Best comp variant: ${bestComp.variant.name} (${bestComp.mae.toFixed(1)} PAB)`);
  }

  console.log("\nPer-position MAE (comp variants only):");
  console.log(
    `${"Variant".padEnd(22)} ${POSITIONS.map((p) => p.padStart(6)).join(" ")}`,
  );
  for (const row of results.filter((r) => r.variant.id >= 0)) {
    console.log(
      `${row.variant.name.padEnd(22)} ${POSITIONS.map((p) => row.byPosition[p].toFixed(1).padStart(6)).join(" ")}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
