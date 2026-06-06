import type { Position } from "@/types/database";
import type { TierSeasonCounts } from "@/lib/pab/career-pab";
import { mean, median, std } from "./regression";
import type { ProjectionCheckpoint } from "./checkpoints";
import { checkpointFeatures } from "./projection-models";
import { PROJECTION_CONFIG } from "./projection-config";

export const MIN_COMP_SAMPLES = PROJECTION_CONFIG.compMinSamples;

/** Default per-feature emphasis (aligned with `compSimilarityFeatures`). */
export const DEFAULT_COMP_FEATURE_WEIGHTS = [
  1.0, // log(draftPick)
  0.5, // isUndrafted
  2.0, // yearsPlayed
  3.0,
  3.0,
  3.0, // elite / star / starter so far
  2.0, // peakTier
  1.0, // gamesPlayed
  1.5, // playerAge
  1.5,
  1.5,
  1.5,
  1.5,
  1.5,
  1.5,
  1.5, // recent trajectory (7)
  2.0, // careerProgress (yearsPlayed / totalSeasons)
  1.0, // careerQuartile
] as const;

export type CompAggregation = "weighted-mean" | "median" | "mean";

export type CompMatchingOptions = {
  featureWeights?: readonly number[];
  minSamples?: number;
  maxSamples?: number;
  /** Drop neighbors farther than this (after ranking). null = no cutoff. */
  maxDistance?: number | null;
  aggregation?: CompAggregation;
};

export const DEFAULT_COMP_MATCHING_OPTIONS: CompMatchingOptions = {
  featureWeights: DEFAULT_COMP_FEATURE_WEIGHTS,
  minSamples: PROJECTION_CONFIG.compMinSamples,
  maxSamples: PROJECTION_CONFIG.compMaxSamples,
  maxDistance: null,
  aggregation: PROJECTION_CONFIG.compAggregation,
};

export type CompCandidate = {
  playerId: number;
  position: Position;
  yearsPlayed: number;
  totalSeasons: number;
  remainingTiers: TierSeasonCounts;
  features: number[];
};

export type TierSeasonExpectations = TierSeasonCounts;

export type CompMatchType = "similarity" | "sparse" | "none";

function resolveOptions(
  options?: CompMatchingOptions,
): Required<CompMatchingOptions> {
  return {
    featureWeights:
      options?.featureWeights ?? DEFAULT_COMP_MATCHING_OPTIONS.featureWeights!,
    minSamples:
      options?.minSamples ?? DEFAULT_COMP_MATCHING_OPTIONS.minSamples!,
    maxSamples:
      options?.maxSamples ?? DEFAULT_COMP_MATCHING_OPTIONS.maxSamples!,
    maxDistance:
      options?.maxDistance ?? DEFAULT_COMP_MATCHING_OPTIONS.maxDistance!,
    aggregation:
      options?.aggregation ?? DEFAULT_COMP_MATCHING_OPTIONS.aggregation!,
  };
}

export function compSimilarityFeatures(
  checkpoint: ProjectionCheckpoint,
): number[] {
  const recentScale = PROJECTION_CONFIG.compRecentFeatureScale;
  const base = checkpointFeatures(checkpoint, recentScale);
  const progress =
    checkpoint.totalSeasons > 0
      ? checkpoint.yearsPlayed / checkpoint.totalSeasons
      : checkpoint.careerQuartile / 4;

  return [...base, progress, checkpoint.careerQuartile];
}

function poolNormStats(candidates: CompCandidate[]): {
  means: number[];
  stds: number[];
} {
  const k = candidates[0]?.features.length ?? 0;
  if (!k) return { means: [], stds: [] };

  const means = Array.from({ length: k }, (_, j) =>
    mean(candidates.map((c) => c.features[j])),
  );
  const stds = Array.from({ length: k }, (_, j) =>
    std(candidates.map((c) => c.features[j])) || 1,
  );

  return { means, stds };
}

function weightedDistance(
  query: number[],
  candidate: number[],
  means: number[],
  stds: number[],
  featureWeights: readonly number[],
): number {
  let sum = 0;
  for (let j = 0; j < query.length; j++) {
    const weight = featureWeights[j] ?? 1;
    const zq = (query[j] - means[j]) / stds[j];
    const zc = (candidate[j] - means[j]) / stds[j];
    const diff = zq - zc;
    sum += weight * diff * diff;
  }
  return Math.sqrt(sum);
}

function similarityWeight(distance: number): number {
  return 1 / (1 + distance * distance);
}

type RankedComp = { candidate: CompCandidate; distance: number; weight: number };

function rankSimilarComps(
  pool: CompCandidate[],
  query: ProjectionCheckpoint,
  options: Required<CompMatchingOptions>,
): RankedComp[] {
  const positionPool = pool.filter((c) => c.position === query.position);
  if (!positionPool.length) return [];

  const queryFeatures = compSimilarityFeatures(query);
  const { means, stds } = poolNormStats(positionPool);

  let ranked = positionPool
    .map((candidate) => {
      const distance = weightedDistance(
        queryFeatures,
        candidate.features,
        means,
        stds,
        options.featureWeights,
      );
      return { candidate, distance, weight: similarityWeight(distance) };
    })
    .sort((a, b) => a.distance - b.distance);

  if (options.maxDistance !== null) {
    ranked = ranked.filter((row) => row.distance <= options.maxDistance!);
  }

  return ranked;
}

function selectRankedComps(
  ranked: RankedComp[],
  options: Required<CompMatchingOptions>,
): { selected: RankedComp[]; matchType: CompMatchType } {
  if (!ranked.length) {
    return { selected: [], matchType: "none" };
  }

  const selected = ranked.slice(0, options.maxSamples);

  if (selected.length >= options.minSamples) {
    return { selected, matchType: "similarity" };
  }
  return { selected, matchType: "sparse" };
}

function aggregateTierCounts(
  rows: { tiers: TierSeasonCounts; weight: number }[],
  aggregation: CompAggregation,
): TierSeasonExpectations {
  if (!rows.length) return { elite: 0, star: 0, starter: 0 };

  if (aggregation === "median") {
    return {
      elite: median(rows.map((r) => r.tiers.elite)),
      star: median(rows.map((r) => r.tiers.star)),
      starter: median(rows.map((r) => r.tiers.starter)),
    };
  }

  if (aggregation === "mean") {
    return {
      elite: mean(rows.map((r) => r.tiers.elite)),
      star: mean(rows.map((r) => r.tiers.star)),
      starter: mean(rows.map((r) => r.tiers.starter)),
    };
  }

  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0) {
    return {
      elite: mean(rows.map((r) => r.tiers.elite)),
      star: mean(rows.map((r) => r.tiers.star)),
      starter: mean(rows.map((r) => r.tiers.starter)),
    };
  }

  return {
    elite:
      rows.reduce((sum, row) => sum + row.weight * row.tiers.elite, 0) /
      totalWeight,
    star:
      rows.reduce((sum, row) => sum + row.weight * row.tiers.star, 0) /
      totalWeight,
    starter:
      rows.reduce((sum, row) => sum + row.weight * row.tiers.starter, 0) /
      totalWeight,
  };
}

function aggregateMean(
  values: { value: number; weight: number }[],
  aggregation: CompAggregation,
): number {
  if (!values.length) return 0;

  if (aggregation === "median") {
    return median(values.map((row) => row.value));
  }
  if (aggregation === "mean") {
    return mean(values.map((row) => row.value));
  }

  const totalWeight = values.reduce((sum, row) => sum + row.weight, 0);
  if (totalWeight <= 0) return mean(values.map((row) => row.value));
  return (
    values.reduce((sum, row) => sum + row.weight * row.value, 0) / totalWeight
  );
}

export function checkpointToCompCandidate(
  checkpoint: ProjectionCheckpoint,
): CompCandidate {
  return {
    playerId: checkpoint.playerId,
    position: checkpoint.position,
    yearsPlayed: checkpoint.yearsPlayed,
    totalSeasons: checkpoint.totalSeasons,
    remainingTiers: checkpoint.remainingTiers,
    features: compSimilarityFeatures(checkpoint),
  };
}

export function findCompRemainingTiers(
  pool: CompCandidate[],
  query: ProjectionCheckpoint,
  options?: CompMatchingOptions,
): {
  expectations: TierSeasonExpectations;
  sampleSize: number;
  matchType: CompMatchType;
  meanDistance: number;
} {
  const resolved = resolveOptions(options);
  const ranked = rankSimilarComps(pool, query, resolved);
  const { selected, matchType } = selectRankedComps(ranked, resolved);

  if (!selected.length) {
    return {
      expectations: { elite: 0, star: 0, starter: 0 },
      sampleSize: 0,
      matchType: "none",
      meanDistance: 0,
    };
  }

  return {
    expectations: aggregateTierCounts(
      selected.map((row) => ({
        tiers: row.candidate.remainingTiers,
        weight: row.weight,
      })),
      resolved.aggregation,
    ),
    sampleSize: selected.length,
    matchType,
    meanDistance: mean(selected.map((row) => row.distance)),
  };
}

export function findCompRemainingSeasons(
  pool: CompCandidate[],
  checkpoint: ProjectionCheckpoint,
  options?: CompMatchingOptions,
): {
  meanRemaining: number;
  sampleSize: number;
  matchType: CompMatchType;
  meanDistance: number;
} {
  const resolved = resolveOptions(options);
  const ranked = rankSimilarComps(pool, checkpoint, resolved);
  const { selected, matchType } = selectRankedComps(ranked, resolved);

  if (!selected.length) {
    return {
      meanRemaining: 0,
      sampleSize: 0,
      matchType: "none",
      meanDistance: 0,
    };
  }

  return {
    meanRemaining: aggregateMean(
      selected.map((row) => ({
        value: row.candidate.totalSeasons - row.candidate.yearsPlayed,
        weight: row.weight,
      })),
      resolved.aggregation,
    ),
    sampleSize: selected.length,
    matchType,
    meanDistance: mean(selected.map((row) => row.distance)),
  };
}
