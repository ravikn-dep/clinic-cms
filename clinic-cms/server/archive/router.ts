import { SignJWT, jwtVerify } from "jose";
import { nanoid } from "nanoid";
import { z } from "zod";
import { ENV } from "../_core/env";
import { adminProcedure, router } from "../_core/trpc";
import {
  getLastCompletedArchiveRun,
  getRunningArchiveRun,
  listArchiveRuns,
} from "./db";
import {
  disconnectGoogleDrive,
  exchangeOAuthCode,
  getGoogleAuthUrl,
  getGoogleDriveConnectionStatus,
  isGoogleDriveConfigured,
} from "./googleDrive";
import { getArchiveConfigSummary, runArchiveJob } from "./runArchive";
import { shouldRunArchive } from "./schedule";

function getStateSecret(): Uint8Array {
  const secret = ENV.cookieSecret || "clinic-cms-archive-state";
  return new TextEncoder().encode(secret);
}

async function createOAuthState(adminUserId: number): Promise<string> {
  return new SignJWT({ adminUserId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("15m")
    .setJti(nanoid(8))
    .sign(getStateSecret());
}

async function verifyOAuthState(state: string): Promise<number> {
  const { payload } = await jwtVerify(state, getStateSecret());
  const adminUserId = payload.adminUserId;
  if (typeof adminUserId !== "number") {
    throw new Error("Invalid OAuth state");
  }
  return adminUserId;
}

export async function handleArchiveOAuthCallback(
  code: string,
  state: string
): Promise<{ connectedEmail: string | null }> {
  await verifyOAuthState(state);
  return exchangeOAuthCode(code);
}

export const archiveRouter = router({
  getStatus: adminProcedure.query(async () => {
    const lastCompleted = await getLastCompletedArchiveRun();
    const running = await getRunningArchiveRun();
    const drive = await getGoogleDriveConnectionStatus();
    const config = getArchiveConfigSummary();

    const nextDue =
      lastCompleted?.finishedAt && config.intervalWeeks
        ? new Date(
            lastCompleted.finishedAt.getTime() +
              config.intervalWeeks * 7 * 24 * 60 * 60 * 1000
          )
        : null;

    return {
      ...config,
      googleDriveConnected: drive.connected,
      connectedEmail: drive.connectedEmail,
      driveFolderId: drive.driveFolderId,
      lastRun: lastCompleted,
      runningRun: running,
      nextDueAt: nextDue,
      dueNow: shouldRunArchive(
        lastCompleted?.finishedAt ?? null,
        new Date(),
        config.intervalWeeks
      ),
    };
  }),

  listRuns: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).optional() }).optional())
    .query(async ({ input }) => {
      return listArchiveRuns(input?.limit ?? 20);
    }),

  getGoogleAuthUrl: adminProcedure.mutation(async ({ ctx }) => {
    if (!isGoogleDriveConfigured()) {
      throw new Error(
        "Google Drive OAuth env vars are missing. See docs/ARCHIVE_GOOGLE_DRIVE.md"
      );
    }
    const state = await createOAuthState(ctx.user.id);
    return { url: getGoogleAuthUrl(state) };
  }),

  disconnectGoogleDrive: adminProcedure.mutation(async () => {
    await disconnectGoogleDrive();
    return { success: true };
  }),

  runNow: adminProcedure.mutation(async ({ ctx }) => {
    const result = await runArchiveJob({
      triggeredBy: `admin:${ctx.user.id}`,
    });
    return { success: true, ...result };
  }),
});
