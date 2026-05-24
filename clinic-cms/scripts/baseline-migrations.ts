/**
 * Applies pending Drizzle migrations when schema was partially updated via db:ensure-schema.
 * Skips duplicate table/column/index errors, then records migration hashes.
 */
import "dotenv/config";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const journal = JSON.parse(
  fs.readFileSync(path.join(ROOT, "drizzle/meta/_journal.json"), "utf8")
) as { entries: Array<{ idx: number; tag: string; when: number }> };

function isIgnorableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  const msg = String((err as { sqlMessage?: string }).sqlMessage ?? (err as Error).message ?? "");
  return (
    code === "ER_TABLE_EXISTS_ERROR" ||
    code === "ER_DUP_FIELDNAME" ||
    code === "ER_DUP_KEYNAME" ||
    /already exists/i.test(msg) ||
    /Duplicate column/i.test(msg) ||
    /Duplicate key name/i.test(msg)
  );
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");

  const conn = await mysql.createConnection(url);
  const [applied] = await conn.query<mysql.RowDataPacket[]>(
    "SELECT hash FROM `__drizzle_migrations`"
  );
  const appliedHashes = new Set(applied.map((r) => r.hash as string));

  let recorded = 0;

  for (const entry of journal.entries) {
    const filePath = path.join(ROOT, `drizzle/${entry.tag}.sql`);
    if (!fs.existsSync(filePath)) {
      console.warn(`[baseline] Skip missing file ${entry.tag}.sql`);
      continue;
    }

    const sql = fs.readFileSync(filePath, "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");

    if (appliedHashes.has(hash)) {
      continue;
    }

    console.log(`[baseline] Applying ${entry.tag}...`);
    const statements = sql
      .split(/--> statement-breakpoint/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      try {
        await conn.query(stmt);
      } catch (error) {
        if (!isIgnorableError(error)) {
          console.error(`[baseline] Failed in ${entry.tag}:`, stmt.slice(0, 80));
          throw error;
        }
      }
    }

    await conn.query(
      "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
      [hash, entry.when]
    );
    appliedHashes.add(hash);
    recorded += 1;
    console.log(`[baseline] Recorded ${entry.tag}`);
  }

  await conn.end();
  console.log(`[baseline] Done. New migrations recorded: ${recorded}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
