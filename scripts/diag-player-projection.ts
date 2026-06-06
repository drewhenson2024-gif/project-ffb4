/**
 * Debug why a player gets projected remaining PAB.
 * Usage: npx tsx scripts/diag-player-projection.ts mahomes
 */
import { config } from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_LEAGUE_CONFIG } from "../src/lib/pab/types";
import {
  buildActiveProjectionCheckpoint,
  buildAllCheckpoints,
  buildPlayerCareers,
} from "../src/lib/projections/checkpoints";
import {
  isCareerComplete,
  isCurrentRookie,
  recentSeasonYears,
} from "../src/lib/projections/career-complete";
import { estimateRemainingSeasons } from "../src/lib/projections/career-stage";
import { checkpointToCompCandidate } from "../src/lib/projections/comp-matching";
import { predictCheckpointTuned } from "../src/lib/projections/projection-predict";
import {
  predictRemainingTiers,
  trainCareerLengthModels,
  trainProjectionModels,
} from "../src/lib/projections/projection-models";
import {
  buildPlayerSeasonPab,
  buildTierRatesByPosition,
} from "../src/lib/projections/player-profiles";
import {
  loadAllSeasonStats,
  loadCareerMeta,
  loadPlayerIdentities,
} from "../src/lib/projections/season-data";

config({ path: path.resolve(process.cwd(), ".env.local") });

const query = (process.argv[2] ?? "mahomes").toLowerCase();

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  const [seasons, careers, players, playersRes] = await Promise.all([
    loadAllSeasonStats(supabase),
    loadCareerMeta(supabase),
    loadPlayerIdentities(supabase),
    supabase.from("players").select("id, full_name").ilike("full_name", `%${query}%`),
  ]);

  const nameMatches = playersRes.data ?? [];
  const playerId = nameMatches[0]?.id;
  const player = playerId ? players.find((p) => p.id === playerId) : undefined;
  const playerName = nameMatches[0]?.full_name ?? query;
  if (!player) {
    console.log(`No player matching "${query}"`);
    return;
  }

  const maxYear = Math.max(...seasons.map((s) => s.season_year));
  const currentSeason = maxYear;
  const recent = new Set(recentSeasonYears(currentSeason));
  const recentPlayers = new Set(
    seasons.filter((s) => recent.has(s.season_year)).map((s) => s.player_id),
  );

  const career = careers.find((c) => c.player_id === player.id);
  const ratesByPosition = buildTierRatesByPosition(
    DEFAULT_LEAGUE_CONFIG,
    seasons,
    maxYear,
  );
  const seasonPab = buildPlayerSeasonPab(seasons, DEFAULT_LEAGUE_CONFIG, ratesByPosition);
  const seasonMap = seasonPab.get(player.id);

  const playerMeta = new Map([
    [
      player.id,
      {
        position: (career?.draft_position ?? player.primary_position) as "QB",
        isUndrafted: player.is_undrafted,
        draftPick: career?.draft_pick_overall ?? null,
        draftYear: career?.draft_year ?? null,
        birthDate: player.birth_date,
      },
    ],
  ]);

  const careerInputs = buildPlayerCareers(
    new Map(
      seasonMap
        ? [
            [
              player.id,
              new Map(
                [...seasonMap.entries()].map(([y, e]) => [
                  y,
                  { tier: e.tier, games: e.games, position: e.position, pab: e.pab },
                ]),
              ),
            ],
          ]
        : [],
    ),
    playerMeta,
  );

  const activeCareer = careerInputs[0];
  if (!activeCareer) {
    console.log("No season data for player");
    return;
  }

  const completeIds = new Set(
    careers
      .filter((c) =>
        isCareerComplete(c.last_season, recentPlayers.has(c.player_id), currentSeason),
      )
      .map((c) => c.player_id),
  );

  const allCareerInputs = buildPlayerCareers(
    new Map(
      [...seasonPab.entries()].map(([id, map]) => [
        id,
        new Map(
          [...map.entries()].map(([y, e]) => [
            y,
            { tier: e.tier, games: e.games, position: e.position, pab: e.pab },
          ]),
        ),
      ]),
    ),
    new Map(
      careers
        .filter((c) => seasonPab.has(c.player_id))
        .map((c) => {
          const p = players.find((x) => x.id === c.player_id)!;
          return [
            c.player_id,
            {
              position: (c.draft_position ?? p.primary_position) as "QB",
              isUndrafted: p.is_undrafted,
              draftPick: c.draft_pick_overall,
              draftYear: c.draft_year,
              birthDate: p.birth_date,
            },
          ];
        }),
    ),
  );

  const trainingCareers = allCareerInputs.filter(
    (c) => completeIds.has(c.playerId) && c.seasons.size >= 2,
  );
  const trainingCheckpoints = buildAllCheckpoints(trainingCareers);
  const tierModels = trainProjectionModels(trainingCheckpoints);
  const careerLengthModels = trainCareerLengthModels(trainingCheckpoints);
  const compPool = trainingCheckpoints.map(checkpointToCompCandidate);

  const draftCheckpoint = buildActiveProjectionCheckpoint(activeCareer, activeCareer.seasons.size + 5);
  const { remainingSeasons, method } = estimateRemainingSeasons(
    draftCheckpoint!,
    careerLengthModels,
    compPool,
  );
  const checkpoint = buildActiveProjectionCheckpoint(
    activeCareer,
    activeCareer.seasons.size + remainingSeasons,
  )!;

  const rates = ratesByPosition.get(activeCareer.position)!;
  const regression = predictRemainingTiers(tierModels, checkpoint);
  const tuned = predictCheckpointTuned(tierModels, compPool, checkpoint, rates);

  console.log("\n=== Player ===");
  console.log(playerName, `id=${player.id}`);
  console.log("Current season:", currentSeason);
  console.log("Career complete?", completeIds.has(player.id));
  console.log(
    "Current rookie?",
    isCurrentRookie(
      career?.seasons_played ?? activeCareer.seasons.size,
      career?.first_season ?? null,
      career?.last_season ?? null,
      currentSeason,
    ),
  );

  console.log("\n=== Career so far ===");
  const years = [...activeCareer.seasons.keys()].sort();
  for (const y of years) {
    const e = activeCareer.seasons.get(y)!;
    console.log(`  ${y}: tier=${e.tier} pab=${e.pab.toFixed(1)} games=${e.games}`);
  }

  console.log("\n=== Checkpoint ===");
  console.log({
    yearsPlayed: checkpoint.yearsPlayed,
    totalSeasons: checkpoint.totalSeasons,
    careerQuartile: checkpoint.careerQuartile,
    playerAge: checkpoint.playerAge,
    tiersSoFar: checkpoint.tiersSoFar,
    peakTier: checkpoint.peakTier,
    recentElite: checkpoint.recentElite,
    recentStar: checkpoint.recentStar,
    recentStarter: checkpoint.recentStarter,
    lastSeasonTier: checkpoint.lastSeasonTier,
    momentum: checkpoint.momentum,
  });

  console.log("\n=== Remaining seasons (Step 7) ===");
  console.log({ remainingSeasons, method });

  console.log("\n=== Tier predictions ===");
  console.log("Regression:", regression);
  console.log("Comp:", tuned.compTiers, `(${tuned.compMatchType}, n=${tuned.compSampleSize})`);
  console.log("Blended:", tuned.predictedTiers);
  console.log("Predicted remaining PAB:", tuned.predictedPab.toFixed(1));
  console.log("QB rates:", rates);
}

main().catch(console.error);
