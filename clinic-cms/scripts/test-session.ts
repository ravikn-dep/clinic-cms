import "./../server/_core/loadEnv";
import { COOKIE_NAME } from "../shared/const";
import { sdk } from "../server/_core/sdk";
import * as db from "../server/db";

async function main() {
  const user = await db.getUserByOpenId("local-admin-max");
  console.log("getUserByOpenId:", user?.id, user?.role);

  const token = await sdk.createSessionToken("local-admin-max", { name: "Admin" });
  const session = await sdk.verifySession(token);
  console.log("verifySession:", session);

  const authUser = await sdk.authenticateRequest({
    headers: { cookie: `${COOKIE_NAME}=${token}` },
  } as any);
  console.log("authenticateRequest:", authUser?.id, authUser?.role);
}

main().catch(console.error);
