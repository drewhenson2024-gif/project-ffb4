import type { createServerClient } from "@/lib/supabase/server";
import {
  careerPabFromTierCounts,
  emptyTierSeasonCounts,
  incrementTierCount,
} from "@/lib/pab/career-pab";
import type { LeagueConfig } from "@/lib/pab/types";
import type { Position } from "@/types/database";
import { isCareerComplete, isCurrentRookie, recentSeasonYears } from "./career-complete";
import {
  DRAFT_BUCKET_ORDER,
  draftPickBucket,
  type DraftBucket,
} from "./draft-buckets";
import {
  buildPlayerSeasonPab,
  buildTierRatesByPosition,
} from "./player-profiles";
import {
  smoothDraftCapitalGrid,
  type LogDraftCapitalModelsByPosition,
} from "./draft-capital-smooth";
import { loadAllSeasonStats } from "./season-data";
import { runCareerProjections } from "./run-projections";

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];
const MIN_COHORT_YEAR = 2000;
const PAGE_SIZE = 1000;

type CareerRow = {
  player_id: number;
  draft_year: number | null;
  draft_pick_overall: number | null;
  draft_position: Position | null;
  first_season: number | null;
  last_season: number | null;
  seasons_played: number;
};

type PlayerRow = {
  id: number;
  is_undrafted: boolean;
  primary_position: Position;
};

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

function inDraftCapitalCohort(career: CareerRow, isUndrafted: boolean): boolean {
  if (isUndrafted) {
    return (
      career.first_season != null && career.first_season >= MIN_COHORT_YEAR
    );
  }
  return career.draft_year != null && career.draft_year >= MIN_COHORT_YEAR;
}

export type DraftCapitalCell = {
  avgPab: number;
  count: number;
};

export type DraftCapitalReport = {
  /** Smoothed avg PAB (monotone by draft slot; primary display). */
  cells: Record<DraftBucket, Record<Position, DraftCapitalCell>>;
  /** Unsmoothed cohort averages. */
  rawCells: Record<DraftBucket, Record<Position, DraftCapitalCell>>;
  /** Position-specific log curves used for smoothing. */
  models: LogDraftCapitalModelsByPosition;
  cohortSize: number;
  skippedRookies: number;
  config: LeagueConfig;
};

function emptyGrid(): Record<DraftBucket, Record<Position, DraftCapitalCell>> {
  const cells = {} as Record<DraftBucket, Record<Position, DraftCapitalCell>>;
  for (const bucket of DRAFT_BUCKET_ORDER) {
    cells[bucket] = {
      QB: { avgPab: 0, count: 0 },
      RB: { avgPab: 0, count: 0 },
      WR: { avgPab: 0, count: 0 },
      TE: { avgPab: 0, count: 0 },
    };
  }
  return cells;
}

function realizedPabForCareer(
  playerId: number,
  seasonPab: ReturnType<typeof buildPlayerSeasonPab>,
): number {
  const seasons = seasonPab.get(playerId);
  if (!seasons) return 0;
  return [...seasons.values()].reduce((sum, entry) => sum + entry.pab, 0);
}

export async function buildDraftCapitalReport(
  supabase: ReturnType<typeof createServerClient>,
  config: LeagueConfig,
): Promise<DraftCapitalReport> {
  const projectionResult = await runCareerProjections(supabase, config);

  const [careers, players] = await Promise.all([
    fetchAll<CareerRow>(
      supabase,
      "player_career_stats",
      "player_id, draft_year, draft_pick_overall, draft_position, first_season, last_season, seasons_played",
    ),
    fetchAll<PlayerRow>(supabase, "players", "id, is_undrafted, primary_position"),
  ]);

  const playerById = new Map(players.map((p) => [p.id, p]));

  const seasonRows = await loadAllSeasonStats(supabase);
  if (!seasonRows.length) {
    const empty = emptyGrid();
    return {
      cells: empty,
      rawCells: empty,
      models: {
        QB: { intercept: 0, slope: 0, segmentOffsets: { round1: 0, rounds2_3: 0, rounds4_7: 0 } },
        RB: { intercept: 0, slope: 0, segmentOffsets: { round1: 0, rounds2_3: 0, rounds4_7: 0 } },
        WR: { intercept: 0, slope: 0, segmentOffsets: { round1: 0, rounds2_3: 0, rounds4_7: 0 } },
        TE: { intercept: 0, slope: 0, segmentOffsets: { round1: 0, rounds2_3: 0, rounds4_7: 0 } },
      },
      cohortSize: 0,
      skippedRookies: 0,
      config,
    };
  }

  const maxYear = Math.max(...seasonRows.map((s) => s.season_year));
  const currentSeason = maxYear;
  const recent = new Set(recentSeasonYears(currentSeason));
  const recentPlayers = new Set(
    seasonRows
      .filter((r) => recent.has(r.season_year))
      .map((r) => r.player_id),
  );

  const ratesByPosition = buildTierRatesByPosition(config, seasonRows, maxYear);
  const seasonPab = buildPlayerSeasonPab(seasonRows, config, ratesByPosition);

  const sums = emptyGrid();
  let cohortSize = 0;
  let skippedRookies = 0;

  for (const career of careers) {
    const player = playerById.get(career.player_id);
    const isUndrafted = player?.is_undrafted ?? !career.draft_pick_overall;

    if (!inDraftCapitalCohort(career, isUndrafted)) continue;
    if ((career.seasons_played ?? 0) < 1) continue;

    if (
      isCurrentRookie(
        career.seasons_played ?? 0,
        career.first_season,
        career.last_season,
        currentSeason,
      )
    ) {
      skippedRookies += 1;
      continue;
    }

    const position =
      (career.draft_position ??
        player?.primary_position ??
        "WR") as Position;

    const bucket = draftPickBucket(career.draft_pick_overall, isUndrafted);
    if (!bucket) continue;

    const complete = isCareerComplete(
      career.last_season,
      recentPlayers.has(career.player_id),
      currentSeason,
    );

    let totalPab: number;
    const activeProjection = projectionResult.projections.get(career.player_id);

    if (activeProjection) {
      totalPab = activeProjection.totalCareerPab;
    } else if (complete) {
      totalPab = realizedPabForCareer(career.player_id, seasonPab);
    } else {
      const counts = emptyTierSeasonCounts();
      const map = seasonPab.get(career.player_id);
      if (map) {
        for (const entry of map.values()) {
          Object.assign(counts, incrementTierCount(counts, entry.tier));
        }
      }
      const rates = ratesByPosition.get(position)!;
      totalPab = careerPabFromTierCounts(counts, rates);
    }

    sums[bucket][position].avgPab += totalPab;
    sums[bucket][position].count += 1;
    cohortSize += 1;
  }

  const cells = emptyGrid();
  for (const bucket of DRAFT_BUCKET_ORDER) {
    for (const position of POSITIONS) {
      const count = sums[bucket][position].count;
      cells[bucket][position] = {
        count,
        avgPab: count > 0 ? sums[bucket][position].avgPab / count : 0,
      };
    }
  }

  const { cells: smoothedCells, models } = smoothDraftCapitalGrid(cells);

  return {
    cells: smoothedCells,
    rawCells: cells,
    models,
    cohortSize,
    skippedRookies,
    config,
  };
}
