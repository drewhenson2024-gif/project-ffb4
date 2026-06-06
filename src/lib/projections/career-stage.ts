import type { Position } from "@/types/database";
import { ageAtSeason } from "@/lib/player-age";
import type { ProjectionCheckpoint } from "./checkpoints";
import { PROJECTION_CONFIG } from "./projection-config";
import {
  findCompRemainingSeasons,
  MIN_COMP_SAMPLES,
  type CompCandidate,
} from "./comp-matching";
import {
  type CareerLengthModelBundle,
  predictRemainingCalendarSeasons,
} from "./projection-models";
import type { RecentPerformance } from "./recent-performance";

export type CareerQuartile = 1 | 2 | 3 | 4;

export const CAREER_QUARTILE_LABELS: Record<CareerQuartile, string> = {
  1: "early",
  2: "mid-early",
  3: "mid-late",
  4: "late",
};

export function careerQuartile(
  yearsPlayed: number,
  totalSeasons: number,
): CareerQuartile {
  const progress = yearsPlayed / Math.max(totalSeasons, 1);
  if (progress <= 0.25) return 1;
  if (progress <= 0.5) return 2;
  if (progress <= 0.75) return 3;
  return 4;
}

const POSITION_RETIRE_AGE: Record<Position, number> = {
  QB: 38,
  RB: 30,
  WR: 34,
  TE: 35,
};

function eliteBonus(peakTier: number): number {
  if (peakTier >= 4) return 3;
  if (peakTier >= 3) return 1;
  return 0;
}

function recentRetireBonus(recent: RecentPerformance): number {
  if (!PROJECTION_CONFIG.recentAffectsCareerLength) return 0;
  if (recent.recentValuableSeasons >= 2) return 2;
  if (recent.recentValuableSeasons >= 1) return 1;
  return 0;
}

function remainingFromAge(checkpoint: ProjectionCheckpoint): number | null {
  if (checkpoint.playerAge === null) return null;
  const retireAge =
    POSITION_RETIRE_AGE[checkpoint.position] +
    eliteBonus(checkpoint.peakTier) +
    recentRetireBonus(checkpoint);
  return Math.max(0, retireAge - checkpoint.playerAge);
}

export type RemainingSeasonsResult = {
  remainingSeasons: number;
  method: "ols" | "comp" | "age";
  compSampleSize: number;
};

export function estimateRemainingSeasons(
  checkpoint: ProjectionCheckpoint,
  careerLengthModels: CareerLengthModelBundle,
  compPool: CompCandidate[],
): RemainingSeasonsResult {
  const ols = predictRemainingCalendarSeasons(careerLengthModels, checkpoint);
  if (ols !== null) {
    return { remainingSeasons: ols, method: "ols", compSampleSize: 0 };
  }

  const comp = findCompRemainingSeasons(compPool, checkpoint);
  if (comp.sampleSize >= MIN_COMP_SAMPLES) {
    return {
      remainingSeasons: comp.meanRemaining,
      method: "comp",
      compSampleSize: comp.sampleSize,
    };
  }

  const ageRemaining = remainingFromAge(checkpoint);
  return {
    remainingSeasons: ageRemaining ?? 0,
    method: "age",
    compSampleSize: 0,
  };
}

export function resolvePlayerAge(
  birthDate: string | null,
  seasonYear: number,
  draftYear: number | null,
  yearsPlayed: number,
): number {
  if (birthDate) return ageAtSeason(birthDate, seasonYear);
  if (draftYear) return seasonYear - draftYear + 22;
  return yearsPlayed + 22;
}
