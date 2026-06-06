import {
  DRAFT_BUCKET_LABELS,
  DRAFT_BUCKET_ORDER,
  type DraftBucket,
} from "@/lib/projections/draft-buckets";
import type { DraftCapitalReport } from "@/lib/projections/draft-capital";
import type { Position } from "@/types/database";

const POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

type DraftCapitalTableProps = {
  report: DraftCapitalReport;
};

export function DraftCapitalTable({ report }: DraftCapitalTableProps) {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-emerald-500/20 bg-zinc-900/60 shadow-xl shadow-emerald-950/30">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-emerald-500/20 bg-emerald-500/10 text-emerald-100">
          <tr>
            <th className="px-4 py-3 font-semibold">Draft segment</th>
            {POSITIONS.map((position) => (
              <th key={position} className="px-4 py-3 text-right font-semibold">
                {position}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DRAFT_BUCKET_ORDER.map((bucket) => (
            <tr
              key={bucket}
              className="border-b border-white/5 last:border-0 hover:bg-white/5"
            >
              <td className="px-4 py-3 font-medium text-white">
                {DRAFT_BUCKET_LABELS[bucket]}
              </td>
              {POSITIONS.map((position) => (
                <td key={position} className="px-4 py-3 text-right">
                  <Cell
                    smoothed={report.cells[bucket as DraftBucket][position]}
                    raw={report.rawCells[bucket as DraftBucket][position]}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  smoothed,
  raw,
}: {
  smoothed: { avgPab: number; count: number };
  raw: { avgPab: number; count: number };
}) {
  if (smoothed.count === 0 && raw.count === 0) {
    return <span className="text-zinc-600">—</span>;
  }

  const delta = smoothed.avgPab - raw.avgPab;
  const showDelta = raw.count > 0 && Math.abs(delta) >= 0.5;

  return (
    <span className="font-mono text-emerald-300">
      {smoothed.avgPab.toFixed(1)}
      {raw.count > 0 ? (
        <span className="ml-1 text-xs text-zinc-500">n={raw.count}</span>
      ) : null}
      {showDelta ? (
        <span className="ml-1 text-xs text-zinc-600">
          ({delta > 0 ? "+" : ""}
          {delta.toFixed(1)} raw)
        </span>
      ) : null}
    </span>
  );
}
