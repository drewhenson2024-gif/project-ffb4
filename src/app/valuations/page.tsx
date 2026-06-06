import { LeagueConfigNotice } from "@/components/league-config-notice";
import { ValuationsTable } from "@/components/valuations-table";
import { resolveLeagueConfig } from "@/lib/pab/resolve-league-config";
import { loadValuationRows } from "@/lib/projections/valuation-rows";
import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function ValuationsPage() {
  const config = await resolveLeagueConfig();
  const supabase = createServerClient();

  let rows: Awaited<ReturnType<typeof loadValuationRows>>["rows"] = [];
  let summary: Awaited<ReturnType<typeof loadValuationRows>>["summary"] | null =
    null;
  let error: string | null = null;

  try {
    const result = await loadValuationRows(supabase, config);
    rows = result.rows;
    summary = result.summary;
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load valuations";
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-950 via-zinc-950 to-black text-white">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-16">
        <header>
          <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300">
            ← Home
          </Link>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">
            Active Player Valuations
          </h1>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Projected remaining career PAB for every active NFL player (current-year
            rookies excluded). Sorted by projected remaining value.
          </p>
          <div className="mt-4">
            <LeagueConfigNotice config={config} />
          </div>
        </header>

        {summary && !error ? (
          <p className="text-sm text-zinc-500">
            {summary.activeProjected} active players projected ·{" "}
            {summary.skippedRookies} current rookies skipped
          </p>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
            {error}
          </p>
        ) : (
          <ValuationsTable rows={rows} />
        )}
      </main>
    </div>
  );
}
