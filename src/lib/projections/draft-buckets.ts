/** NFL draft pick segmentation for draft-capital analysis. */

export const PICKS_PER_ROUND = 32;
export const HALF_ROUND_PICKS = 16;

export const DRAFT_BUCKET_ORDER = [
  "top-1",
  "top-2",
  "top-4",
  "top-8",
  "top-16",
  "top-32",
  "r2-first",
  "r2-second",
  "r3-first",
  "r3-second",
  "r4-first",
  "r4-second",
  "r5-first",
  "r5-second",
  "r6-first",
  "r6-second",
  "r7-first",
  "r7-second",
  "undrafted",
] as const;

export type DraftBucket = (typeof DRAFT_BUCKET_ORDER)[number];

/** Midpoint overall pick number for curve fitting (NFL 32-pick rounds). */
export const BUCKET_REPRESENTATIVE_PICK: Record<DraftBucket, number> = {
  "top-1": 1,
  "top-2": 2,
  "top-4": 3.5,
  "top-8": 6,
  "top-16": 12,
  "top-32": 24,
  "r2-first": 40,
  "r2-second": 56,
  "r3-first": 72,
  "r3-second": 88,
  "r4-first": 104,
  "r4-second": 120,
  "r5-first": 136,
  "r5-second": 152,
  "r6-first": 168,
  "r6-second": 184,
  "r7-first": 200,
  "r7-second": 216,
  undrafted: 260,
};

export const BUCKET_SLOT_WIDTH: Record<DraftBucket, number> = {
  "top-1": 1,
  "top-2": 1,
  "top-4": 2,
  "top-8": 4,
  "top-16": 8,
  "top-32": 16,
  "r2-first": 16,
  "r2-second": 16,
  "r3-first": 16,
  "r3-second": 16,
  "r4-first": 16,
  "r4-second": 16,
  "r5-first": 16,
  "r5-second": 16,
  "r6-first": 16,
  "r6-second": 16,
  "r7-first": 16,
  "r7-second": 16,
  undrafted: 0,
};

export const DRAFT_BUCKET_LABELS: Record<DraftBucket, string> = {
  "top-1": "Top 1 (#1)",
  "top-2": "Top 2 (#2)",
  "top-4": "Top 4 (#3–4)",
  "top-8": "Top 8 (#5–8)",
  "top-16": "Top 16 (#9–16)",
  "top-32": "Top 32 (#17–32)",
  "r2-first": "Round 2 (picks 1–16)",
  "r2-second": "Round 2 (picks 17–32)",
  "r3-first": "Round 3 (picks 1–16)",
  "r3-second": "Round 3 (picks 17–32)",
  "r4-first": "Round 4 (picks 1–16)",
  "r4-second": "Round 4 (picks 17–32)",
  "r5-first": "Round 5 (picks 1–16)",
  "r5-second": "Round 5 (picks 17–32)",
  "r6-first": "Round 6 (picks 1–16)",
  "r6-second": "Round 6 (picks 17–32)",
  "r7-first": "Round 7 (picks 1–16)",
  "r7-second": "Round 7 (picks 17–32)",
  undrafted: "Undrafted",
};

export function draftRound(pickOverall: number): number {
  return Math.ceil(pickOverall / PICKS_PER_ROUND);
}

export function pickInRound(pickOverall: number): number {
  return ((pickOverall - 1) % PICKS_PER_ROUND) + 1;
}

function roundHalfBucket(round: number, pickOverall: number): DraftBucket {
  const half = pickInRound(pickOverall) <= HALF_ROUND_PICKS ? "first" : "second";
  return `r${round}-${half}` as DraftBucket;
}

/**
 * Map overall draft pick to a display bucket.
 * Returns null for round 8+ picks (excluded from analysis).
 */
/** Overall pick range [start, end] inclusive for each bucket. */
export function bucketPickRange(bucket: DraftBucket): { start: number; end: number } | null {
  switch (bucket) {
    case "top-1":
      return { start: 1, end: 1 };
    case "top-2":
      return { start: 2, end: 2 };
    case "top-4":
      return { start: 3, end: 4 };
    case "top-8":
      return { start: 5, end: 8 };
    case "top-16":
      return { start: 9, end: 16 };
    case "top-32":
      return { start: 17, end: 32 };
    case "r2-first":
      return { start: 33, end: 48 };
    case "r2-second":
      return { start: 49, end: 64 };
    case "r3-first":
      return { start: 65, end: 80 };
    case "r3-second":
      return { start: 81, end: 96 };
    case "r4-first":
      return { start: 97, end: 112 };
    case "r4-second":
      return { start: 113, end: 128 };
    case "r5-first":
      return { start: 129, end: 144 };
    case "r5-second":
      return { start: 145, end: 160 };
    case "r6-first":
      return { start: 161, end: 176 };
    case "r6-second":
      return { start: 177, end: 192 };
    case "r7-first":
      return { start: 193, end: 208 };
    case "r7-second":
      return { start: 209, end: 224 };
    default:
      return null;
  }
}

export const MAX_DRAFT_PICK = 224;

export function draftPickBucket(
  pickOverall: number | null,
  isUndrafted: boolean,
): DraftBucket | null {
  if (isUndrafted || pickOverall == null || pickOverall < 1) {
    return "undrafted";
  }

  if (pickOverall === 1) return "top-1";
  if (pickOverall === 2) return "top-2";
  if (pickOverall <= 4) return "top-4";
  if (pickOverall <= 8) return "top-8";
  if (pickOverall <= 16) return "top-16";
  if (pickOverall <= 32) return "top-32";

  const round = draftRound(pickOverall);
  if (round >= 2 && round <= 7) {
    return roundHalfBucket(round, pickOverall);
  }

  return null;
}
