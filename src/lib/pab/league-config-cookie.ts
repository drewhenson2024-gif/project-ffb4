import type { LeagueConfig } from "./types";
import { configToSearchParams, parseLeagueConfig } from "./parse-config";

export const LEAGUE_CONFIG_COOKIE = "ffb4_league_config";

export function serializeLeagueConfig(config: LeagueConfig): string {
  return configToSearchParams(config).toString();
}

export function deserializeLeagueConfig(raw: string): LeagueConfig {
  const params = Object.fromEntries(new URLSearchParams(raw).entries());
  return parseLeagueConfig(params);
}
