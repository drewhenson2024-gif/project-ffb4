/**
 * Verify log per-pick curve smoothing.
 * Run: npx tsx scripts/verify-draft-capital-smooth.ts
 */
import fs from "node:fs";
import path from "node:path";
import type { Position } from "../src/types/database";
import { DRAFT_BUCKET_ORDER, type DraftBucket } from "../src/lib/projections/draft-buckets";
import type { DraftCapitalCell } from "../src/lib/projections/draft-capital";
import {
  bandNetTotals,
  DRAFT_PICK_BUCKETS,
  formatLogDraftCapitalModel,
  isMonotoneDecreasing,
  isPerPickCurveMonotone,
  smoothLogDraftCapitalSeries,
} from "../src/lib/projections/draft-capital-smooth";

const CACHE_PATH = path.resolve(process.cwd(), "scripts/.cache/draft-capital-raw.json");
const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

function main() {
  const { rawCells } = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) as {
    rawCells: Record<DraftBucket, Record<Position, DraftCapitalCell>>;
  };

  for (const position of POSITIONS) {
    const column = Object.fromEntries(
      DRAFT_BUCKET_ORDER.map((b) => [b, rawCells[b][position]]),
    ) as Record<DraftBucket, DraftCapitalCell>;

    const raw = DRAFT_PICK_BUCKETS.map((b) => column[b].avgPab);
    const counts = DRAFT_PICK_BUCKETS.map((b) => column[b].count);
    const { values, model, curve } = smoothLogDraftCapitalSeries(position, raw, counts);

    let net = 0;
    let abs = 0;
    for (let i = 0; i < raw.length; i++) {
      if (counts[i] <= 0) continue;
      const d = values[i] - raw[i];
      net += d;
      abs += Math.abs(d);
    }

    const bucketMono = isMonotoneDecreasing(values, counts);
    const pickMono = isPerPickCurveMonotone(curve);

    const bandNets = bandNetTotals(model, raw, counts);

    console.log(`\n## ${position}`);
    console.log(
      `   V(p) = ${formatLogDraftCapitalModel(model)}  |  net=${net >= 0 ? "+" : ""}${net.toFixed(0)}  abs=${abs.toFixed(0)}  pickMono=${pickMono}  bucketMono=${bucketMono}`,
    );
    console.log(
      `   band net: R1=${bandNets.round1 >= 0 ? "+" : ""}${bandNets.round1.toFixed(0)}  R2-3=${bandNets.rounds2_3 >= 0 ? "+" : ""}${bandNets.rounds2_3.toFixed(0)}  R4-7=${bandNets.rounds4_7 >= 0 ? "+" : ""}${bandNets.rounds4_7.toFixed(0)}`,
    );
    console.log(
      `   picks 1,8,16,32,48,96,224: ${[1, 8, 16, 32, 48, 96, 224].map((p) => curve[p].toFixed(0)).join(" → ")}`,
    );

    for (let i = 0; i < DRAFT_PICK_BUCKETS.length; i++) {
      if (counts[i] <= 0) continue;
      const bucket = DRAFT_PICK_BUCKETS[i];
      const delta = values[i] - raw[i];
      console.log(
        `   ${bucket.padEnd(11)} raw=${raw[i].toFixed(0).padStart(4)} → ${values[i].toFixed(0).padStart(4)} (${delta >= 0 ? "+" : ""}${delta.toFixed(0)})`,
      );
    }
  }
}

main();
