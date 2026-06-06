import type { createServerClient } from "@/lib/supabase/server";
import type { LeagueConfig } from "@/lib/pab/types";
import type { Position } from "@/types/database";
import { MAX_DRAFT_PICK } from "./draft-buckets";
import { buildDraftCapitalReport } from "./draft-capital";
import {
  draftCapitalAtPick,
  type LogDraftCapitalModelsByPosition,
} from "./draft-capital-smooth";
import { loadAllSeasonStats } from "./season-data";

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];
const MIN_DRAFT_YEAR = 2000;
const PAGE_SIZE = 1000;

export const DYNASTY_PICK_POOL_SIZE = 48;
export const DYNASTY_PICK_HISTORY_YEARS = 25;

type DraftPickRow = {
  draft_year: number;
  pick_overall: number;
  position: Position;
};

export type DynastyPickValueRow = {
  rank: number;
  avgCapitalValue: number;
  sampleYears: number;
  /** Fantasy slot label for the user's league size (e.g. 1.07). */
  slotLabel: string;
};

export type DynastyPickValuesReport = {
  rows: DynastyPickValueRow[];
  poolSize: number;
  yearsUsed: number[];
  excludedDraftYear: number;
  config: LeagueConfig;
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

export function dynastySlotLabel(rank: number, teams: number): string {
  const round = Math.ceil(rank / teams);
  const pickInRound = ((rank - 1) % teams) + 1;
  return `${round}.${String(pickInRound).padStart(2, "0")}`;
}

export function computeDynastyPickValues(
  models: LogDraftCapitalModelsByPosition,
  picksByYear: Map<number, DraftPickRow[]>,
  years: number[],
  poolSize: number,
  teams: number,
): DynastyPickValueRow[] {
  const sums = new Array<number>(poolSize).fill(0);
  const counts = new Array<number>(poolSize).fill(0);

  for (const year of years) {
    const picks = picksByYear.get(year) ?? [];
    const scored = picks
      .filter(
        (row) =>
          POSITIONS.includes(row.position) &&
          row.pick_overall >= 1 &&
          row.pick_overall <= MAX_DRAFT_PICK,
      )
      .map((row) => ({
        value: draftCapitalAtPick(models[row.position], row.pick_overall),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, poolSize);

    for (let rank = 0; rank < scored.length; rank++) {
      sums[rank] += scored[rank].value;
      counts[rank] += 1;
    }
  }

  return Array.from({ length: poolSize }, (_, index) => {
    const rank = index + 1;
    const n = counts[index];
    return {
      rank,
      avgCapitalValue: n > 0 ? sums[index] / n : 0,
      sampleYears: n,
      slotLabel: dynastySlotLabel(rank, teams),
    };
  });
}

export async function buildDynastyPickValuesReport(
  supabase: ReturnType<typeof createServerClient>,
  config: LeagueConfig,
  poolSize: number = DYNASTY_PICK_POOL_SIZE,
): Promise<DynastyPickValuesReport> {
  const [capitalReport, seasonRows, draftPicks] = await Promise.all([
    buildDraftCapitalReport(supabase, config),
    loadAllSeasonStats(supabase),
    fetchAll<DraftPickRow>(
      supabase,
      "draft_picks",
      "draft_year, pick_overall, position",
    ),
  ]);

  const currentSeason = seasonRows.length
    ? Math.max(...seasonRows.map((row) => row.season_year))
    : new Date().getFullYear();

  const picksByYear = new Map<number, DraftPickRow[]>();
  for (const pick of draftPicks) {
    if (pick.draft_year < MIN_DRAFT_YEAR) continue;
    if (!POSITIONS.includes(pick.position)) continue;
    const bucket = picksByYear.get(pick.draft_year) ?? [];
    bucket.push(pick);
    picksByYear.set(pick.draft_year, bucket);
  }

  const yearsUsed = [...picksByYear.keys()]
    .filter((year) => year !== currentSeason)
    .sort((a, b) => b - a)
    .slice(0, DYNASTY_PICK_HISTORY_YEARS)
    .sort((a, b) => a - b);

  const rows = computeDynastyPickValues(
    capitalReport.models,
    picksByYear,
    yearsUsed,
    poolSize,
    config.teams,
  );

  return {
    rows,
    poolSize,
    yearsUsed,
    excludedDraftYear: currentSeason,
    config,
  };
}
