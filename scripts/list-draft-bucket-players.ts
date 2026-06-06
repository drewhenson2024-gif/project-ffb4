/**
 * List players in a draft-capital bucket with total career PAB.
 * Run: npx tsx scripts/list-draft-bucket-players.ts top-8 RB
 */
import { config } from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_LEAGUE_CONFIG } from "../src/lib/pab/types";
import type { Position } from "../src/types/database";
import {
  careerPabFromTierCounts,
  emptyTierSeasonCounts,
  incrementTierCount,
} from "../src/lib/pab/career-pab";
import { isCareerComplete, isCurrentRookie, recentSeasonYears } from "../src/lib/projections/career-complete";
import {
  DRAFT_BUCKET_ORDER,
  draftPickBucket,
  type DraftBucket,
} from "../src/lib/projections/draft-buckets";
import {
  buildPlayerSeasonPab,
  buildTierRatesByPosition,
} from "../src/lib/projections/player-profiles";
import { loadAllSeasonStats } from "../src/lib/projections/season-data";
import { runCareerProjections } from "../src/lib/projections/run-projections";

config({ path: path.resolve(process.cwd(), ".env.local") });

const PAGE_SIZE = 1000;
const MIN_COHORT_YEAR = 2000;

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
  full_name: string;
  is_undrafted: boolean;
  primary_position: Position;
};

async function fetchAll<T>(
  supabase: ReturnType<typeof createClient>,
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
    return career.first_season != null && career.first_season >= MIN_COHORT_YEAR;
  }
  return career.draft_year != null && career.draft_year >= MIN_COHORT_YEAR;
}

function realizedPabForCareer(
  playerId: number,
  seasonPab: ReturnType<typeof buildPlayerSeasonPab>,
): number {
  const seasons = seasonPab.get(playerId);
  if (!seasons) return 0;
  return [...seasons.values()].reduce((sum, entry) => sum + entry.pab, 0);
}

async function main() {
  const bucketArg = process.argv[2] as DraftBucket | undefined;
  const positionArg = process.argv[3] as Position | undefined;

  if (!bucketArg || !DRAFT_BUCKET_ORDER.includes(bucketArg)) {
    console.error("Usage: npx tsx scripts/list-draft-bucket-players.ts <bucket> <position>");
    console.error("Buckets:", DRAFT_BUCKET_ORDER.join(", "));
    process.exit(1);
  }
  if (!positionArg || !["QB", "RB", "WR", "TE"].includes(positionArg)) {
    console.error("Position must be QB, RB, WR, or TE");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );

  const config = DEFAULT_LEAGUE_CONFIG;
  const projectionResult = await runCareerProjections(supabase, config);

  const [careers, players] = await Promise.all([
    fetchAll<CareerRow>(
      supabase,
      "player_career_stats",
      "player_id, draft_year, draft_pick_overall, draft_position, first_season, last_season, seasons_played",
    ),
    fetchAll<PlayerRow>(supabase, "players", "id, full_name, is_undrafted, primary_position"),
  ]);

  const playerById = new Map(players.map((p) => [p.id, p]));
  const seasonRows = await loadAllSeasonStats(supabase);
  const maxYear = Math.max(...seasonRows.map((s) => s.season_year));
  const currentSeason = maxYear;
  const recent = new Set(recentSeasonYears(currentSeason));
  const recentPlayers = new Set(
    seasonRows.filter((r) => recent.has(r.season_year)).map((r) => r.player_id),
  );

  const ratesByPosition = buildTierRatesByPosition(config, seasonRows, maxYear);
  const seasonPab = buildPlayerSeasonPab(seasonRows, config, ratesByPosition);

  const matches: {
    name: string;
    pick: number;
    year: number;
    totalPab: number;
    source: string;
  }[] = [];

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
      continue;
    }

    const position =
      (career.draft_position ?? player?.primary_position ?? "WR") as Position;
    if (position !== positionArg) continue;

    const bucket = draftPickBucket(career.draft_pick_overall, isUndrafted);
    if (bucket !== bucketArg) continue;

    const complete = isCareerComplete(
      career.last_season,
      recentPlayers.has(career.player_id),
      currentSeason,
    );

    let totalPab: number;
    let source: string;
    const activeProjection = projectionResult.projections.get(career.player_id);

    if (activeProjection) {
      totalPab = activeProjection.totalCareerPab;
      source = "projected";
    } else if (complete) {
      totalPab = realizedPabForCareer(career.player_id, seasonPab);
      source = "realized";
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
      source = "tier-estimate";
    }

    matches.push({
      name: player?.full_name ?? `Player ${career.player_id}`,
      pick: career.draft_pick_overall!,
      year: career.draft_year!,
      totalPab,
      source,
    });
  }

  matches.sort((a, b) => b.totalPab - a.totalPab);

  const sum = matches.reduce((s, m) => s + m.totalPab, 0);
  const avg = matches.length ? sum / matches.length : 0;

  console.log(`\n${positionArg} · ${bucketArg} · n=${matches.length}`);
  console.log(`Average total career PAB: ${avg.toFixed(1)}\n`);
  console.log("Player                          | Pick | Year | Total PAB | Source");
  console.log("--------------------------------|------|------|-----------|--------");

  for (const m of matches) {
    console.log(
      `${m.name.padEnd(31)} | ${String(m.pick).padStart(4)} | ${m.year} | ${m.totalPab.toFixed(1).padStart(9)} | ${m.source}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
