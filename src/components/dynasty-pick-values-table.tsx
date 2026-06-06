import type { DynastyPickValuesReport } from "@/lib/projections/dynasty-pick-values";

type DynastyPickValuesTableProps = {
  report: DynastyPickValuesReport;
};

export function DynastyPickValuesTable({ report }: DynastyPickValuesTableProps) {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-emerald-500/20 bg-zinc-900/60 shadow-xl shadow-emerald-950/30">
      <table className="w-full min-w-[360px] text-left text-sm">
        <thead className="border-b border-emerald-500/20 bg-emerald-500/10 text-emerald-100">
          <tr>
            <th className="px-4 py-3 font-semibold">Rank</th>
            <th className="px-4 py-3 font-semibold">
              Slot ({report.config.teams}-team)
            </th>
            <th className="px-4 py-3 text-right font-semibold">
              Avg draft capital
            </th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row) => (
            <tr
              key={row.rank}
              className="border-b border-white/5 last:border-0 hover:bg-white/5"
            >
              <td className="px-4 py-3 font-mono font-medium text-white">
                {row.rank}
              </td>
              <td className="px-4 py-3 font-mono text-zinc-300">
                {row.slotLabel}
              </td>
              <td className="px-4 py-3 text-right font-mono text-emerald-300">
                {row.avgCapitalValue.toFixed(1)}
                <span className="ml-1 text-xs text-zinc-500">
                  n={row.sampleYears}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
