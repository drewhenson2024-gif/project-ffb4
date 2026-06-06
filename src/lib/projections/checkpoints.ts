import type { Position } from "@/types/database";
import {
  emptyTierSeasonCounts,
  type TierSeasonCounts,
} from "@/lib/pab/career-pab";
import type { SeasonTier } from "@/lib/pab/types";
import { careerQuartile, resolvePlayerAge, type CareerQuartile } from "./career-stage";
import { computeRecentPerformance } from "./recent-performance";

export type ProjectionCheckpoint = {
  playerId: number;
  position: Position;
  yearsPlayed: number;
  totalSeasons: number;
  careerQuartile: CareerQuartile;
  isUndrafted: boolean;
  draftPick: number | null;
  draftYear: number | null;
  tiersSoFar: TierSeasonCounts;
  benchSoFar: number;
  remainingTiers: TierSeasonCounts;
  peakTier: number;
  gamesPlayed: number;
  playerAge: number | null;
  recentElite: number;
  recentStar: number;
  recentStarter: number;
  recentValuableSeasons: number;
  recentPabRate: number;
  lastSeasonTier: number;
  momentum: number;
};

export type SeasonEntry = {
  tier: SeasonTier | null;
  games: number;
  position: Position;
  pab: number;
};

export type PlayerCareerInput = {
  playerId: number;
  position: Position;
  isUndrafted: boolean;
  draftPick: number | null;
  draftYear: number | null;
  birthDate: string | null;
  seasons: Map<number, SeasonEntry>;
};

function tierOrdinal(tier: SeasonTier | null): number {
  if (tier === "elite") return 4;
  if (tier === "star") return 3;
  if (tier === "starter") return 2;
  if (tier === "bench") return 1;
  return 0;
}

export function buildPlayerCareers(
  seasonPab: Map<number, Map<number, SeasonEntry>>,
  playerMeta: Map<
    number,
    {
      position: Position;
      isUndrafted: boolean;
      draftPick: number | null;
      draftYear: number | null;
      birthDate: string | null;
    }
  >,
): PlayerCareerInput[] {
  const careers: PlayerCareerInput[] = [];

  for (const [playerId, seasons] of seasonPab) {
    const meta = playerMeta.get(playerId);
    if (!meta || seasons.size === 0) continue;

    careers.push({
      playerId,
      position: meta.position,
      isUndrafted: meta.isUndrafted,
      draftPick: meta.draftPick,
      draftYear: meta.draftYear,
      birthDate: meta.birthDate,
      seasons,
    });
  }

  return careers;
}

function buildCheckpointRow(
  career: PlayerCareerInput,
  sortedYears: number[],
  index: number,
  totalSeasons: number,
  totalTiers: TierSeasonCounts,
  tiersSoFar: TierSeasonCounts,
  benchSoFar: number,
  peakTier: number,
  games: number,
): ProjectionCheckpoint {
  const year = sortedYears[index];
  const yearsPlayed = index + 1;
  const remainingTiers: TierSeasonCounts = {
    elite: totalTiers.elite - tiersSoFar.elite,
    star: totalTiers.star - tiersSoFar.star,
    starter: totalTiers.starter - tiersSoFar.starter,
  };
  const recent = computeRecentPerformance(
    sortedYears.slice(0, yearsPlayed),
    career.seasons,
    tiersSoFar,
  );

  return {
    playerId: career.playerId,
    position: career.position,
    yearsPlayed,
    totalSeasons,
    careerQuartile: careerQuartile(yearsPlayed, totalSeasons),
    isUndrafted: career.isUndrafted,
    draftPick: career.draftPick,
    draftYear: career.draftYear,
    tiersSoFar: { ...tiersSoFar },
    benchSoFar,
    remainingTiers,
    peakTier,
    gamesPlayed: games,
    playerAge: resolvePlayerAge(
      career.birthDate,
      year,
      career.draftYear,
      yearsPlayed,
    ),
    ...recent,
  };
}

export function buildCheckpointsForCareer(
  career: PlayerCareerInput,
): ProjectionCheckpoint[] {
  const sortedYears = [...career.seasons.keys()].sort((a, b) => a - b);
  const totalSeasons = sortedYears.length;
  const totalTiers = emptyTierSeasonCounts();

  for (const year of sortedYears) {
    const entry = career.seasons.get(year)!;
    if (entry.tier && entry.tier !== "bench") {
      totalTiers[entry.tier] += 1;
    }
  }

  const checkpoints: ProjectionCheckpoint[] = [];
  const tiersSoFar = emptyTierSeasonCounts();
  let benchSoFar = 0;
  let games = 0;
  let peakTier = 0;

  for (let i = 0; i < sortedYears.length; i++) {
    const year = sortedYears[i];
    const entry = career.seasons.get(year)!;
    if (entry.tier === "bench") benchSoFar += 1;
    else if (entry.tier) tiersSoFar[entry.tier] += 1;
    peakTier = Math.max(peakTier, tierOrdinal(entry.tier));
    games += entry.games;

    checkpoints.push(
      buildCheckpointRow(
        career,
        sortedYears,
        i,
        totalSeasons,
        totalTiers,
        tiersSoFar,
        benchSoFar,
        peakTier,
        games,
      ),
    );
  }

  return checkpoints;
}

export function buildAllCheckpoints(
  careers: PlayerCareerInput[],
): ProjectionCheckpoint[] {
  return careers.flatMap((career) => buildCheckpointsForCareer(career));
}

export function buildActiveProjectionCheckpoint(
  career: PlayerCareerInput,
  estimatedTotalSeasons: number,
): ProjectionCheckpoint | null {
  const sortedYears = [...career.seasons.keys()].sort((a, b) => a - b);
  if (!sortedYears.length) return null;

  const tiersSoFar = emptyTierSeasonCounts();
  let benchSoFar = 0;
  let games = 0;
  let peakTier = 0;

  for (const year of sortedYears) {
    const entry = career.seasons.get(year)!;
    if (entry.tier === "bench") benchSoFar += 1;
    else if (entry.tier) tiersSoFar[entry.tier] += 1;
    peakTier = Math.max(peakTier, tierOrdinal(entry.tier));
    games += entry.games;
  }

  const yearsPlayed = sortedYears.length;
  const lastYear = sortedYears[sortedYears.length - 1];
  const recent = computeRecentPerformance(
    sortedYears,
    career.seasons,
    tiersSoFar,
  );

  return {
    playerId: career.playerId,
    position: career.position,
    yearsPlayed,
    totalSeasons: estimatedTotalSeasons,
    careerQuartile: careerQuartile(yearsPlayed, estimatedTotalSeasons),
    isUndrafted: career.isUndrafted,
    draftPick: career.draftPick,
    draftYear: career.draftYear,
    tiersSoFar: { ...tiersSoFar },
    benchSoFar,
    remainingTiers: emptyTierSeasonCounts(),
    peakTier,
    gamesPlayed: games,
    playerAge: resolvePlayerAge(
      career.birthDate,
      lastYear,
      career.draftYear,
      yearsPlayed,
    ),
    ...recent,
  };
}
