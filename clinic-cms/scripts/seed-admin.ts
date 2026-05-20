import "dotenv/config";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";

const USERNAME = "admin@max";
const PASSWORD = "admin123";
const EMAIL = "admin@max";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required in .env");
  }

  const db = drizzle(url);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.username, USERNAME))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(users)
      .set({
        passwordHash,
        role: "admin",
        isActive: true,
        email: EMAIL,
        name: "Admin",
        loginMethod: "direct",
      })
      .where(eq(users.id, existing[0].id));

    console.log(`Updated existing admin user (id=${existing[0].id}).`);
    console.log(`Login with username: ${USERNAME}`);
    console.log(`Password: ${PASSWORD}`);
    return;
  }

  await db.insert(users).values({
    openId: `local-${USERNAME.replace(/[^a-zA-Z0-9]/g, "-")}`,
    username: USERNAME,
    email: EMAIL,
    name: "Admin",
    role: "admin",
    passwordHash,
    isActive: true,
    loginMethod: "direct",
  });

  console.log("Admin user created successfully.");
  console.log(`Login with username: ${USERNAME}`);
  console.log(`Password: ${PASSWORD}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
