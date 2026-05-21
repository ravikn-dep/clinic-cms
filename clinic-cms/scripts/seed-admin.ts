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

  const byUsername = await db
    .select()
    .from(users)
    .where(eq(users.username, USERNAME))
    .limit(1);

  const admins = await db.select().from(users).where(eq(users.role, "admin"));
  const target = byUsername[0] ?? admins.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))[0];

  if (target) {
    await db
      .update(users)
      .set({
        passwordHash,
        role: "admin",
        isActive: true,
        username: target.username ?? USERNAME,
        loginMethod: target.loginMethod ?? "direct",
      })
      .where(eq(users.id, target.id));

    console.log(`Updated admin user (id=${target.id}, username=${target.username ?? USERNAME}).`);
    console.log(`Login with: ${USERNAME} or ${target.username ?? USERNAME}`);
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
