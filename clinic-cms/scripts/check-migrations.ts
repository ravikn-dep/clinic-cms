import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    const [rows] = await conn.query("SELECT * FROM `__drizzle_migrations` ORDER BY id");
    console.log("Applied migrations:", rows);
  } catch (e: unknown) {
    console.log("__drizzle_migrations:", e instanceof Error ? e.message : e);
  }
  await conn.end();
}

main();
