import { config } from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_LEAGUE_CONFIG } from "../src/lib/pab/types";
import { loadValuationRows } from "../src/lib/projections/valuation-rows";

config({ path: path.resolve(process.cwd(), ".env.local") });

const nameQuery = (process.argv[2] ?? "mahomes").toLowerCase();

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  const { rows } = await loadValuationRows(supabase, DEFAULT_LEAGUE_CONFIG);
  const matches = rows.filter((r) => r.fullName.toLowerCase().includes(nameQuery));

  if (!matches.length) {
    console.log(`No match for "${nameQuery}" in ${rows.length} active projections.`);
    return;
  }

  for (const m of matches) {
    const rank = rows.findIndex((r) => r.playerId === m.playerId) + 1;
    console.log({
      rank,
      total: rows.length,
      name: m.displayLabel,
      position: m.position,
      projectedRemainingPab: Number(m.projectedRemainingPab.toFixed(1)),
      realizedPab: Number(m.realizedPab.toFixed(1)),
      totalCareerPab: Number(m.totalCareerPab.toFixed(1)),
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
