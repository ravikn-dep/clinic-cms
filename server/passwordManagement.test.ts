import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 4740019,
    openId: "oauth-user",
    email: "oauth@example.com",
    name: "OAuth User",
    loginMethod: "microsoft",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("password management", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows an authenticated OAuth-only user to set an initial password", async () => {
    vi.spyOn(db, "getUserById").mockResolvedValue({ id: 4740019, passwordHash: null });
    const setUserPassword = vi.spyOn(db, "setUserPassword").mockResolvedValue();

    const result = await appRouter.createCaller(createAuthContext()).auth.setPassword({
      password: "new-secure-password",
    });

    expect(result).toEqual({ success: true });
    expect(setUserPassword).toHaveBeenCalledWith(4740019, "new-secure-password");
  });

  it("does not let an OAuth-only user use change-password as an unauthenticated set-password bypass", async () => {
    vi.spyOn(db, "getUserById").mockResolvedValue({ id: 4740019, passwordHash: null });
    const setUserPassword = vi.spyOn(db, "setUserPassword").mockResolvedValue();

    await expect(
      appRouter.createCaller(createAuthContext()).auth.changePassword({
        currentPassword: "anything",
        newPassword: "new-secure-password",
      }),
    ).rejects.toThrow("No local password is set. Use Set Password to create one.");

    expect(setUserPassword).not.toHaveBeenCalled();
  });

  it("requires and verifies the current password for a local-password user", async () => {
    vi.spyOn(db, "getUserById").mockResolvedValue({ id: 4740019, passwordHash: "stored-hash" });
    vi.spyOn(db, "verifyPassword").mockResolvedValue(true);
    const setUserPassword = vi.spyOn(db, "setUserPassword").mockResolvedValue();

    const result = await appRouter.createCaller(createAuthContext()).auth.changePassword({
      currentPassword: "current-password",
      newPassword: "new-secure-password",
    });

    expect(result).toEqual({ success: true });
    expect(setUserPassword).toHaveBeenCalledWith(4740019, "new-secure-password");
  });
});
