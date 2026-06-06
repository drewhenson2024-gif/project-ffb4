import type { SeasonTier } from "./types";

export const VALUABLE_TIERS = ["elite", "star", "starter"] as const;
export type ValuableTier = (typeof VALUABLE_TIERS)[number];

export type TierSeasonCounts = Record<ValuableTier, number>;
export type TierPabRates = Record<ValuableTier, number>;

export function emptyTierSeasonCounts(): TierSeasonCounts {
  return { elite: 0, star: 0, starter: 0 };
}

export function toValuableTierPab(
  pab: Record<SeasonTier, number>,
): TierPabRates {
  return {
    elite: Math.max(0, pab.elite),
    star: Math.max(0, pab.star),
    starter: Math.max(0, pab.starter),
  };
}

export function seasonPabContribution(
  tier: SeasonTier | null,
  rates: TierPabRates,
): number {
  if (!tier || tier === "bench") return 0;
  return rates[tier];
}

export function careerPabFromTierCounts(
  counts: TierSeasonCounts,
  rates: TierPabRates,
): number {
  return (
    counts.elite * rates.elite +
    counts.star * rates.star +
    counts.starter * rates.starter
  );
}

export function incrementTierCount(
  counts: TierSeasonCounts,
  tier: SeasonTier | null,
): TierSeasonCounts {
  if (!tier || tier === "bench") return counts;
  return { ...counts, [tier]: counts[tier] + 1 };
}
