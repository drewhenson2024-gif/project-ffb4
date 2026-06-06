import type { CareerQuartile } from "./career-stage";
import type { Position } from "@/types/database";
import type { ProjectionBlend } from "./projection-predict";

/** Tuned via npm run backtest:projection (extended regression + median comps). */
export const BACKTEST_TUNED_COMP_WEIGHT: Record<
  Position,
  Record<CareerQuartile, number>
> = {
  QB: { 1: 0.7, 2: 1, 3: 1, 4: 1 },
  RB: { 1: 0.6, 2: 0.7, 3: 0.8, 4: 1 },
  WR: { 1: 0.5, 2: 0.5, 3: 1, 4: 0 },
  TE: { 1: 0.6, 2: 1, 3: 1, 4: 1 },
};

export function tunedBlend(
  position: Position,
  quartile: CareerQuartile,
): ProjectionBlend {
  return { compWeight: BACKTEST_TUNED_COMP_WEIGHT[position][quartile] };
}
