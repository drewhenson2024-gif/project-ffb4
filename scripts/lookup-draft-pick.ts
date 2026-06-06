import { config } from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

config({ path: path.resolve(process.cwd(), ".env.local") });

const pick = Number(process.argv[2] ?? 1);
const position = (process.argv[3] ?? "RB").toUpperCase();

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  const { data, error } = await supabase
    .from("player_career_stats")
    .select(
      "player_id, draft_year, draft_pick_overall, draft_position, first_season, seasons_played",
    )
    .eq("draft_pick_overall", pick)
    .eq("draft_position", position)
    .order("draft_year", { ascending: false });

  if (error) throw error;

  const ids = (data ?? []).map((r) => r.player_id);
  const { data: players } = ids.length
    ? await supabase.from("players").select("id, full_name").in("id", ids)
    : { data: [] };

  const names = new Map((players ?? []).map((p) => [p.id, p.full_name]));

  for (const row of data ?? []) {
    console.log(
      `${row.draft_year}: ${names.get(row.player_id) ?? row.player_id} (#${pick} ${position})`,
    );
  }
  console.log(`Total: ${data?.length ?? 0}`);
}

main().catch(console.error);
