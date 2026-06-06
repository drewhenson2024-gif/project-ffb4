export const CAREER_GAP_YEARS = 2;

export function getCurrentSeason(maxSeasonYear: number): number {
  return maxSeasonYear;
}

export function isCareerComplete(
  lastSeason: number | null,
  hasRecentStats: boolean,
  currentSeason: number,
): boolean {
  if (lastSeason === null) return false;
  return (
    !hasRecentStats || lastSeason <= currentSeason - CAREER_GAP_YEARS
  );
}

export function recentSeasonYears(currentSeason: number): number[] {
  return [currentSeason, currentSeason - 1];
}

export function isCurrentRookie(
  seasonsPlayed: number,
  firstSeason: number | null,
  lastSeason: number | null,
  currentSeason: number,
): boolean {
  if (seasonsPlayed === 0) return true;
  return (
    firstSeason === currentSeason &&
    lastSeason === currentSeason &&
    seasonsPlayed <= 1
  );
}
