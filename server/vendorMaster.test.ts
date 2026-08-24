import { beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(role: "admin" | "staff" | "consultant" | "user"): TrpcContext {
  return {
    user: {
      id: 73, openId: `vendor-${role}`, email: `${role}@example.com`, name: `${role} user`, loginMethod: "test", role,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: {} as any, res: {} as any,
  };
}

describe("Step 8 Vendor Master governance", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("allows only admins to create normalized Vendor Master records with actor audit identity", async () => {
    const create = vi.spyOn(db, "createVendorWithAudit").mockResolvedValue({ vendorId: "VENDOR-1" } as any);
    const caller = appRouter.createCaller(context("admin"));
    await expect(caller.vendorAdmin.create({ name: "Acme Pharma", gstNumber: "29ABCDE1234F1Z5" })).resolves.toMatchObject({ vendorId: "VENDOR-1" });
    expect(create).toHaveBeenCalledWith({ name: "Acme Pharma", gstNumber: "29ABCDE1234F1Z5" }, "73");
  });

  it("rejects non-admin Vendor Master writes", async () => {
    const create = vi.spyOn(db, "createVendorWithAudit");
    const caller = appRouter.createCaller(context("staff"));
    await expect(caller.vendorAdmin.create({ name: "Acme Pharma" })).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps OCR-style vendor resolution read-only and does not create a master record", async () => {
    vi.spyOn(db, "checkFeatureAccess").mockResolvedValue(true);
    vi.spyOn(db, "findActiveVendorCandidates").mockResolvedValue([]);
    const create = vi.spyOn(db, "createVendorWithAudit");
    const caller = appRouter.createCaller(context("staff"));
    await expect(caller.vendorResolution.resolve({ vendorName: "Unrecognized OCR Supplier" })).resolves.toMatchObject({ status: "UNRESOLVED" });
    expect(create).not.toHaveBeenCalled();
  });

  it("records lifecycle state changes through the server-authorized admin procedure", async () => {
    const setActive = vi.spyOn(db, "setVendorActiveWithAudit").mockResolvedValue({ vendorId: "VENDOR-1", isActive: 0 } as any);
    const caller = appRouter.createCaller(context("admin"));
    await caller.vendorAdmin.setActive({ vendorId: "VENDOR-1", active: false });
    expect(setActive).toHaveBeenCalledWith("VENDOR-1", false, "73");
  });
});
