import { describe, expect, it } from "vitest";
import * as utils from "./utils";

describe("Direct login (username/password)", () => {
  it("stores staff usernames as lowercase user ids", () => {
    const userId = utils.generateUserId("consultant", 1);
    expect(userId).toBe("CONS-001");
    expect(userId.toLowerCase()).toBe("cons-001");
  });

  it("hashes and verifies passwords used for direct login", async () => {
    const password = "ClinicPass1";
    const hash = await utils.hashPassword(password);
    expect(await utils.verifyPassword(password, hash)).toBe(true);
    expect(await utils.verifyPassword("wrong", hash)).toBe(false);
  });
});
