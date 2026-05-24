export const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns true when an archive job should run: no prior successful run,
 * or at least `intervalWeeks` have elapsed since the last finished run.
 */
export function shouldRunArchive(
  lastFinishedAt: Date | null | undefined,
  now: Date,
  intervalWeeks: number
): boolean {
  if (!lastFinishedAt) return true;
  const elapsedMs = now.getTime() - lastFinishedAt.getTime();
  return elapsedMs >= intervalWeeks * MS_PER_WEEK;
}
