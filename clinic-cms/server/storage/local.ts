import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { publicStorageUrl } from "./s3";

export { publicStorageUrl };

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "uploads",
);

export function resolveSafePath(key: string): string {
  const normalized = key.replace(/^\/+/, "").replace(/\.\./g, "");
  const full = path.resolve(ROOT, normalized);
  if (!full.startsWith(ROOT)) {
    throw new Error("Invalid storage key");
  }
  return full;
}

export function ensureUploadsDir(): void {
  if (!fs.existsSync(ROOT)) {
    fs.mkdirSync(ROOT, { recursive: true });
  }
}

export async function localPutObject(
  key: string,
  body: Buffer | Uint8Array | string,
): Promise<void> {
  ensureUploadsDir();
  const filePath = resolveSafePath(key);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const data =
    typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
  await fs.promises.writeFile(filePath, data);
}

export function localReadStream(key: string): fs.ReadStream {
  const filePath = resolveSafePath(key);
  return fs.createReadStream(filePath);
}

export function localFileExists(key: string): boolean {
  try {
    return fs.existsSync(resolveSafePath(key));
  } catch {
    return false;
  }
}
