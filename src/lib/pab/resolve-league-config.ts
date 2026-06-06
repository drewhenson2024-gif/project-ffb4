import { cookies } from "next/headers";
import { deserializeLeagueConfig, LEAGUE_CONFIG_COOKIE } from "./league-config-cookie";
import { parseLeagueConfig } from "./parse-config";
import { DEFAULT_LEAGUE_CONFIG, type LeagueConfig } from "./types";

/** URL params override cookie; cookie overrides default. Server-only. */
export async function resolveLeagueConfig(
  searchParams?: Record<string, string | string[] | undefined>,
): Promise<LeagueConfig> {
  if (searchParams && Object.keys(searchParams).length > 0) {
    return parseLeagueConfig(searchParams);
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(LEAGUE_CONFIG_COOKIE)?.value;
  if (raw) {
    return deserializeLeagueConfig(raw);
  }

  return DEFAULT_LEAGUE_CONFIG;
}
