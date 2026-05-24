import cron from "node-cron";
import { ENV } from "../_core/env";
import { getLastCompletedArchiveRun } from "./db";
import { runArchiveJob } from "./runArchive";
import { shouldRunArchive } from "./schedule";

let cronStarted = false;

export function startArchiveCron(): void {
  if (cronStarted) return;
  if (!ENV.archiveCronEnabled) {
    console.log("[Archive] Cron disabled (set ARCHIVE_CRON_ENABLED=true to enable)");
    return;
  }
  if (!ENV.isProduction) {
    console.log("[Archive] Cron skipped outside production");
    return;
  }

  cronStarted = true;

  // Daily at 02:00 UTC — run only when interval elapsed since last completed archive.
  cron.schedule("0 2 * * *", async () => {
    try {
      const lastRun = await getLastCompletedArchiveRun();
      const lastFinished = lastRun?.finishedAt ?? null;
      if (!shouldRunArchive(lastFinished, new Date(), ENV.archiveIntervalWeeks)) {
        return;
      }

      console.log("[Archive] Starting scheduled archive job");
      await runArchiveJob({ triggeredBy: "cron" });
      console.log("[Archive] Scheduled archive job completed");
    } catch (error) {
      console.error("[Archive] Scheduled archive job failed:", error);
    }
  });

  console.log(
    `[Archive] Cron registered (every day 02:00 UTC, interval ${ENV.archiveIntervalWeeks} weeks)`
  );
}
