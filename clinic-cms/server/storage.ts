import fs from "fs";
import {
  isS3Configured,
  publicStorageUrl,
  s3GetPresignedUrl,
  s3PutObject,
} from "./storage/s3";
import {
  localFileExists,
  localPutObject,
  resolveSafePath,
} from "./storage/local";

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));

  if (isS3Configured()) {
    await s3PutObject(key, data, contentType);
    return { key, url: publicStorageUrl(key) };
  }

  await localPutObject(key, data);
  return { key, url: publicStorageUrl(key) };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: publicStorageUrl(key) };
}

/** Presigned S3 URL, or same-origin /files path for local disk storage. */
export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  if (isS3Configured()) {
    return s3GetPresignedUrl(key);
  }
  return publicStorageUrl(key);
}

export async function storageReadBuffer(relKey: string): Promise<Buffer> {
  const key = normalizeKey(relKey);
  if (isS3Configured()) {
    const url = await s3GetPresignedUrl(key);
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Storage download failed (${resp.status})`);
    }
    return Buffer.from(await resp.arrayBuffer());
  }
  if (!localFileExists(key)) {
    throw new Error("File not found in local uploads");
  }
  return fs.promises.readFile(resolveSafePath(key));
}
