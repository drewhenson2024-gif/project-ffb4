import { LeagueConfigForm } from "@/components/league-config-form";
import { PabResults } from "@/components/pab-results";
import { computePabRates } from "@/lib/pab/compute-pab";
import { resolveLeagueConfig } from "@/lib/pab/resolve-league-config";
import { loadPabSeasons } from "@/lib/pab/season-data";
import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";

type PabPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PabPage({ searchParams }: PabPageProps) {
  const params = await searchParams;
  const config = await resolveLeagueConfig(params);

  const supabase = createServerClient();
  let years: number[] = [];
  let seasons: Awaited<ReturnType<typeof loadPabSeasons>>["seasons"] = [];
  let error: Error | null = null;

  try {
    const loaded = await loadPabSeasons(supabase);
    years = loaded.years;
    seasons = loaded.seasons;
  } catch (err) {
    error = err instanceof Error ? err : new Error("Failed to load season data");
  }

  const pabRates =
    seasons.length > 0 && years.length > 0
      ? computePabRates(config, seasons, years)
      : null;

  return (
    <div className="min-h-full bg-gradient-to-b from-emerald-950 via-zinc-950 to-black text-white">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-16">
        <header>
          <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300">
            ← Home
          </Link>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">PAB Calculations</h1>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Season tier thresholds from your league size and roster construction.
            PAB rates use the last six seasons of database history — no projections.
          </p>
        </header>

        <LeagueConfigForm config={config} />

        {error ? (
          <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
            Could not load season data: {error.message}
          </p>
        ) : pabRates ? (
          <PabResults
            config={config}
            years={pabRates.years}
            positions={pabRates.positions}
          />
        ) : (
          <p className="text-zinc-400">Import season data to calculate PAB rates.</p>
        )}
      </main>
    </div>
  );
}
