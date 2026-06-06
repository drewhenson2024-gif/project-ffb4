import type { ValuationRow } from "@/lib/projections/valuation-rows";
import Link from "next/link";

type ValuationsTableProps = {
  rows: ValuationRow[];
};

export function ValuationsTable({ rows }: ValuationsTableProps) {
  if (!rows.length) {
    return (
      <p className="rounded-2xl border border-white/10 bg-zinc-900/50 p-6 text-zinc-400">
        No active player projections available. Import season data or check back
        after the season starts.
      </p>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-emerald-500/20 bg-zinc-900/60 shadow-xl shadow-emerald-950/30">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-emerald-500/20 bg-emerald-500/10 text-emerald-100">
          <tr>
            <th className="px-4 py-3 font-semibold">Player</th>
            <th className="px-4 py-3 font-semibold">Pos</th>
            <th className="px-4 py-3 font-semibold">Draft</th>
            <th className="px-4 py-3 text-right font-semibold">Years</th>
            <th className="px-4 py-3 text-right font-semibold">Realized PAB</th>
            <th className="px-4 py-3 text-right font-semibold">Proj. remaining</th>
            <th className="px-4 py-3 text-right font-semibold">Total career</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.playerId}
              className="border-b border-white/5 last:border-0 hover:bg-white/5"
            >
              <td className="px-4 py-3 font-medium text-white">
                <Link
                  href={`/players/${row.playerId}`}
                  className="hover:text-emerald-300"
                >
                  {row.displayLabel}
                </Link>
              </td>
              <td className="px-4 py-3 text-zinc-300">{row.position}</td>
              <td className="px-4 py-3 text-zinc-400">{formatDraft(row)}</td>
              <td className="px-4 py-3 text-right text-zinc-400">
                {row.yearsPlayed}
              </td>
              <td className="px-4 py-3 text-right font-mono text-zinc-300">
                {row.realizedPab.toFixed(1)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-emerald-300">
                {row.projectedRemainingPab.toFixed(1)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-white">
                {row.totalCareerPab.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDraft(row: ValuationRow): string {
  if (row.isUndrafted) return "Undrafted";
  if (row.draftYear && row.draftPick) {
    return `${row.draftYear} · #${row.draftPick}`;
  }
  return "—";
}
