/**
 * Compare draft-capital smoothing methods by total absolute deviation from raw.
 * Run: npx tsx scripts/sweep-draft-capital-smooth.ts
 * Refresh cache: npx tsx scripts/sweep-draft-capital-smooth.ts --refresh
 */
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_LEAGUE_CONFIG } from "../src/lib/pab/types";
import type { Position } from "../src/types/database";
import { buildDraftCapitalReport } from "../src/lib/projections/draft-capital";
import {
  BUCKET_REPRESENTATIVE_PICK,
  BUCKET_SLOT_WIDTH,
  DRAFT_BUCKET_ORDER,
  type DraftBucket,
} from "../src/lib/projections/draft-buckets";
import type { DraftCapitalCell } from "../src/lib/projections/draft-capital";

config({ path: path.resolve(process.cwd(), ".env.local") });

const CACHE_PATH = path.resolve(process.cwd(), "scripts/.cache/draft-capital-raw.json");
const DRAFT_BUCKETS = DRAFT_BUCKET_ORDER.filter((b) => b !== "undrafted");
const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];
const ALPHAS = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

type Series = {
  raw: number[];
  picks: number[];
  counts: number[];
  weights: number[];
};

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function buildSeries(cells: Record<DraftBucket, DraftCapitalCell>): Series {
  const raw = DRAFT_BUCKETS.map((b) => cells[b].avgPab);
  const counts = DRAFT_BUCKETS.map((b) => cells[b].count);
  const picks = DRAFT_BUCKETS.map((b) => BUCKET_REPRESENTATIVE_PICK[b]);
  const weights = DRAFT_BUCKETS.map((b, i) => {
    if (counts[i] <= 0) return 0;
    const width = BUCKET_SLOT_WIDTH[b];
    const discount = width <= 1 ? 0.25 : 1;
    return counts[i] * Math.sqrt(width) * discount;
  });
  return { raw, picks, counts, weights };
}

function totalAbsDelta(series: Series, smoothed: number[]): number {
  let sum = 0;
  for (let i = 0; i < series.raw.length; i++) {
    if (series.counts[i] <= 0) continue;
    sum += Math.abs(smoothed[i] - series.raw[i]);
  }
  return sum;
}

function maxAbsDelta(series: Series, smoothed: number[]): number {
  let max = 0;
  for (let i = 0; i < series.raw.length; i++) {
    if (series.counts[i] <= 0) continue;
    max = Math.max(max, Math.abs(smoothed[i] - series.raw[i]));
  }
  return max;
}

function isMonotoneDecreasing(values: number[]): boolean {
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1] + 1e-9) return false;
  }
  return true;
}

function monotoneViolations(values: number[]): number {
  let n = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1] + 1e-9) n++;
  }
  return n;
}

function weightedMedian(values: number[], weights: number[]): number {
  const pairs = values
    .map((v, i) => ({ v, w: weights[i] }))
    .sort((a, b) => a.v - b.v);
  const total = pairs.reduce((s, p) => s + p.w, 0);
  let cum = 0;
  for (const p of pairs) {
    cum += p.w;
    if (cum >= total / 2) return p.v;
  }
  return pairs[pairs.length - 1]?.v ?? 0;
}

function isotonicL2(values: number[], weights: number[]): number[] {
  const rev = [...values].reverse();
  const revW = [...weights].reverse();

  type Block = { sum: number; weight: number; count: number };
  const blocks: Block[] = rev.map((v, i) => ({
    sum: v * revW[i],
    weight: revW[i],
    count: 1,
  }));

  let i = 0;
  while (i < blocks.length - 1) {
    const left = blocks[i].sum / blocks[i].weight;
    const right = blocks[i + 1].sum / blocks[i + 1].weight;
    if (left > right) {
      blocks[i].sum += blocks[i + 1].sum;
      blocks[i].weight += blocks[i + 1].weight;
      blocks[i].count += blocks[i + 1].count;
      blocks.splice(i + 1, 1);
      if (i > 0) i--;
    } else {
      i++;
    }
  }

  const outRev: number[] = [];
  for (const block of blocks) {
    const avg = block.sum / block.weight;
    for (let k = 0; k < block.count; k++) outRev.push(avg);
  }
  return outRev.reverse();
}

function isotonicL1(values: number[], weights: number[]): number[] {
  const rev = [...values].reverse();
  const revW = [...weights].reverse();

  type Block = { values: number[]; weights: number[] };
  let blocks: Block[] = rev.map((v, i) => ({
    values: [v],
    weights: [revW[i]],
  }));

  let i = 0;
  while (i < blocks.length - 1) {
    const left = weightedMedian(blocks[i].values, blocks[i].weights);
    const right = weightedMedian(blocks[i + 1].values, blocks[i + 1].weights);
    if (left > right) {
      blocks[i] = {
        values: [...blocks[i].values, ...blocks[i + 1].values],
        weights: [...blocks[i].weights, ...blocks[i + 1].weights],
      };
      blocks.splice(i + 1, 1);
      if (i > 0) i--;
    } else {
      i++;
    }
  }

  const outRev: number[] = [];
  for (const block of blocks) {
    const m = weightedMedian(block.values, block.weights);
    for (let k = 0; k < block.values.length; k++) outRev.push(m);
  }
  return outRev.reverse();
}

function blend(raw: number[], curve: number[], alpha: number): number[] {
  return raw.map((r, i) => alpha * curve[i] + (1 - alpha) * r);
}

function predictPowerLaw(scale: number, beta: number, pick: number): number {
  return scale * Math.pow(Math.max(pick, 1), -beta);
}

function predictLogLinear(a: number, b: number, pick: number): number {
  return a - b * Math.log(Math.max(pick, 1));
}

function predictExp(a: number, b: number, pick: number): number {
  return a * Math.exp(-b * pick);
}

function predictHyperbolic(a: number, b: number, pick: number): number {
  return a / (1 + b * pick);
}

function predictSqrtDecay(a: number, b: number, pick: number): number {
  return a - b * Math.sqrt(Math.max(pick, 1));
}

function linspace(min: number, max: number, count: number): number[] {
  if (count <= 1) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

function gridSearchL1(
  series: Series,
  predict: (params: number[], pick: number) => number,
  paramGrid: number[][],
): { values: number[]; params: number[]; l1: number } | null {
  let best: { values: number[]; params: number[]; l1: number } | null = null;

  const iterate = (depth: number, params: number[]) => {
    if (depth === paramGrid.length) {
      const values = series.picks.map((p) => predict(params, p));
      const l1 = totalAbsDelta(series, values);
      if (!best || l1 < best.l1) best = { values, params: [...params], l1 };
      return;
    }
    for (const v of paramGrid[depth]) {
      params[depth] = v;
      iterate(depth + 1, params);
    }
  };

  iterate(0, []);
  return best;
}

function bestBlendL1(
  series: Series,
  curve: number[],
): { values: number[]; alpha: number; l1: number } {
  let best = { values: series.raw, alpha: 0, l1: totalAbsDelta(series, series.raw) };
  for (const alpha of ALPHAS) {
    const values = blend(series.raw, curve, alpha);
    const l1 = totalAbsDelta(series, values);
    if (l1 < best.l1) best = { values, alpha, l1 };
  }
  return best;
}

function shrinkViolations(raw: number[], shrink: number): number[] {
  const s = [...raw];
  for (let i = 1; i < s.length; i++) {
    if (s[i] > s[i - 1]) {
      const excess = s[i] - s[i - 1];
      s[i] -= excess * shrink;
      s[i - 1] += excess * shrink;
    }
  }
  return s;
}

type MethodResult = {
  name: string;
  values: number[];
  l1: number;
  maxDelta: number;
  monotone: boolean;
  meta?: string;
};

function evaluate(name: string, series: Series, values: number[], meta?: string): MethodResult {
  return {
    name,
    values,
    l1: totalAbsDelta(series, values),
    maxDelta: maxAbsDelta(series, values),
    monotone: isMonotoneDecreasing(values),
    meta,
  };
}

function scaleGrid(series: Series): number[] {
  const active = series.raw.filter((_, i) => series.counts[i] > 0);
  const peak = Math.max(...active, 1);
  return linspace(peak * 0.4, peak * 1.6, 10);
}

function methodsForSeries(series: Series): MethodResult[] {
  const results: MethodResult[] = [];
  const active = series.counts.filter((c) => c > 0).length;
  if (active < 2) return [evaluate("raw", series, series.raw)];

  results.push(evaluate("raw", series, series.raw));

  const scales = scaleGrid(series);
  const betas = linspace(0.05, 1.2, 12);
  const logSlopes = linspace(5, 120, 10);
  const logIntercepts = linspace(Math.min(...series.raw) * 1.2, Math.max(...series.raw) * 1.5, 10);
  const expRates = linspace(0.001, 0.02, 10);
  const hypRates = linspace(0.005, 0.12, 10);
  const sqrtSlopes = linspace(2, 60, 10);

  const fits: { name: string; fit: NonNullable<ReturnType<typeof gridSearchL1>> }[] = [];

  const power = gridSearchL1(
    series,
    ([scale, beta], p) => predictPowerLaw(scale, beta, p),
    [scales, betas],
  );
  if (power) fits.push({ name: "powerLaw", fit: power });

  const logLin = gridSearchL1(
    series,
    ([a, b], p) => predictLogLinear(a, b, p),
    [logIntercepts, logSlopes],
  );
  if (logLin) fits.push({ name: "logLinear", fit: logLin });

  const expFit = gridSearchL1(
    series,
    ([a, b], p) => predictExp(a, b, p),
    [scales, expRates],
  );
  if (expFit) fits.push({ name: "expDecay", fit: expFit });

  const hyp = gridSearchL1(
    series,
    ([a, b], p) => predictHyperbolic(a, b, p),
    [scales, hypRates],
  );
  if (hyp) fits.push({ name: "hyperbolic", fit: hyp });

  const sqrtFit = gridSearchL1(
    series,
    ([a, b], p) => predictSqrtDecay(a, b, p),
    [logIntercepts, sqrtSlopes],
  );
  if (sqrtFit) fits.push({ name: "sqrtDecay", fit: sqrtFit });

  for (const { name, fit } of fits) {
    results.push(
      evaluate(`${name}-L1`, series, fit.values, `L1=${fit.l1.toFixed(1)} params=${fit.params.map((p) => p.toFixed(2)).join(",")}`),
    );
    const blended = bestBlendL1(series, fit.values);
    results.push(
      evaluate(`${name}-L1+blend`, series, blended.values, `alpha=${blended.alpha}`),
    );
  }

  const isoL2 = isotonicL2(series.raw, series.weights);
  results.push(evaluate("isotonic-L2", series, isoL2));
  const isoL2blend = bestBlendL1(series, isoL2);
  results.push(evaluate("isotonic-L2+blend", series, isoL2blend.values, `alpha=${isoL2blend.alpha}`));

  const isoL1 = isotonicL1(series.raw, series.weights);
  results.push(evaluate("isotonic-L1", series, isoL1));
  const isoL1blend = bestBlendL1(series, isoL1);
  results.push(evaluate("isotonic-L1+blend", series, isoL1blend.values, `alpha=${isoL1blend.alpha}`));

  for (const shrink of [0.25, 0.5, 0.75]) {
    results.push(evaluate(`shrink-violations-${shrink}`, series, shrinkViolations(series.raw, shrink)));
  }

  const roll3 = series.raw.map((_, i) => {
    const window = [i - 1, i, i + 1].filter((j) => j >= 0 && j < series.raw.length);
    const vals = window.filter((j) => series.counts[j] > 0).map((j) => series.raw[j]);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : series.raw[i];
  });
  const rollBlend = bestBlendL1(series, isotonicL2(roll3, series.weights));
  results.push(evaluate("rolling3-isotonicL2+blend", series, rollBlend.values, `alpha=${rollBlend.alpha}`));

  if (fits.length) {
    const bestCurve = fits.reduce((a, b) => (a.fit.l1 < b.fit.l1 ? a : b));
    const monoBlend = bestBlendL1(series, isotonicL2(bestCurve.fit.values, series.weights));
    results.push(
      evaluate(
        `best-${bestCurve.name}-isoL2+blend`,
        series,
        monoBlend.values,
        `alpha=${monoBlend.alpha}`,
      ),
    );
  }

  return results;
}

async function loadRawCells(): Promise<{
  rawCells: Record<DraftBucket, Record<Position, DraftCapitalCell>>;
  cohortSize: number;
}> {
  const refresh = process.argv.includes("--refresh");
  if (!refresh && fs.existsSync(CACHE_PATH)) {
    log("Loading cached raw cells");
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  }

  log("Building draft capital report (projections + cohort — may take 1–2 min)");
  const t0 = Date.now();
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const report = await buildDraftCapitalReport(supabase, DEFAULT_LEAGUE_CONFIG);
  log(`Report built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const payload = { rawCells: report.rawCells, cohortSize: report.cohortSize };
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(payload));
  log(`Cached raw cells → ${CACHE_PATH}`);
  return payload;
}

async function main() {
  const { rawCells, cohortSize } = await loadRawCells();
  const aggregateByMethod = new Map<string, { l1: number; maxDelta: number; monotone: number }>();

  log(`Cohort size: ${cohortSize}`);
  console.log("\n--- Per position best (monotone only) ---\n");

  for (const position of POSITIONS) {
    const column = Object.fromEntries(
      DRAFT_BUCKET_ORDER.map((b) => [b, rawCells[b][position]]),
    ) as Record<DraftBucket, DraftCapitalCell>;
    const series = buildSeries(column);
    log(`Sweeping ${position}...`);
    const results = methodsForSeries(series);

    const monotoneOnly = results.filter((r) => r.monotone).sort((a, b) => a.l1 - b.l1);
    console.log(`## ${position}`);
    for (const row of monotoneOnly.slice(0, 8)) {
      console.log(
        `  ${row.l1.toFixed(1).padStart(7)} L1 | max ${row.maxDelta.toFixed(1).padStart(5)} | ${row.name}${row.meta ? ` (${row.meta})` : ""}`,
      );
    }
    console.log(`  raw: violations=${monotoneViolations(series.raw)}\n`);

    for (const row of results) {
      const prev = aggregateByMethod.get(row.name) ?? { l1: 0, maxDelta: 0, monotone: 0 };
      prev.l1 += row.l1;
      prev.maxDelta = Math.max(prev.maxDelta, row.maxDelta);
      prev.monotone += row.monotone ? 1 : 0;
      aggregateByMethod.set(row.name, prev);
    }
  }

  console.log("--- Aggregate (sorted by total L1) ---\n");
  const agg = [...aggregateByMethod.entries()]
    .map(([name, s]) => ({
      name,
      totalL1: s.l1,
      maxDelta: s.maxDelta,
      monotonePositions: s.monotone,
    }))
    .sort((a, b) => a.totalL1 - b.totalL1);

  for (const row of agg.slice(0, 18)) {
    console.log(
      `${row.totalL1.toFixed(1).padStart(8)} total L1 | max ${row.maxDelta.toFixed(1).padStart(5)} | mono ${row.monotonePositions}/4 | ${row.name}`,
    );
  }

  const monotoneAgg = agg.filter((r) => r.monotonePositions === 4);
  console.log("\n--- Best monotone (all 4 positions) ---\n");
  for (const row of monotoneAgg.slice(0, 8)) {
    console.log(`${row.totalL1.toFixed(1).padStart(8)} total L1 | max ${row.maxDelta.toFixed(1).padStart(5)} | ${row.name}`);
  }
}

main().catch(console.error);
