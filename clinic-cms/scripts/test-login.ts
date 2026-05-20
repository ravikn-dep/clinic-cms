import "dotenv/config";
import * as db from "../server/db";

async function main() {
  console.log("DATABASE_URL set:", Boolean(process.env.DATABASE_URL));
  console.log("JWT_SECRET set:", Boolean(process.env.JWT_SECRET));

  const database = await db.getDb();
  console.log("getDb():", database ? "connected" : "null");

  const user = await db.findUserByCredential("admin@max");
  console.log("findUserByCredential:", user ? { id: user.id, username: user.username, hasHash: Boolean(user.passwordHash) } : null);

  const auth = await db.authenticateUser("admin@max", "admin123");
  console.log("authenticateUser:", auth);

  if (user?.passwordHash) {
    const ok = await db.verifyPassword("admin123", user.passwordHash);
    console.log("verifyPassword:", ok);
  }
}

main().catch(console.error);
