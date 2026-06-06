/**
 * Projection tuning knobs — see docs/phases/11-career-projections.md
 */
export const PROJECTION_CONFIG = {
  /** Tier regression (Step 4): 0 = ignore recent 3-season features. */
  recentFeatureScale: 0,

  /** Tier regression feature set — extended adds careerProgress + careerQuartile. */
  regressionFeatureMode: "extended",

  /** Comp tier expectation: median of neighbor outcomes (backtest winner). */
  compAggregation: "median",

  /** Career-length age fallback (Step 7): recent bonus on retire age. */
  recentAffectsCareerLength: true,

  /** Phase 12 — disabled in phase 11. */
  dynastyCalibrationWeight: 0,

  /** Career-length OLS always uses recent features at this scale. */
  careerLengthRecentScale: 1,

  /** Comp similarity: recent features at full scale (trajectory matters for peers). */
  compRecentFeatureScale: 1,

  /** Weighted k-NN comp pool size bounds. */
  compMinSamples: 5,
  compMaxSamples: 15,
} as const;
