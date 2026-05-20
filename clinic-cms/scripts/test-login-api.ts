import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env") });

import { appRouter } from "../server/routers";
import { COOKIE_NAME } from "../shared/const";

async function main() {
  const cookies: Record<string, string> = {};
  const req = {
    protocol: "http",
    hostname: "localhost",
    headers: {},
  } as any;
  const res = {
    cookie: (name: string, value: string) => {
      cookies[name] = value;
    },
    clearCookie: () => {},
  } as any;

  const caller = appRouter.createCaller({ req, res, user: null });

  try {
    const result = await caller.auth.loginWithPassword({
      username: "admin@max",
      password: "admin123",
    });
    console.log("loginWithPassword:", result);
    console.log("cookie set:", Boolean(cookies[COOKIE_NAME]));

    const me = await appRouter.createCaller({
      req: { ...req, headers: { cookie: `${COOKIE_NAME}=${cookies[COOKIE_NAME]}` } },
      res,
      user: null,
    }).auth.me();
    console.log("auth.me after login:", me);
  } catch (e) {
    console.error("FAILED:", e);
  }
}

main();
