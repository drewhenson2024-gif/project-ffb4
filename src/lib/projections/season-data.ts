import type { createServerClient } from "@/lib/supabase/server";
import type { Position } from "@/types/database";
import type { CareerMeta, SeasonStatRow } from "./player-profiles";

const PAGE_SIZE = 1000;

async function fetchAll<T>(
  supabase: ReturnType<typeof createServerClient>,
  table: string,
  select: string,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function loadAllSeasonStats(
  supabase: ReturnType<typeof createServerClient>,
): Promise<SeasonStatRow[]> {
  return fetchAll<SeasonStatRow>(
    supabase,
    "fantasy_season_stats",
    "player_id, season_year, position, fantasy_points_ppr, fantasy_points_half_ppr, fantasy_points_standard, games_played",
  );
}

export async function loadCareerMeta(
  supabase: ReturnType<typeof createServerClient>,
): Promise<CareerMeta[]> {
  return fetchAll<CareerMeta>(
    supabase,
    "player_career_stats",
    "player_id, draft_year, draft_pick_overall, draft_position, first_season, last_season",
  );
}

export type PlayerIdentity = {
  id: number;
  is_undrafted: boolean;
  primary_position: Position;
  birth_date: string | null;
};

export async function loadPlayerIdentities(
  supabase: ReturnType<typeof createServerClient>,
): Promise<PlayerIdentity[]> {
  return fetchAll<PlayerIdentity>(
    supabase,
    "players",
    "id, is_undrafted, primary_position, birth_date",
  );
}
