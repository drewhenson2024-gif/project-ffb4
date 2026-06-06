/** NFL season age as of Sept 1 (approximate season start). */
export function ageAtSeason(
  birthDate: string | Date,
  seasonYear: number,
): number {
  const birth =
    typeof birthDate === "string" ? parseBirthDate(birthDate) : birthDate;
  const birthYear = birth.getUTCFullYear();
  const birthMonth = birth.getUTCMonth();
  const birthDay = birth.getUTCDate();

  let age = seasonYear - birthYear;
  const seasonStartMonth = 8; // September (0-indexed)
  const seasonStartDay = 1;

  if (
    birthMonth > seasonStartMonth ||
    (birthMonth === seasonStartMonth && birthDay > seasonStartDay)
  ) {
    age -= 1;
  }

  return age;
}

export function parseBirthDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function isValidBirthDate(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const parsed = parseBirthDate(value.trim());
  return Number.isFinite(parsed.getTime());
}
