import type { createServerClient } from "@/lib/supabase/server";
import type { FantasySeasonStats } from "@/types/database";
import { getPabSeasonYears } from "./compute-pab";

export type PabSeasonRow = Pick<
  FantasySeasonStats,
  | "season_year"
  | "position"
  | "fantasy_points_ppr"
  | "fantasy_points_half_ppr"
  | "fantasy_points_standard"
>;

const SEASON_SELECT =
  "season_year, position, fantasy_points_ppr, fantasy_points_half_ppr, fantasy_points_standard";

const PAGE_SIZE = 1000;

export async function getMaxSeasonYear(
  supabase: ReturnType<typeof createServerClient>,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("fantasy_season_stats")
    .select("season_year")
    .order("season_year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.season_year ?? null;
}

async function fetchSeasonRows(
  supabase: ReturnType<typeof createServerClient>,
  years: number[],
): Promise<PabSeasonRow[]> {
  const rows: PabSeasonRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("fantasy_season_stats")
      .select(SEASON_SELECT)
      .in("season_year", years)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data?.length) break;

    rows.push(...(data as PabSeasonRow[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export async function loadPabSeasons(
  supabase: ReturnType<typeof createServerClient>,
): Promise<{ years: number[]; seasons: PabSeasonRow[] }> {
  const maxYear = await getMaxSeasonYear(supabase);
  if (maxYear === null) {
    return { years: [], seasons: [] };
  }

  const years = getPabSeasonYears(maxYear);
  const seasons = await fetchSeasonRows(supabase, years);

  return { years, seasons };
}
