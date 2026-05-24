import { desc, eq } from "drizzle-orm";
import {
  archiveRuns,
  bills,
  consultations,
  googleDriveTokens,
  patients,
  users,
  type ArchiveRun,
  type GoogleDriveToken,
  type InsertArchiveRun,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { encryptToken } from "./tokenCrypto";

const GOOGLE_DRIVE_ROW_ID = "default";

export async function getLastCompletedArchiveRun(): Promise<ArchiveRun | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(archiveRuns)
    .where(eq(archiveRuns.status, "completed"))
    .orderBy(desc(archiveRuns.finishedAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function getRunningArchiveRun(): Promise<ArchiveRun | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(archiveRuns)
    .where(eq(archiveRuns.status, "running"))
    .orderBy(desc(archiveRuns.startedAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function createArchiveRun(
  run: InsertArchiveRun
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(archiveRuns).values(run);
}

export async function updateArchiveRun(
  runId: string,
  updates: Partial<
    Pick<
      ArchiveRun,
      | "status"
      | "finishedAt"
      | "fileCount"
      | "archiveSizeBytes"
      | "driveFileId"
      | "driveFolderId"
      | "error"
    >
  >
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(archiveRuns).set(updates).where(eq(archiveRuns.runId, runId));
}

export async function listArchiveRuns(limit = 20): Promise<ArchiveRun[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(archiveRuns)
    .orderBy(desc(archiveRuns.startedAt))
    .limit(limit);
}

export async function getGoogleDriveTokens(): Promise<GoogleDriveToken | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(googleDriveTokens)
    .where(eq(googleDriveTokens.id, GOOGLE_DRIVE_ROW_ID))
    .limit(1);

  return rows[0] ?? null;
}

export async function saveGoogleDriveTokens(input: {
  accessToken: string;
  refreshToken: string;
  expiryDate?: Date | null;
  connectedEmail?: string | null;
  driveFolderId?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const values = {
    id: GOOGLE_DRIVE_ROW_ID,
    accessTokenEnc: encryptToken(input.accessToken),
    refreshTokenEnc: encryptToken(input.refreshToken),
    expiryDate: input.expiryDate ?? null,
    connectedEmail: input.connectedEmail ?? null,
    driveFolderId: input.driveFolderId ?? null,
  };

  const existing = await getGoogleDriveTokens();
  if (existing) {
    await db
      .update(googleDriveTokens)
      .set(values)
      .where(eq(googleDriveTokens.id, GOOGLE_DRIVE_ROW_ID));
  } else {
    await db.insert(googleDriveTokens).values(values);
  }
}

export async function updateGoogleDriveAccessToken(input: {
  accessToken: string;
  expiryDate?: Date | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(googleDriveTokens)
    .set({
      accessTokenEnc: encryptToken(input.accessToken),
      expiryDate: input.expiryDate ?? null,
    })
    .where(eq(googleDriveTokens.id, GOOGLE_DRIVE_ROW_ID));
}

export async function deleteGoogleDriveTokens(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(googleDriveTokens)
    .where(eq(googleDriveTokens.id, GOOGLE_DRIVE_ROW_ID));
}
