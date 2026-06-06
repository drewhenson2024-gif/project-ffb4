import type { Position } from "@/types/database";
import {
  seasonPabContribution,
  toValuableTierPab,
  type TierPabRates,
} from "@/lib/pab/career-pab";
import { computePabRates, getPabSeasonYears } from "@/lib/pab/compute-pab";
import { classifyRank, getPositionThresholds } from "@/lib/pab/thresholds";
import { scoringColumn } from "@/lib/pab/scoring";
import type { LeagueConfig, SeasonTier } from "@/lib/pab/types";

export type SeasonStatRow = {
  player_id: number;
  season_year: number;
  position: Position;
  fantasy_points_ppr: number;
  fantasy_points_half_ppr: number;
  fantasy_points_standard: number;
  games_played?: number;
};

export type CareerMeta = {
  player_id: number;
  draft_year: number | null;
  draft_pick_overall: number | null;
  draft_position: Position | null;
  first_season: number | null;
  last_season: number | null;
};

function getPoints(row: SeasonStatRow, config: LeagueConfig): number {
  return Number(row[scoringColumn(config.scoring)] ?? 0);
}

export function buildTierRatesByPosition(
  config: LeagueConfig,
  seasons: SeasonStatRow[],
  maxSeasonYear: number,
): Map<Position, TierPabRates> {
  const years = getPabSeasonYears(maxSeasonYear);
  const { positions } = computePabRates(config, seasons, years);
  return new Map(
    positions.map((p) => [p.position, toValuableTierPab(p.pab)]),
  );
}

export function buildPlayerSeasonPab(
  seasons: SeasonStatRow[],
  config: LeagueConfig,
  ratesByPosition: Map<Position, TierPabRates>,
): Map<
  number,
  Map<
    number,
    { tier: SeasonTier | null; pab: number; position: Position; games: number }
  >
> {
  const byPlayer = new Map<
    number,
    Map<
      number,
      { tier: SeasonTier | null; pab: number; position: Position; games: number }
    >
  >();
  const years = [...new Set(seasons.map((s) => s.season_year))];

  for (const year of years) {
    for (const position of ["QB", "RB", "WR", "TE"] as Position[]) {
      const thresholds = getPositionThresholds(config, position);
      const rates = ratesByPosition.get(position)!;
      const yearRows = seasons
        .filter((s) => s.season_year === year && s.position === position)
        .sort((a, b) => getPoints(b, config) - getPoints(a, config));

      yearRows.forEach((row, index) => {
        const tier = classifyRank(index + 1, thresholds);
        if (!byPlayer.has(row.player_id)) byPlayer.set(row.player_id, new Map());
        byPlayer.get(row.player_id)!.set(year, {
          tier,
          pab: seasonPabContribution(tier, rates),
          position: row.position,
          games: row.games_played ?? 0,
        });
      });
    }
  }

  return byPlayer;
}
