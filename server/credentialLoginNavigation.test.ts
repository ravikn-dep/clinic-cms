import { describe, expect, it, vi } from "vitest";
import { confirmCredentialLoginAndNavigate } from "../client/src/lib/credentialLoginNavigation";

describe("credential post-login navigation", () => {
  it("refreshes cookie-backed auth before replacing the login route exactly once", async () => {
    const operations: string[] = [];
    const navigate = vi.fn((path: string) => operations.push(`navigate:${path}`));

    await expect(confirmCredentialLoginAndNavigate({
      refreshAuthenticatedUser: async () => {
        operations.push("refresh-auth");
        return { id: 1, role: "admin" };
      },
      navigate,
    })).resolves.toEqual({ id: 1, role: "admin" });

    expect(operations).toEqual(["refresh-auth", "navigate:/"]);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("does not route when the authenticated session cannot be confirmed", async () => {
    const navigate = vi.fn();

    await expect(confirmCredentialLoginAndNavigate({
      refreshAuthenticatedUser: async () => null,
      navigate,
    })).rejects.toThrow("Login session could not be confirmed");

    expect(navigate).not.toHaveBeenCalled();
  });
});
