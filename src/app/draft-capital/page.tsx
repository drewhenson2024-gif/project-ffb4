import { DraftCapitalTable } from "@/components/draft-capital-table";
import { LeagueConfigNotice } from "@/components/league-config-notice";
import { resolveLeagueConfig } from "@/lib/pab/resolve-league-config";
import { buildDraftCapitalReport } from "@/lib/projections/draft-capital";
import { formatLogDraftCapitalModel } from "@/lib/projections/draft-capital-smooth";
import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DraftCapitalPage() {
  const config = await resolveLeagueConfig();
  const supabase = createServerClient();

  let report: Awaited<ReturnType<typeof buildDraftCapitalReport>> | null = null;
  let error: string | null = null;

  try {
    report = await buildDraftCapitalReport(supabase, config);
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load draft capital data";
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-950 via-zinc-950 to-black text-white">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16">
        <header>
          <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300">
            ← Home
          </Link>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">Draft Capital</h1>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Average total career PAB by draft segment and position. Each position
            uses its own logarithmic per-pick curve (V = a − b·ln pick), fit to
            that position&apos;s cohort and averaged within each segment (FF 1.0
            DraftPickValue). Cohort: drafted 2000+, undrafted debuts 2000+. Raw
            in parentheses when they differ.
          </p>
          <div className="mt-4">
            <LeagueConfigNotice config={config} />
          </div>
        </header>

        {report && !error ? (
          <>
            <p className="text-sm text-zinc-500">
              {report.cohortSize} players in cohort · {report.skippedRookies}{" "}
              current rookies skipped · round 8+ picks excluded
            </p>
            <div className="grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
              {(["QB", "RB", "WR", "TE"] as const).map((position) => {
                const model = report.models[position];
                return (
                  <p key={position}>
                    <span className="font-medium text-zinc-400">{position}:</span>{" "}
                    V(p) = {formatLogDraftCapitalModel(model)}
                  </p>
                );
              })}
            </div>
          </>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
            {error}
          </p>
        ) : report ? (
          <DraftCapitalTable report={report} />
        ) : null}
      </main>
    </div>
  );
}
