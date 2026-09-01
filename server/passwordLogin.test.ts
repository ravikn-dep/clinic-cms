import { describe, expect, it } from "vitest";
import { getPasswordLoginErrorMessage } from "../client/src/lib/passwordLogin";

describe("password login feedback", () => {
  it("guides OAuth users when credential login rejects an account", () => {
    expect(getPasswordLoginErrorMessage("Invalid email or password")).toContain("Continue with Microsoft");
  });

  it("keeps unexpected failures visible with a safe fallback", () => {
    expect(getPasswordLoginErrorMessage("Temporary login service error")).toBe("Temporary login service error");
    expect(getPasswordLoginErrorMessage()).toBe("Login failed. Please try again.");
  });
});
