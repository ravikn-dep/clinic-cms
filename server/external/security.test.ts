import { describe, expect, it } from "vitest";
import { isExternalApiConfigured } from "./security";

describe("external API secret configuration", () => {
  it("accepts a configured active HMAC key with a 32-character-or-longer secret", () => {
    expect(isExternalApiConfigured(process.env.EXTERNAL_API_HMAC_KEYS)).toBe(true);
  });
});
