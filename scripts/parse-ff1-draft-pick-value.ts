/**
 * Parse FF1.0 DraftPickValue sheet to understand smoothing pattern.
 */
import fs from "node:fs";
import path from "node:path";

const CACHE = path.resolve(process.cwd(), "scripts/.cache/ff1-xlsx");

function parseSharedStrings(): string[] {
  const xml = fs.readFileSync(path.join(CACHE, "xl/sharedStrings.xml"), "utf8");
  const strings: string[] = [];
  const parts = xml.split(/<si>/);
  for (let i = 1; i < parts.length; i++) {
    const m = parts[i].match(/<t[^>]*>([^<]*)<\/t>/);
    strings.push(m ? m[1] : "");
  }
  return strings;
}

function parseSheet72(): { pick: number; value: number; hFormula?: string; hValue?: number; label?: string }[] {
  const xml = fs.readFileSync(path.join(CACHE, "xl/worksheets/sheet72.xml"), "utf8");
  const strings = parseSharedStrings();
  const rows: Record<number, Record<string, { v?: string; f?: string; t?: string }>> = {};

  const rowMatches = xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g);
  for (const match of rowMatches) {
    const rowNum = Number(match[1]);
    rows[rowNum] = {};
    const cellMatches = match[2].matchAll(/<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>/g);
    for (const cm of cellMatches) {
      const col = cm[1];
      const attrs = cm[3];
      const body = cm[4];
      const t = attrs.match(/t="([^"]+)"/)?.[1];
      const f = body.match(/<f[^>]*>([^<]*)<\/f>/)?.[1];
      const v = body.match(/<v>([^<]*)<\/v>/)?.[1];
      rows[rowNum][col] = { v, f, t };
    }
  }

  const out: { pick: number; value: number; hFormula?: string; hValue?: number; label?: string }[] = [];
  for (let r = 2; r <= 49; r++) {
    const row = rows[r];
    if (!row?.A?.v) continue;
    const pick = Number(row.A.v);
    const value = Number(row.B?.v);
    const label = row.G?.t === "s" && row.G.v ? strings[Number(row.G.v)] : undefined;
    out.push({
      pick,
      value,
      hFormula: row.H?.f,
      hValue: row.H?.v ? Number(row.H.v) : undefined,
      label,
    });
  }
  return out;
}

function fitLog(picks: number[], values: number[]) {
  let best = { a: 0, b: 0, loss: Infinity };
  for (let a = 400; a <= 520; a += 5) {
    for (let b = 50; b <= 120; b += 2) {
      let loss = 0;
      for (let i = 0; i < picks.length; i++) {
        const pred = a - b * Math.log(picks[i]);
        loss += Math.abs(pred - values[i]);
      }
      if (loss < best.loss) best = { a, b, loss };
    }
  }
  return best;
}

const data = parseSheet72();
console.log("FF1.0 DraftPickValue — per-pick curve (first 32):");
for (const row of data.filter((d) => d.pick <= 32)) {
  console.log(
    `  pick ${String(row.pick).padStart(2)}: ${row.value.toFixed(2)}${row.label ? `  [${row.label}]` : ""}${row.hFormula ? `  H=${row.hFormula}` : ""}`,
  );
}

console.log("\nRound 2 sample (33-48):");
for (const row of data.filter((d) => d.pick >= 33)) {
  console.log(`  pick ${row.pick}: ${row.value}`);
}

const r1 = data.filter((d) => d.pick <= 32);
const fit = fitLog(
  r1.map((d) => d.pick),
  r1.map((d) => d.value),
);
console.log(`\nLog fit picks 1-32: V = ${fit.a} - ${fit.b} * ln(pick), L1=${fit.loss.toFixed(1)}`);

console.log("\nBucket aggregation (H column):");
for (const row of data.filter((d) => d.hFormula)) {
  console.log(`  ${row.label ?? "?"}: ${row.hValue?.toFixed(2)} ← ${row.hFormula}`);
}
