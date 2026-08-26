import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn().mockResolvedValue(true) }));

const baseUser = {
  id: 11,
  openId: "user-management-admin",
  name: "Test Admin",
  email: "admin@example.test",
  loginMethod: "local",
  role: "admin" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
  isActive: 1,
};

const ctx = (role: "admin" | "consultant" | "staff", id = role === "admin" ? 11 : 21): TrpcContext => ({
  user: { ...baseUser, id, role },
  req: {} as any,
  res: {} as any,
});

const target = {
  id: 21,
  userId: "CONS-001",
  username: "cons-001",
  name: "Dr Test",
  email: "doctor@example.test",
  role: "consultant" as const,
  isActive: 1,
  passwordHash: "$2b$10$existing-hash",
};

describe("User Management security and lifecycle", () => {
  afterEach(() => vi.restoreAllMocks());

  it("allows an administrator to create a consultant with a server-hashed password and returns no secret", async () => {
    vi.spyOn(db, "getNextUserSequence").mockResolvedValue(1);
    vi.spyOn(db, "getUserByUsername").mockResolvedValue(null);
    vi.spyOn(db, "getUserByEmail").mockResolvedValue(null);
    const create = vi.spyOn(db, "createStaffUser").mockResolvedValue(undefined as any);
    vi.spyOn(db, "getStaffUserById").mockResolvedValue(target as any);
    const audit = vi.spyOn(db, "createAuditLog").mockResolvedValue(undefined);

    const result = await appRouter.createCaller(ctx("admin")).rbac.createStaffUser({
      role: "consultant", name: "Dr New", password: "safe-pass-123", email: "new@example.test",
    });

    expect(result).toEqual({ success: true, userId: "CONS-001", username: "cons-001" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ passwordHash: expect.any(String), role: "consultant" }));
    expect(create.mock.calls[0][0]).not.toHaveProperty("password", "safe-pass-123");
    expect(result).not.toHaveProperty("tempPassword");
    expect(result).not.toHaveProperty("qrcodeLoginUrl");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ userId: "11" }));
  });

  it("rejects non-admin user creation and client role escalation", async () => {
    await expect(appRouter.createCaller(ctx("staff")).rbac.createStaffUser({
      role: "staff", name: "Blocked", password: "safe-pass-123",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(ctx("admin")).rbac.updateStaffUser({
      userId: "CONS-001", role: "admin",
    } as any)).rejects.toThrow();
  });

  it("rejects duplicate email before creating an account", async () => {
    vi.spyOn(db, "getNextUserSequence").mockResolvedValue(2);
    vi.spyOn(db, "getUserByUsername").mockResolvedValue(null);
    vi.spyOn(db, "getUserByEmail").mockResolvedValue(target as any);
    const create = vi.spyOn(db, "createStaffUser");

    await expect(appRouter.createCaller(ctx("admin")).rbac.createStaffUser({
      role: "staff", name: "Duplicate", password: "safe-pass-123", email: "doctor@example.test",
    })).rejects.toThrow("already exists");
    expect(create).not.toHaveBeenCalled();
  });

  it("resets a target password with a bcrypt hash and an audit record that contains no secret", async () => {
    vi.spyOn(db, "getStaffUserById").mockResolvedValue(target as any);
    const update = vi.spyOn(db, "updateUserPassword").mockResolvedValue(undefined);
    const audit = vi.spyOn(db, "createAuditLog").mockResolvedValue(undefined);

    const result = await appRouter.createCaller(ctx("admin")).rbac.resetUserPassword({ userId: "CONS-001", password: "new-safe-123" });

    expect(result).toEqual({ success: true, userId: "CONS-001" });
    expect(update).toHaveBeenCalledWith(21, expect.any(String));
    expect(update.mock.calls[0][1]).not.toBe("new-safe-123");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ actionType: "USER_PASSWORD_RESET", newValue: JSON.stringify({ targetUserId: "CONS-001" }) }));
  });

  it("rejects inactive users through the alternate credential-login route", async () => {
    vi.spyOn(db, "getStaffUserByUsername").mockResolvedValue({ ...target, isActive: 0 } as any);
    vi.spyOn(db, "getStaffUserById").mockResolvedValue(null);
    await expect(appRouter.createCaller(ctx("admin")).rbac.loginWithCredentials({ userId: "CONS-001", password: "new-safe-123" })).rejects.toThrow("Invalid credentials");
  });

  it("rejects password reset for non-admins before touching the password helper", async () => {
    const update = vi.spyOn(db, "updateUserPassword");
    await expect(appRouter.createCaller(ctx("consultant")).rbac.resetUserPassword({ userId: "CONS-001", password: "new-safe-123" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses to hard-delete a user referenced by clinical, audit, or operational history", async () => {
    vi.spyOn(db, "getStaffUserById").mockResolvedValue(target as any);
    vi.spyOn(db, "getUserReferenceSummary").mockResolvedValue({ appointments: 0, consultations: 1, total: 1 } as any);
    const remove = vi.spyOn(db, "deleteStaffUser");

    await expect(appRouter.createCaller(ctx("admin")).rbac.deleteStaffUser({ userId: "CONS-001" })).rejects.toThrow("referenced");
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuses to delete the last active administrator", async () => {
    vi.spyOn(db, "getStaffUserById").mockResolvedValue({ ...target, role: "admin" } as any);
    vi.spyOn(db, "getActiveAdminCount").mockResolvedValue(1);
    const remove = vi.spyOn(db, "deleteStaffUser");
    await expect(appRouter.createCaller(ctx("admin")).rbac.deleteStaffUser({ userId: "CONS-001" })).rejects.toThrow("last active administrator");
    expect(remove).not.toHaveBeenCalled();
  });

  it("deletes only an unreferenced non-admin account and audits the deletion", async () => {
    vi.spyOn(db, "getStaffUserById").mockResolvedValue(target as any);
    vi.spyOn(db, "getUserReferenceSummary").mockResolvedValue({ total: 0 } as any);
    const remove = vi.spyOn(db, "deleteStaffUser").mockResolvedValue(undefined);
    const audit = vi.spyOn(db, "createAuditLog").mockResolvedValue(undefined);

    await expect(appRouter.createCaller(ctx("admin")).rbac.deleteStaffUser({ userId: "CONS-001" })).resolves.toEqual({ success: true });
    expect(remove).toHaveBeenCalledWith("CONS-001");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ actionType: "USER_DELETED", recordId: "21" }));
  });

  it("does not invoke clinical, procurement, receipt, or inventory mutations", async () => {
    const clinical = vi.spyOn(db, "createConsultation");
    const po = vi.spyOn(db, "createPurchaseOrderWithItemsAndExtractionReview");
    const receipt = vi.spyOn(db, "createGoodsReceipt");
    const inventory = vi.spyOn(db, "updateInventoryItem");
    vi.spyOn(db, "getStaffUserById").mockResolvedValue(target as any);
    vi.spyOn(db, "updateUserPassword").mockResolvedValue(undefined);

    await appRouter.createCaller(ctx("admin")).rbac.resetUserPassword({ userId: "CONS-001", password: "new-safe-123" });
    expect(clinical).not.toHaveBeenCalled();
    expect(po).not.toHaveBeenCalled();
    expect(receipt).not.toHaveBeenCalled();
    expect(inventory).not.toHaveBeenCalled();
  });
});
