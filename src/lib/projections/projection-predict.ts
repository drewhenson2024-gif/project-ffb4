import {
  careerPabFromTierCounts,
  VALUABLE_TIERS,
  type TierPabRates,
  type TierSeasonCounts,
} from "@/lib/pab/career-pab";
import type { ProjectionCheckpoint } from "./checkpoints";
import { findCompRemainingTiers, type CompCandidate } from "./comp-matching";
import {
  predictRemainingTiers,
  type ProjectionModelBundle,
} from "./projection-models";
import { tunedBlend } from "./projection-blends";

export type ProjectionBlend = {
  compWeight: number;
};

export function blendTierPredictions(
  regression: TierSeasonCounts,
  comp: TierSeasonCounts,
  blend: ProjectionBlend,
): TierSeasonCounts {
  const regressionWeight = 1 - blend.compWeight;
  const result = { elite: 0, star: 0, starter: 0 };

  for (const tier of VALUABLE_TIERS) {
    result[tier] = Math.max(
      0,
      regressionWeight * regression[tier] + blend.compWeight * comp[tier],
    );
  }

  return result;
}

export function predictCheckpoint(
  bundle: ProjectionModelBundle,
  compPool: CompCandidate[],
  checkpoint: ProjectionCheckpoint,
  rates: TierPabRates,
  blend: ProjectionBlend,
): {
  predictedTiers: TierSeasonCounts;
  predictedPab: number;
  regressionTiers: TierSeasonCounts;
  compTiers: TierSeasonCounts;
  compSampleSize: number;
  compMatchType: string;
} {
  const regression = predictRemainingTiers(bundle, checkpoint);
  const compResult = findCompRemainingTiers(compPool, checkpoint);
  const predictedTiers = blendTierPredictions(
    regression,
    compResult.expectations,
    blend,
  );
  const predictedPab = careerPabFromTierCounts(predictedTiers, rates);

  return {
    predictedTiers,
    predictedPab,
    regressionTiers: regression,
    compTiers: compResult.expectations,
    compSampleSize: compResult.sampleSize,
    compMatchType: compResult.matchType,
  };
}

export function predictCheckpointTuned(
  bundle: ProjectionModelBundle,
  compPool: CompCandidate[],
  checkpoint: ProjectionCheckpoint,
  rates: TierPabRates,
) {
  const blend = tunedBlend(checkpoint.position, checkpoint.careerQuartile);
  return predictCheckpoint(bundle, compPool, checkpoint, rates, blend);
}
