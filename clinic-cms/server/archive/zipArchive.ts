import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// archiver v8 is CJS; use require() for Node ESM compatibility.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createArchive = require("archiver") as (format: string, options?: object) => any;
import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { storageReadBuffer } from "../storage";
import type { ArchivableFile } from "./collectFiles";

function extensionFromKey(key: string): string {
  const lastDot = key.lastIndexOf(".");
  if (lastDot === -1) return "";
  return key.slice(lastDot);
}

export interface ZipArchiveResult {
  zipPath: string;
  fileCount: number;
  skippedCount: number;
  sizeBytes: number;
}

/** Downloads archivable files from S3 or local uploads and writes a zip to the temp directory. */
export async function buildZipArchive(
  files: ArchivableFile[]
): Promise<ZipArchiveResult> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "clinic-cms-archive-"));
  const zipPath = path.join(tmpDir, "clinic-cms-archive.zip");
  const output = fs.createWriteStream(zipPath);
  const archive = createArchive("zip", { zlib: { level: 6 } });

  const archiveDone = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(output);

  let added = 0;
  let skipped = 0;

  for (const file of files) {
    try {
      const buffer = await storageReadBuffer(file.key);
      const ext = extensionFromKey(file.key);
      archive.append(Readable.from(buffer), { name: `${file.zipPath}${ext}` });
      added += 1;
    } catch {
      skipped += 1;
    }
  }

  archive.append(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        fileCount: added,
        skippedCount: skipped,
      },
      null,
      2
    ),
    { name: "manifest.json" }
  );

  await archive.finalize();
  await archiveDone;

  const stat = await fs.promises.stat(zipPath);
  return {
    zipPath,
    fileCount: added,
    skippedCount: skipped,
    sizeBytes: stat.size,
  };
}

export async function removeZipArchive(zipPath: string): Promise<void> {
  try {
    await fs.promises.unlink(zipPath);
    await fs.promises.rmdir(path.dirname(zipPath));
  } catch {
    // Best-effort cleanup of temp files.
  }
}
