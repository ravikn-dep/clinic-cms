import { nanoid } from "nanoid";
import { ENV } from "../_core/env";
import { collectArchivableFiles } from "./collectFiles";
import {
  createArchiveRun,
  getRunningArchiveRun,
  updateArchiveRun,
} from "./db";
import { getGoogleDriveConnectionStatus, uploadArchiveToDrive } from "./googleDrive";
import { buildZipArchive, removeZipArchive } from "./zipArchive";

export interface RunArchiveOptions {
  triggeredBy: string;
}

export interface RunArchiveResult {
  runId: string;
  fileCount: number;
  archiveSizeBytes: number;
  driveFileId: string;
  driveFolderId: string;
}

function formatArchiveLabel(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `Clinic-CMS-Archive-${yyyy}-${mm}-${dd}`;
}

export async function runArchiveJob(
  options: RunArchiveOptions
): Promise<RunArchiveResult> {
  const existing = await getRunningArchiveRun();
  if (existing) {
    throw new Error("An archive job is already running");
  }

  const driveStatus = await getGoogleDriveConnectionStatus();
  if (!driveStatus.connected) {
    throw new Error("Google Drive is not connected");
  }

  const runId = `AR-${nanoid(12)}`;
  await createArchiveRun({
    runId,
    status: "running",
    triggeredBy: options.triggeredBy,
  });

  let zipPath: string | null = null;

  try {
    const files = await collectArchivableFiles();
    const zipResult = await buildZipArchive(files);
    zipPath = zipResult.zipPath;

    const label = formatArchiveLabel(new Date());
    const upload = await uploadArchiveToDrive(zipResult.zipPath, label);

    await updateArchiveRun(runId, {
      status: "completed",
      finishedAt: new Date(),
      fileCount: zipResult.fileCount,
      archiveSizeBytes: zipResult.sizeBytes,
      driveFileId: upload.driveFileId,
      driveFolderId: upload.driveFolderId,
    });

    return {
      runId,
      fileCount: zipResult.fileCount,
      archiveSizeBytes: zipResult.sizeBytes,
      driveFileId: upload.driveFileId,
      driveFolderId: upload.driveFolderId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Archive failed";
    await updateArchiveRun(runId, {
      status: "failed",
      finishedAt: new Date(),
      error: message,
    });
    throw error;
  } finally {
    if (zipPath) {
      await removeZipArchive(zipPath);
    }
  }
}

export function getArchiveConfigSummary() {
  return {
    cronEnabled: ENV.archiveCronEnabled,
    intervalWeeks: ENV.archiveIntervalWeeks,
    googleDriveConfigured: Boolean(
      ENV.googleDriveClientId && ENV.googleDriveClientSecret
    ),
  };
}
