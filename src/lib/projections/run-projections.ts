import type { createServerClient } from "@/lib/supabase/server";
import type { Position } from "@/types/database";
import type { LeagueConfig } from "@/lib/pab/types";
import {
  buildCareerValue,
  emptyTierSeasonCounts,
  incrementTierCount,
  type ProjectedCareerValue,
} from "@/lib/pab/career-pab";
import {
  buildActiveProjectionCheckpoint,
  buildAllCheckpoints,
  buildPlayerCareers,
  type PlayerCareerInput,
  type SeasonEntry,
} from "./checkpoints";
import {
  estimateRemainingSeasons,
  type CareerQuartile,
} from "./career-stage";
import {
  isCareerComplete,
  isCurrentRookie,
  recentSeasonYears,
} from "./career-complete";
import {
  checkpointToCompCandidate,
  type CompCandidate,
} from "./comp-matching";
import { predictCheckpointTuned } from "./projection-predict";
import {
  trainCareerLengthModels,
  trainProjectionModels,
} from "./projection-models";
import {
  buildPlayerSeasonPab,
  buildTierRatesByPosition,
  type CareerMeta,
} from "./player-profiles";
import {
  loadAllSeasonStats,
  loadCareerMeta,
  loadPlayerIdentities,
} from "./season-data";

export type PlayerProjection = ProjectedCareerValue & {
  playerId: number;
  yearsPlayed: number;
  careerQuartile: CareerQuartile;
  compSampleSize: number;
  compMatchType: string;
  remainingSeasons: number;
  remainingSeasonsMethod: string;
};

export type CareerProjectionSummary = {
  trainingCareers: number;
  trainingCheckpoints: number;
  activeProjected: number;
  skippedRookies: number;
};

export type CareerProjectionResult = {
  projections: Map<number, PlayerProjection>;
  summary: CareerProjectionSummary;
};

function toSeasonPabMap(
  seasonPab: ReturnType<typeof buildPlayerSeasonPab>,
): Map<number, Map<number, SeasonEntry>> {
  return new Map(
    [...seasonPab.entries()].map(([playerId, seasons]) => [
      playerId,
      new Map(
        [...seasons.entries()].map(([year, entry]) => [
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
  );
}

function buildPlayerMeta(
  careers: CareerMeta[],
  seasonPab: Map<number, Map<number, SeasonEntry>>,
  playerById: Map<
    number,
    { is_undrafted: boolean; primary_position: Position; birth_date: string | null }
  >,
) {
  const meta = new Map<
    number,
    {
      position: Position;
      isUndrafted: boolean;
      draftPick: number | null;
      draftYear: number | null;
      birthDate: string | null;
    }
  >();
  const careerById = new Map(careers.map((c) => [c.player_id, c]));

  for (const [playerId, seasons] of seasonPab) {
    if (!seasons.size) continue;
    const career = careerById.get(playerId);
    const player = playerById.get(playerId);
    const position =
      career?.draft_position ??
      player?.primary_position ??
      [...seasons.values()][0]?.position ??
      "WR";

    meta.set(playerId, {
      position,
      isUndrafted: player?.is_undrafted ?? !career?.draft_pick_overall,
      draftPick: career?.draft_pick_overall ?? null,
      draftYear: career?.draft_year ?? null,
      birthDate: player?.birth_date ?? null,
    });
  }

  return meta;
}

function realizedTierCounts(career: PlayerCareerInput) {
  const counts = emptyTierSeasonCounts();
  for (const entry of career.seasons.values()) {
    Object.assign(counts, incrementTierCount(counts, entry.tier));
  }
  return counts;
}

function prepareActiveCheckpoint(
  career: PlayerCareerInput,
  careerLengthModels: ReturnType<typeof trainCareerLengthModels>,
  compPool: CompCandidate[],
) {
  const draft = buildActiveProjectionCheckpoint(
    career,
    career.seasons.size + 5,
  );
  if (!draft) return null;

  const { remainingSeasons } = estimateRemainingSeasons(
    draft,
    careerLengthModels,
    compPool,
  );
  const estimatedTotal = career.seasons.size + remainingSeasons;
  return buildActiveProjectionCheckpoint(career, estimatedTotal);
}

export async function runCareerProjections(
  supabase: ReturnType<typeof createServerClient>,
  config: LeagueConfig,
): Promise<CareerProjectionResult> {
  const [seasons, careers, players] = await Promise.all([
    loadAllSeasonStats(supabase),
    loadCareerMeta(supabase),
    loadPlayerIdentities(supabase),
  ]);

  if (!seasons.length) {
    return {
      projections: new Map(),
      summary: {
        trainingCareers: 0,
        trainingCheckpoints: 0,
        activeProjected: 0,
        skippedRookies: 0,
      },
    };
  }

  const maxYear = Math.max(...seasons.map((s) => s.season_year));
  const currentSeason = maxYear;
  const recent = new Set(recentSeasonYears(currentSeason));
  const recentPlayers = new Set<number>();
  for (const row of seasons) {
    if (recent.has(row.season_year)) recentPlayers.add(row.player_id);
  }

  const careerById = new Map(careers.map((c) => [c.player_id, c]));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const ratesByPosition = buildTierRatesByPosition(config, seasons, maxYear);
  const seasonPab = buildPlayerSeasonPab(seasons, config, ratesByPosition);
  const seasonMap = toSeasonPabMap(seasonPab);
  const playerMeta = buildPlayerMeta(careers, seasonMap, playerById);
  const careerInputs = buildPlayerCareers(seasonMap, playerMeta);

  const completeIds = new Set<number>();
  for (const career of careers) {
    if (
      isCareerComplete(
        career.last_season,
        recentPlayers.has(career.player_id),
        currentSeason,
      )
    ) {
      completeIds.add(career.player_id);
    }
  }

  const trainingCareers = careerInputs.filter(
    (career) => completeIds.has(career.playerId) && career.seasons.size >= 2,
  );
  const trainingCheckpoints = buildAllCheckpoints(trainingCareers);
  const tierModels = trainProjectionModels(trainingCheckpoints);
  const careerLengthModels = trainCareerLengthModels(trainingCheckpoints);
  const compPool = trainingCheckpoints.map(checkpointToCompCandidate);

  const projections = new Map<number, PlayerProjection>();
  let activeProjected = 0;
  let skippedRookies = 0;

  for (const career of careerInputs) {
    if (completeIds.has(career.playerId)) continue;
    if (career.seasons.size < 1) continue;

    const careerMeta = careerById.get(career.playerId);
    if (
      isCurrentRookie(
        career.seasons.size,
        careerMeta?.first_season ?? null,
        careerMeta?.last_season ?? null,
        currentSeason,
      )
    ) {
      skippedRookies += 1;
      continue;
    }

    const checkpoint = prepareActiveCheckpoint(
      career,
      careerLengthModels,
      compPool,
    );
    if (!checkpoint) continue;

    const rates = ratesByPosition.get(career.position)!;
    const result = predictCheckpointTuned(tierModels, compPool, checkpoint, rates);
    const remaining = estimateRemainingSeasons(
      checkpoint,
      careerLengthModels,
      compPool,
    );
    const value = buildCareerValue(
      career.position,
      realizedTierCounts(career),
      result.predictedTiers,
      rates,
    );

    projections.set(career.playerId, {
      ...value,
      playerId: career.playerId,
      yearsPlayed: checkpoint.yearsPlayed,
      careerQuartile: checkpoint.careerQuartile,
      compSampleSize: result.compSampleSize,
      compMatchType: result.compMatchType,
      remainingSeasons: remaining.remainingSeasons,
      remainingSeasonsMethod: remaining.method,
    });
    activeProjected += 1;
  }

  return {
    projections,
    summary: {
      trainingCareers: trainingCareers.length,
      trainingCheckpoints: trainingCheckpoints.length,
      activeProjected,
      skippedRookies,
    },
  };
}

export function getPlayerProjection(
  result: CareerProjectionResult,
  playerId: number,
): PlayerProjection | null {
  return result.projections.get(playerId) ?? null;
}
