import { DynastyPickValuesTable } from "@/components/dynasty-pick-values-table";
import { LeagueConfigNotice } from "@/components/league-config-notice";
import { resolveLeagueConfig } from "@/lib/pab/resolve-league-config";
import {
  buildDynastyPickValuesReport,
  DYNASTY_PICK_HISTORY_YEARS,
  DYNASTY_PICK_POOL_SIZE,
} from "@/lib/projections/dynasty-pick-values";
import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DynastyPicksPage() {
  const config = await resolveLeagueConfig();
  const supabase = createServerClient();

  let report: Awaited<ReturnType<typeof buildDynastyPickValuesReport>> | null =
    null;
  let error: string | null = null;

  try {
    report = await buildDynastyPickValuesReport(supabase, config);
  } catch (err) {
    error =
      err instanceof Error ? err.message : "Failed to load dynasty pick values";
  }

  const yearRange =
    report && report.yearsUsed.length > 0
      ? `${report.yearsUsed[0]}–${report.yearsUsed[report.yearsUsed.length - 1]}`
      : null;

  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-950 via-zinc-950 to-black text-white">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-16">
        <header>
          <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300">
            ← Home
          </Link>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">Dynasty Picks</h1>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Rookie pick values ranked 1–{DYNASTY_PICK_POOL_SIZE}, anchored to the{" "}
            <Link href="/draft-capital" className="text-emerald-400 hover:text-emerald-300">
              draft capital
            </Link>{" "}
            table only. Each NFL class: score every drafted QB/RB/WR/TE by
            position and NFL pick on the smoothed curve, take the top{" "}
            {DYNASTY_PICK_POOL_SIZE}, then average that rank across the last{" "}
            {DYNASTY_PICK_HISTORY_YEARS} classes (current rookie class excluded).
          </p>
          <div className="mt-4">
            <LeagueConfigNotice config={config} />
          </div>
        </header>

        {report && !error ? (
          <p className="text-sm text-zinc-500">
            {report.yearsUsed.length} draft classes
            {yearRange ? ` (${yearRange})` : ""} · {report.excludedDraftYear}{" "}
            class excluded · pool size {report.poolSize}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
            {error}
          </p>
        ) : report ? (
          <DynastyPickValuesTable report={report} />
        ) : null}
      </main>
    </div>
  );
}
