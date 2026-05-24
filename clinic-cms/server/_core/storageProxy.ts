import type { Express, Request, Response } from "express";
import { isS3Configured, s3GetPresignedUrl } from "../storage/s3";
import { localFileExists, localReadStream } from "../storage/local";

const LEGACY_PREFIX = "/manus-storage";
const PUBLIC_PREFIX = "/files";

async function serveStorageKey(key: string, res: Response): Promise<void> {
  if (!key) {
    res.status(400).send("Missing storage key");
    return;
  }

  if (isS3Configured()) {
    try {
      const url = await s3GetPresignedUrl(key);
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
      return;
    } catch (err) {
      console.error("[StorageProxy] S3 presign failed:", err);
      res.status(502).send("Storage backend error");
      return;
    }
  }

  if (!localFileExists(key)) {
    res.status(404).send("File not found");
    return;
  }

  res.set("Cache-Control", "private, max-age=3600");
  localReadStream(key).pipe(res);
}

function keyFromRequest(req: Request): string | undefined {
  const params = req.params as Record<string, string>;
  return params["0"]?.replace(/^\/+/, "");
}

export function registerStorageProxy(app: Express) {
  const handler = async (req: Request, res: Response) => {
    await serveStorageKey(keyFromRequest(req) ?? "", res);
  };

  app.get(`${PUBLIC_PREFIX}/*`, handler);
  // Legacy Manus-hosted URLs stored in the database still work.
  app.get(`${LEGACY_PREFIX}/*`, handler);
}
