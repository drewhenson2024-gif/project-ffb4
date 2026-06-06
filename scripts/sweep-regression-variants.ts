/**
 * Compare regression training variants on held-out checkpoints (global MAE).
 * Run: npm run sweep:regression
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
  findCompRemainingTiers,
} from "../src/lib/projections/comp-matching";
import {
  predictRemainingTiers,
  trainProjectionModels,
  type RegressionTrainingOptions,
} from "../src/lib/projections/projection-models";
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
  options: RegressionTrainingOptions;
};

const VARIANTS: Variant[] = [
  {
    id: 0,
    name: "baseline",
    description: "16 features, recentScale=0, position×quartile + fallback",
    options: {},
  },
  {
    id: 1,
    name: "recent-0.25",
    description: "Standard features, recentFeatureScale=0.25",
    options: { recentFeatureScale: 0.25 },
  },
  {
    id: 2,
    name: "recent-0.5",
    description: "Standard features, recentFeatureScale=0.5",
    options: { recentFeatureScale: 0.5 },
  },
  {
    id: 3,
    name: "recent-1.0",
    description: "Standard features, recentFeatureScale=1.0",
    options: { recentFeatureScale: 1.0 },
  },
  {
    id: 4,
    name: "extended-18",
    description: "18 features (+ careerProgress, careerQuartile), recentScale=0",
    options: { featureMode: "extended", recentFeatureScale: 0 },
  },
  {
    id: 5,
    name: "core-9",
    description: "9 core features only (drop all recent trajectory)",
    options: { featureMode: "core", recentFeatureScale: 0 },
  },
  {
    id: 6,
    name: "position-only",
    description: "One model per position (no quartile split)",
    options: { grouping: "position-only" },
  },
  {
    id: 7,
    name: "min-group-10",
    description: "Fit quartile models with min 10 rows (default 20)",
    options: { minGroupRows: 10 },
  },
  {
    id: 8,
    name: "no-quartile-fallback",
    description: "Quartile models only — no position-wide fallback",
    options: { quartileFallback: false },
  },
  {
    id: 9,
    name: "strict-min-30",
    description: "Require 30 rows per group before fitting",
    options: { minGroupRows: 30 },
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

  console.log(
    `\nRegression variant sweep — ${checkpoints.length} test checkpoints\n`,
  );
  console.log(
    `${"Rank".padStart(4)}  ${"MAE".padStart(7)}  ${"Name".padEnd(24)} Description`,
  );
  console.log("-".repeat(78));

  const results: {
    variant: Variant | { id: number; name: string; description: string };
    mae: number;
    byPosition: Record<Position, number>;
  }[] = [];

  // Comp median reference (best comp from prior sweep)
  const compErrors: number[] = [];
  const compByPos: Record<Position, number[]> = { QB: [], RB: [], WR: [], TE: [] };
  for (const row of checkpoints) {
    const comp = findCompRemainingTiers(compPool, row.checkpoint, {
      aggregation: "median",
    });
    const pred = careerPabFromTierCounts(
      comp.expectations,
      ratesByPosition.get(row.position)!,
    );
    const err = Math.abs(pred - row.actual);
    compErrors.push(err);
    compByPos[row.position].push(err);
  }
  results.push({
    variant: {
      id: -1,
      name: "comp-median-ref",
      description: "Reference: best comp variant from prior sweep",
    },
    mae: mae(compErrors),
    byPosition: Object.fromEntries(
      POSITIONS.map((p) => [p, mae(compByPos[p])]),
    ) as Record<Position, number>,
  });

  for (const variant of VARIANTS) {
    const models = trainProjectionModels(trainCheckpoints, variant.options);
    const errors: number[] = [];
    const byPos: Record<Position, number[]> = { QB: [], RB: [], WR: [], TE: [] };

    for (const row of checkpoints) {
      const pred = careerPabFromTierCounts(
        predictRemainingTiers(models, row.checkpoint),
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
      `${String(i + 1).padStart(4)}  ${row.mae.toFixed(1).padStart(7)}  ${row.variant.name.padEnd(24)} ${row.variant.description}`,
    );
  }

  const winner = results[0];
  const bestRegression = results.find((r) => r.variant.id >= 0)!;

  console.log("\n" + "=".repeat(78));
  console.log(
    `Lowest MAE overall: ${winner.variant.name} (${winner.mae.toFixed(1)} PAB)`,
  );
  if (winner.variant.id < 0) {
    console.log(
      `Best regression variant: ${bestRegression.variant.name} (${bestRegression.mae.toFixed(1)} PAB)`,
    );
  }

  console.log("\nPer-position MAE (regression variants only):");
  console.log(
    `${"Variant".padEnd(24)} ${POSITIONS.map((p) => p.padStart(6)).join(" ")}`,
  );
  for (const row of results.filter((r) => r.variant.id >= 0)) {
    console.log(
      `${row.variant.name.padEnd(24)} ${POSITIONS.map((p) => row.byPosition[p].toFixed(1).padStart(6)).join(" ")}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
