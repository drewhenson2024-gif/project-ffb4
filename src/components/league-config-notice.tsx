import { formatLeagueConfigSummary } from "@/lib/pab/parse-config";
import type { LeagueConfig } from "@/lib/pab/types";
import Link from "next/link";

type LeagueConfigNoticeProps = {
  config: LeagueConfig;
};

export function LeagueConfigNotice({ config }: LeagueConfigNoticeProps) {
  return (
    <p className="text-sm text-zinc-500">
      League settings:{" "}
      <span className="text-zinc-400">{formatLeagueConfigSummary(config)}</span>
      {" · "}
      <Link href="/pab" className="text-emerald-400 hover:text-emerald-300">
        Change on PAB page
      </Link>
    </p>
  );
}
