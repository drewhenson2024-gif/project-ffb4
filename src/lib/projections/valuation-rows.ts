import { disambiguatedLabel } from "@/lib/normalize-name";
import type { createServerClient } from "@/lib/supabase/server";
import type { LeagueConfig } from "@/lib/pab/types";
import type { Position } from "@/types/database";
import { runCareerProjections } from "./run-projections";

export type ValuationRow = {
  playerId: number;
  fullName: string;
  displayLabel: string;
  position: Position;
  draftYear: number | null;
  draftPick: number | null;
  isUndrafted: boolean;
  yearsPlayed: number;
  realizedPab: number;
  projectedRemainingPab: number;
  totalCareerPab: number;
};

export async function loadValuationRows(
  supabase: ReturnType<typeof createServerClient>,
  config: LeagueConfig,
): Promise<{
  rows: ValuationRow[];
  summary: Awaited<ReturnType<typeof runCareerProjections>>["summary"];
}> {
  const { projections, summary } = await runCareerProjections(supabase, config);
  const playerIds = [...projections.keys()];
  if (!playerIds.length) {
    return { rows: [], summary };
  }

  const { data: profiles } = await supabase
    .from("player_profiles")
    .select(
      "player_id, full_name, draft_year, debut_season, draft_pick_overall, is_undrafted, primary_position",
    )
    .in("player_id", playerIds);

  const profileById = new Map((profiles ?? []).map((p) => [p.player_id, p]));

  const rows: ValuationRow[] = [];

  for (const [playerId, projection] of projections) {
    const profile = profileById.get(playerId);
    const draftYear = profile?.draft_year ?? null;
    const label = profile?.full_name ?? `Player ${playerId}`;
    const displayLabel = disambiguatedLabel(
      label,
      draftYear,
      profile?.debut_season ?? null,
    );

    rows.push({
      playerId,
      fullName: profile?.full_name ?? label,
      displayLabel,
      position: projection.position,
      draftYear,
      draftPick: profile?.draft_pick_overall ?? null,
      isUndrafted: profile?.is_undrafted ?? false,
      yearsPlayed: projection.yearsPlayed,
      realizedPab: projection.realizedPab,
      projectedRemainingPab: projection.projectedRemainingPab,
      totalCareerPab: projection.totalCareerPab,
    });
  }

  rows.sort((a, b) => b.projectedRemainingPab - a.projectedRemainingPab);

  return { rows, summary };
}
