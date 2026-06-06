/**
 * Draft-capital smoothing (FF 1.0 DraftPickValue pattern):
 * Four position-specific log curves V(p) = intercept − slope × ln(p) + segment offset,
 * one each for QB, RB, WR, and TE. Fit on middle buckets (excludes Top 1 / Top 2 outliers);
 * bucket display = average of per-pick values in range.
 */
import type { Position } from "@/types/database";
import {
  BUCKET_SLOT_WIDTH,
  bucketPickRange,
  DRAFT_BUCKET_ORDER,
  MAX_DRAFT_PICK,
  type DraftBucket,
} from "./draft-buckets";
import type { DraftCapitalCell } from "./draft-capital";

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

/** Draft-order buckets used for smoothing (undrafted excluded). */
export const DRAFT_PICK_BUCKETS = DRAFT_BUCKET_ORDER.filter(
  (bucket) => bucket !== "undrafted",
);

/** Buckets used to fit the log curve (sparse Top 1 / Top 2 excluded). */
const FIT_BUCKETS: DraftBucket[] = DRAFT_PICK_BUCKETS.filter(
  (bucket) => bucket !== "top-1" && bucket !== "top-2",
);

/** Round bands for segment-level net calibration. */
export type DraftCapitalRoundBand = "round1" | "rounds2_3" | "rounds4_7";

export const ROUND_BAND_BUCKETS: Record<DraftCapitalRoundBand, DraftBucket[]> = {
  round1: ["top-1", "top-2", "top-4", "top-8", "top-16", "top-32"],
  rounds2_3: ["r2-first", "r2-second", "r3-first", "r3-second"],
  rounds4_7: [
    "r4-first",
    "r4-second",
    "r5-first",
    "r5-second",
    "r6-first",
    "r6-second",
    "r7-first",
    "r7-second",
  ],
};

const BAND_PICK_RANGES: Record<DraftCapitalRoundBand, [number, number]> = {
  round1: [1, 32],
  rounds2_3: [33, 96],
  rounds4_7: [97, MAX_DRAFT_PICK],
};

const MIN_PICK_VALUE = 0.5;

/** Position-specific slope search bounds [min, max]. */
const SLOPE_BOUNDS: Record<Position, [number, number]> = {
  QB: [45, 165],
  RB: [95, 225],
  WR: [75, 155],
  TE: [45, 145],
};

export type SegmentOffsets = Record<DraftCapitalRoundBand, number>;

/** V(p) = intercept − slope × ln(p) + offset(band) */
export type LogDraftCapitalModel = {
  intercept: number;
  slope: number;
  segmentOffsets: SegmentOffsets;
};

export type LogDraftCapitalModelsByPosition = Record<
  Position,
  LogDraftCapitalModel
>;

const ZERO_OFFSETS: SegmentOffsets = {
  round1: 0,
  rounds2_3: 0,
  rounds4_7: 0,
};

function fitWeight(count: number, bucket: DraftBucket): number {
  if (count <= 0) return 0;
  const width = BUCKET_SLOT_WIDTH[bucket];
  return count * Math.sqrt(width);
}

function linspace(min: number, max: number, count: number): number[] {
  if (count <= 1) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

export function pickRoundBand(pick: number): DraftCapitalRoundBand {
  if (pick <= 32) return "round1";
  if (pick <= 96) return "rounds2_3";
  return "rounds4_7";
}

export function bucketRoundBand(bucket: DraftBucket): DraftCapitalRoundBand | null {
  if (bucket === "undrafted") return null;
  for (const [band, buckets] of Object.entries(ROUND_BAND_BUCKETS) as [
    DraftCapitalRoundBand,
    DraftBucket[],
  ][]) {
    if (buckets.includes(bucket)) return band;
  }
  return null;
}

export function logPickValue(
  intercept: number,
  slope: number,
  pick: number,
  segmentOffsets: SegmentOffsets = ZERO_OFFSETS,
): number {
  return (
    intercept -
    slope * Math.log(Math.max(pick, 1)) +
    segmentOffsets[pickRoundBand(pick)]
  );
}

function buildCurveFromModel(model: LogDraftCapitalModel): number[] {
  const curve = new Array<number>(MAX_DRAFT_PICK + 1).fill(0);
  for (let pick = 1; pick <= MAX_DRAFT_PICK; pick++) {
    curve[pick] = Math.max(
      0,
      logPickValue(model.intercept, model.slope, pick, model.segmentOffsets),
    );
  }
  for (let pick = 2; pick <= MAX_DRAFT_PICK; pick++) {
    if (curve[pick] > curve[pick - 1]) {
      curve[pick] = curve[pick - 1];
    }
  }
  return curve;
}

function buildCurveFromLog(intercept: number, slope: number): number[] {
  return buildCurveFromModel({
    intercept,
    slope,
    segmentOffsets: ZERO_OFFSETS,
  });
}

function averageCurveInRange(
  curve: number[],
  start: number,
  end: number,
): number {
  let sum = 0;
  for (let pick = start; pick <= end; pick++) sum += curve[pick];
  return sum / (end - start + 1);
}

function bucketLoss(
  curve: number[],
  rawByBucket: Record<DraftBucket, number>,
  counts: Record<DraftBucket, number>,
  buckets: DraftBucket[],
): number {
  let loss = 0;
  for (const bucket of buckets) {
    const range = bucketPickRange(bucket);
    if (!range || counts[bucket] <= 0) continue;
    const pred = averageCurveInRange(curve, range.start, range.end);
    loss += fitWeight(counts[bucket], bucket) * Math.abs(pred - rawByBucket[bucket]);
  }
  return loss;
}

function searchLogCurve(
  rawByBucket: Record<DraftBucket, number>,
  counts: Record<DraftBucket, number>,
  interceptMin: number,
  interceptMax: number,
  slopeMin: number,
  slopeMax: number,
  interceptSteps: number,
  slopeSteps: number,
): Pick<LogDraftCapitalModel, "intercept" | "slope"> {
  const intercepts = linspace(interceptMin, interceptMax, interceptSteps);
  const slopes = linspace(slopeMin, slopeMax, slopeSteps);

  let best = { intercept: intercepts[0], slope: slopes[0] };
  let bestLoss = Infinity;

  for (const intercept of intercepts) {
    for (const slope of slopes) {
      const curve = buildCurveFromLog(intercept, slope);
      const loss = bucketLoss(curve, rawByBucket, counts, FIT_BUCKETS);
      if (loss < bestLoss) {
        bestLoss = loss;
        best = { intercept, slope };
      }
    }
  }

  return best;
}

function fitLogCurve(
  position: Position,
  rawByBucket: Record<DraftBucket, number>,
  counts: Record<DraftBucket, number>,
): Pick<LogDraftCapitalModel, "intercept" | "slope"> {
  const fitPoints = FIT_BUCKETS.filter((b) => counts[b] > 0).map(
    (b) => rawByBucket[b],
  );
  const peak = Math.max(...fitPoints, 1);
  const [slopeMin, slopeMax] = SLOPE_BOUNDS[position];

  const coarse = searchLogCurve(
    rawByBucket,
    counts,
    peak * 0.85,
    peak * 1.45,
    slopeMin,
    slopeMax,
    20,
    28,
  );

  return searchLogCurve(
    rawByBucket,
    counts,
    coarse.intercept * 0.92,
    coarse.intercept * 1.08,
    Math.max(slopeMin, coarse.slope * 0.85),
    Math.min(slopeMax, coarse.slope * 1.15),
    32,
    32,
  );
}

function bandNet(
  curve: number[],
  band: DraftCapitalRoundBand,
  raw: number[],
  counts: number[],
): { net: number; buckets: number } {
  let net = 0;
  let buckets = 0;

  for (let i = 0; i < DRAFT_PICK_BUCKETS.length; i++) {
    const bucket = DRAFT_PICK_BUCKETS[i];
    if (!ROUND_BAND_BUCKETS[band].includes(bucket) || counts[i] <= 0) continue;
    const range = bucketPickRange(bucket);
    if (!range) continue;
    net += averageCurveInRange(curve, range.start, range.end) - raw[i];
    buckets += 1;
  }

  return { net, buckets };
}

function minLogValueInBand(
  intercept: number,
  slope: number,
  band: DraftCapitalRoundBand,
): number {
  const [start, end] = BAND_PICK_RANGES[band];
  let min = Infinity;
  for (let pick = start; pick <= end; pick++) {
    min = Math.min(min, intercept - slope * Math.log(pick));
  }
  return min;
}

/** Lowest offset allowed before picks in the band hit the floor. */
function offsetFloor(
  intercept: number,
  slope: number,
  band: DraftCapitalRoundBand,
): number {
  return -(Math.max(0, minLogValueInBand(intercept, slope, band)) - MIN_PICK_VALUE);
}

function constrainSegmentOffsets(
  intercept: number,
  slope: number,
  offsets: SegmentOffsets,
): SegmentOffsets {
  return {
    round1: Math.max(offsets.round1, offsetFloor(intercept, slope, "round1")),
    rounds2_3: Math.max(
      offsets.rounds2_3,
      offsetFloor(intercept, slope, "rounds2_3"),
    ),
    rounds4_7: Math.max(
      offsets.rounds4_7,
      offsetFloor(intercept, slope, "rounds4_7"),
    ),
  };
}

/**
 * Per-band vertical offsets so each round band's net delta is closer to zero.
 * Iterates on the final monotone curve; damping avoids tail floor collapse.
 */
function calibrateSegmentOffsets(
  base: Pick<LogDraftCapitalModel, "intercept" | "slope">,
  raw: number[],
  counts: number[],
): SegmentOffsets {
  const bands = Object.keys(ROUND_BAND_BUCKETS) as DraftCapitalRoundBand[];
  let offsets: SegmentOffsets = { round1: 0, rounds2_3: 0, rounds4_7: 0 };

  for (let pass = 0; pass < 4; pass++) {
    const damping = pass === 0 ? 0.85 : pass === 1 ? 0.6 : 0.45;
    const model: LogDraftCapitalModel = { ...base, segmentOffsets: offsets };
    const curve = buildCurveFromModel(model);

    for (const band of bands) {
      const { net, buckets } = bandNet(curve, band, raw, counts);
      if (buckets > 0) {
        offsets[band] += (-net / buckets) * damping;
      }
    }

    offsets = constrainSegmentOffsets(base.intercept, base.slope, offsets);
  }

  return offsets;
}

export function isMonotoneDecreasing(
  values: number[],
  counts?: number[],
): boolean {
  for (let i = 1; i < values.length; i++) {
    if (counts && (counts[i] <= 0 || counts[i - 1] <= 0)) {
      if (counts[i] <= 0) continue;
      let prev = i - 1;
      while (prev >= 0 && counts[prev] <= 0) prev--;
      if (prev < 0) continue;
      if (values[i] > values[prev] + 1e-9) return false;
      continue;
    }
    if (values[i] > values[i - 1] + 1e-9) return false;
  }
  return true;
}

export function isPerPickCurveMonotone(curve: number[]): boolean {
  for (let pick = 2; pick <= MAX_DRAFT_PICK; pick++) {
    if (curve[pick] > curve[pick - 1] + 1e-9) return false;
  }
  return true;
}

export function buildPerPickCurve(
  position: Position,
  rawByBucket: Record<DraftBucket, number>,
  counts: Record<DraftBucket, number>,
): { curve: number[]; model: LogDraftCapitalModel } {
  const base = fitLogCurve(position, rawByBucket, counts);
  const raw = DRAFT_PICK_BUCKETS.map((bucket) => rawByBucket[bucket]);
  const countList = DRAFT_PICK_BUCKETS.map((bucket) => counts[bucket]);
  const segmentOffsets = calibrateSegmentOffsets(base, raw, countList);
  const model: LogDraftCapitalModel = { ...base, segmentOffsets };
  return { curve: buildCurveFromModel(model), model };
}

export function predictLogDraftCapital(
  model: LogDraftCapitalModel,
  pick: number,
): number {
  return logPickValue(
    model.intercept,
    model.slope,
    pick,
    model.segmentOffsets,
  );
}

/** Smoothed draft-capital value at an NFL overall pick (monotone curve). */
export function draftCapitalAtPick(
  model: LogDraftCapitalModel,
  pick: number,
): number {
  if (pick < 1 || pick > MAX_DRAFT_PICK) return 0;
  return buildCurveFromModel(model)[pick];
}

export function smoothLogDraftCapitalSeries(
  position: Position,
  raw: number[],
  counts: number[],
): { values: number[]; model: LogDraftCapitalModel; curve: number[] } {
  const rawByBucket = Object.fromEntries(
    DRAFT_PICK_BUCKETS.map((bucket, index) => [bucket, raw[index]]),
  ) as Record<DraftBucket, number>;
  const countsByBucket = Object.fromEntries(
    DRAFT_PICK_BUCKETS.map((bucket, index) => [bucket, counts[index]]),
  ) as Record<DraftBucket, number>;

  const { curve, model } = buildPerPickCurve(
    position,
    rawByBucket,
    countsByBucket,
  );

  const values = DRAFT_PICK_BUCKETS.map((bucket) => {
    const range = bucketPickRange(bucket);
    if (!range || countsByBucket[bucket] <= 0) return 0;
    return averageCurveInRange(curve, range.start, range.end);
  });

  return { values, model, curve };
}

export function smoothDraftCapitalForPosition(
  position: Position,
  cells: Record<DraftBucket, DraftCapitalCell>,
): {
  cells: Record<DraftBucket, DraftCapitalCell>;
  model: LogDraftCapitalModel;
} {
  const raw = DRAFT_PICK_BUCKETS.map((bucket) => cells[bucket].avgPab);
  const counts = DRAFT_PICK_BUCKETS.map((bucket) => cells[bucket].count);

  const { values, model } = smoothLogDraftCapitalSeries(position, raw, counts);

  const smoothed = { ...cells };
  for (let i = 0; i < DRAFT_PICK_BUCKETS.length; i++) {
    const bucket = DRAFT_PICK_BUCKETS[i];
    smoothed[bucket] = {
      count: counts[i],
      avgPab: counts[i] > 0 ? values[i] : 0,
    };
  }

  return { cells: smoothed, model };
}

export function smoothDraftCapitalGrid(
  cells: Record<DraftBucket, Record<Position, DraftCapitalCell>>,
): {
  cells: Record<DraftBucket, Record<Position, DraftCapitalCell>>;
  models: LogDraftCapitalModelsByPosition;
} {
  const smoothed = {} as Record<DraftBucket, Record<Position, DraftCapitalCell>>;
  const models = {} as LogDraftCapitalModelsByPosition;

  for (const bucket of DRAFT_BUCKET_ORDER) {
    smoothed[bucket] = {
      QB: { ...cells[bucket].QB },
      RB: { ...cells[bucket].RB },
      WR: { ...cells[bucket].WR },
      TE: { ...cells[bucket].TE },
    };
  }

  for (const position of POSITIONS) {
    const column = Object.fromEntries(
      DRAFT_BUCKET_ORDER.map((bucket) => [bucket, { ...cells[bucket][position] }]),
    ) as Record<DraftBucket, DraftCapitalCell>;

    const { cells: smoothedColumn, model } = smoothDraftCapitalForPosition(
      position,
      column,
    );
    models[position] = model;
    for (const bucket of DRAFT_PICK_BUCKETS) {
      smoothed[bucket][position] = smoothedColumn[bucket];
    }
  }

  return { cells: smoothed, models };
}

export function formatLogDraftCapitalModel(model: LogDraftCapitalModel): string {
  const { segmentOffsets: o } = model;
  const parts = [`${model.intercept.toFixed(1)} − ${model.slope.toFixed(1)}×ln(p)`];
  if (o.round1 !== 0 || o.rounds2_3 !== 0 || o.rounds4_7 !== 0) {
    parts.push(
      `+ band offsets R1:${o.round1 >= 0 ? "+" : ""}${o.round1.toFixed(1)} R2-3:${o.rounds2_3 >= 0 ? "+" : ""}${o.rounds2_3.toFixed(1)} R4-7:${o.rounds4_7 >= 0 ? "+" : ""}${o.rounds4_7.toFixed(1)}`,
    );
  }
  return parts.join(" ");
}

export function bandNetTotals(
  model: LogDraftCapitalModel,
  raw: number[],
  counts: number[],
): Record<DraftCapitalRoundBand, number> {
  const curve = buildCurveFromModel(model);
  return Object.fromEntries(
    (Object.keys(ROUND_BAND_BUCKETS) as DraftCapitalRoundBand[]).map((band) => [
      band,
      bandNet(curve, band, raw, counts).net,
    ]),
  ) as Record<DraftCapitalRoundBand, number>;
}
