import type { Position } from "@/types/database";
import {
  VALUABLE_TIERS,
  type ValuableTier,
} from "@/lib/pab/career-pab";
import type { CareerQuartile } from "./career-stage";
import { fitOls, predictOls, type OlsModel } from "./regression";
import type { ProjectionCheckpoint } from "./checkpoints";
import { PROJECTION_CONFIG } from "./projection-config";

export type QuartileModelKey = `${Position}-Q${CareerQuartile}`;

export type TierTargetModels = Record<ValuableTier, OlsModel | null>;

export type RegressionFeatureMode = "standard" | "core" | "extended";

export type RegressionGrouping = "position-quartile" | "position-only";

export type RegressionTrainingOptions = {
  recentFeatureScale?: number;
  featureMode?: RegressionFeatureMode;
  grouping?: RegressionGrouping;
  minGroupRows?: number;
  quartileFallback?: boolean;
  minOlsPadding?: number;
};

export const DEFAULT_REGRESSION_OPTIONS: Required<RegressionTrainingOptions> = {
  recentFeatureScale: PROJECTION_CONFIG.recentFeatureScale,
  featureMode: PROJECTION_CONFIG.regressionFeatureMode,
  grouping: "position-quartile",
  minGroupRows: 20,
  quartileFallback: true,
  minOlsPadding: 8,
};

export type ProjectionModelBundle = {
  byQuartile: Map<QuartileModelKey, TierTargetModels>;
  byPosition: Map<Position, TierTargetModels>;
  training: Required<RegressionTrainingOptions>;
};

export type CareerLengthModelBundle = Map<Position, OlsModel | null>;

function modelKey(position: Position, quartile: CareerQuartile): QuartileModelKey {
  return `${position}-Q${quartile}`;
}

function resolveRegressionOptions(
  options?: number | RegressionTrainingOptions,
): Required<RegressionTrainingOptions> {
  if (typeof options === "number") {
    return { ...DEFAULT_REGRESSION_OPTIONS, recentFeatureScale: options };
  }
  return {
    recentFeatureScale:
      options?.recentFeatureScale ?? DEFAULT_REGRESSION_OPTIONS.recentFeatureScale,
    featureMode: options?.featureMode ?? DEFAULT_REGRESSION_OPTIONS.featureMode,
    grouping: options?.grouping ?? DEFAULT_REGRESSION_OPTIONS.grouping,
    minGroupRows: options?.minGroupRows ?? DEFAULT_REGRESSION_OPTIONS.minGroupRows,
    quartileFallback:
      options?.quartileFallback ?? DEFAULT_REGRESSION_OPTIONS.quartileFallback,
    minOlsPadding:
      options?.minOlsPadding ?? DEFAULT_REGRESSION_OPTIONS.minOlsPadding,
  };
}

export function regressionFeatures(
  checkpoint: ProjectionCheckpoint,
  training: Required<RegressionTrainingOptions>,
): number[] {
  const draftPick = checkpoint.draftPick ?? 256;
  const s = training.recentFeatureScale;
  const age = checkpoint.playerAge ?? checkpoint.yearsPlayed + 22;

  const core = [
    Math.log(draftPick),
    checkpoint.isUndrafted ? 1 : 0,
    checkpoint.yearsPlayed,
    checkpoint.tiersSoFar.elite,
    checkpoint.tiersSoFar.star,
    checkpoint.tiersSoFar.starter,
    checkpoint.peakTier,
    checkpoint.gamesPlayed,
    age,
  ];

  if (training.featureMode === "core") {
    return core;
  }

  const recent = [
    checkpoint.recentElite * s,
    checkpoint.recentStar * s,
    checkpoint.recentStarter * s,
    checkpoint.recentValuableSeasons * s,
    checkpoint.recentPabRate * s,
    checkpoint.lastSeasonTier * s,
    checkpoint.momentum * s,
  ];

  if (training.featureMode === "standard") {
    return [...core, ...recent];
  }

  const progress =
    checkpoint.totalSeasons > 0
      ? checkpoint.yearsPlayed / checkpoint.totalSeasons
      : checkpoint.careerQuartile / 4;

  return [...core, ...recent, progress, checkpoint.careerQuartile];
}

/** Back-compat alias — standard 16-feature vector. */
export function checkpointFeatures(
  checkpoint: ProjectionCheckpoint,
  recentScale: number = PROJECTION_CONFIG.recentFeatureScale,
): number[] {
  return regressionFeatures(checkpoint, {
    ...DEFAULT_REGRESSION_OPTIONS,
    recentFeatureScale: recentScale,
    featureMode: "standard",
  });
}

function trainTierModels(
  rows: ProjectionCheckpoint[],
  training: Required<RegressionTrainingOptions>,
): TierTargetModels {
  if (rows.length < training.minGroupRows) {
    return { elite: null, star: null, starter: null };
  }

  const X = rows.map((row) => regressionFeatures(row, training));
  const models = {} as TierTargetModels;

  for (const tier of VALUABLE_TIERS) {
    const y = rows.map((row) => row.remainingTiers[tier]);
    models[tier] = fitOls(X, y, training.minOlsPadding);
  }

  return models;
}

export function trainProjectionModels(
  checkpoints: ProjectionCheckpoint[],
  options?: number | RegressionTrainingOptions,
): ProjectionModelBundle {
  const training = resolveRegressionOptions(options);
  const byQuartile = new Map<QuartileModelKey, TierTargetModels>();
  const byPosition = new Map<Position, TierTargetModels>();

  const positions = ["QB", "RB", "WR", "TE"] as Position[];
  const quartiles = [1, 2, 3, 4] as CareerQuartile[];

  for (const position of positions) {
    const positionRows = checkpoints.filter((row) => row.position === position);
    byPosition.set(position, trainTierModels(positionRows, training));

    if (training.grouping === "position-quartile") {
      for (const quartile of quartiles) {
        const rows = positionRows.filter(
          (row) => row.careerQuartile === quartile,
        );
        byQuartile.set(
          modelKey(position, quartile),
          trainTierModels(rows, training),
        );
      }
    }
  }

  return { byQuartile, byPosition, training };
}

export function trainCareerLengthModels(
  checkpoints: ProjectionCheckpoint[],
  recentScale: number = PROJECTION_CONFIG.careerLengthRecentScale,
): CareerLengthModelBundle {
  const models = new Map<Position, OlsModel | null>();
  const positions = ["QB", "RB", "WR", "TE"] as Position[];
  const training: Required<RegressionTrainingOptions> = {
    ...DEFAULT_REGRESSION_OPTIONS,
    recentFeatureScale: recentScale,
    featureMode: "standard",
  };

  for (const position of positions) {
    const rows = checkpoints.filter((row) => row.position === position);
    if (rows.length < 28) {
      models.set(position, null);
      continue;
    }
    const X = rows.map((row) => regressionFeatures(row, training));
    const y = rows.map((row) => row.totalSeasons - row.yearsPlayed);
    models.set(position, fitOls(X, y, training.minOlsPadding));
  }

  return models;
}

function getTierModels(
  bundle: ProjectionModelBundle,
  position: Position,
  quartile: CareerQuartile,
): TierTargetModels {
  const empty = { elite: null, star: null, starter: null };

  if (bundle.training.grouping === "position-only") {
    return bundle.byPosition.get(position) ?? empty;
  }

  const quartileModels = bundle.byQuartile.get(modelKey(position, quartile));
  const hasQuartileModel =
    quartileModels && Object.values(quartileModels).some(Boolean);

  if (hasQuartileModel) return quartileModels!;
  if (bundle.training.quartileFallback) {
    return bundle.byPosition.get(position) ?? empty;
  }
  return empty;
}

export function predictRemainingTiers(
  bundle: ProjectionModelBundle,
  checkpoint: ProjectionCheckpoint,
): Record<ValuableTier, number> {
  const models = getTierModels(
    bundle,
    checkpoint.position,
    checkpoint.careerQuartile,
  );
  const features = regressionFeatures(checkpoint, bundle.training);
  const prediction = { elite: 0, star: 0, starter: 0 };

  for (const tier of VALUABLE_TIERS) {
    const model = models[tier];
    prediction[tier] = model ? Math.max(0, predictOls(model, features)) : 0;
  }

  return prediction;
}

export function predictRemainingCalendarSeasons(
  bundle: CareerLengthModelBundle,
  checkpoint: ProjectionCheckpoint,
): number | null {
  const model = bundle.get(checkpoint.position);
  if (!model) return null;
  const features = checkpointFeatures(
    checkpoint,
    PROJECTION_CONFIG.careerLengthRecentScale,
  );
  return Math.max(0, predictOls(model, features));
}
