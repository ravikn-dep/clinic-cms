import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { storeConsultantImage } from "./consultantAssets";

vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn().mockResolvedValue(true) }));
vi.mock("./consultantAssets", () => ({
  storeConsultantImage: vi.fn(),
  validateConsultantImageDataUrl: vi.fn(),
}));

const user = { id: 11, openId: "asset-admin", name: "Admin", email: "admin@example.test", loginMethod: "local", role: "admin" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), isActive: 1 };
const context = (role: "admin" | "staff"): TrpcContext => ({ user: { ...user, role }, req: {} as any, res: {} as any });
const consultant = { id: 21, userId: "CONS-001", name: "Dr Consultant", role: "consultant", isActive: 1 };

describe("consultant asset upload contract", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns canonical metadata only after persisting the selected asset reference", async () => {
    vi.mocked(storeConsultantImage).mockResolvedValue({ key: "consultants/21/logo_abc.png", url: "/manus-storage/consultants/21/logo_abc.png", mimeType: "image/png", sizeBytes: 94_000 });
    vi.spyOn(db, "getConsultantProfileById").mockResolvedValue(consultant as any);
    const update = vi.spyOn(db, "updateConsultantProfileById").mockResolvedValue(undefined);
    const audit = vi.spyOn(db, "createAuditLog").mockResolvedValue(undefined);

    const result = await appRouter.createCaller(context("admin")).consultants.uploadAsset({ consultantId: 21, assetType: "logo", dataUrl: "data:image/png;base64,validated" });

    expect(result).toEqual({ success: true, asset: { key: "consultants/21/logo_abc.png", url: "/manus-storage/consultants/21/logo_abc.png", mimeType: "image/png", sizeBytes: 94_000 } });
    expect(update).toHaveBeenCalledWith(21, { consultantLogoKey: "consultants/21/logo_abc.png" });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ actionType: "CONSULTANT_LOGO_UPDATED", recordId: "21" }));
  });

  it("rejects unauthorized asset uploads before storage or persistence", async () => {
    const storage = vi.mocked(storeConsultantImage);
    const update = vi.spyOn(db, "updateConsultantProfileById");
    await expect(appRouter.createCaller(context("staff")).consultants.uploadAsset({ consultantId: 21, assetType: "logo", dataUrl: "data:image/png;base64,validated" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storage).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("exposes persisted preview URLs through the admin staff query without exposing storage keys", async () => {
    vi.spyOn(db, "getAllStaffUsers").mockResolvedValue([{ ...consultant, consultantLogoKey: "consultants/21/logo_abc.png", signatureKey: null } as any]);
    const result = await appRouter.createCaller(context("admin")).rbac.listStaffUsers();
    expect(result[0]).toMatchObject({ consultantLogoUrl: "/manus-storage/consultants/21/logo_abc.png", signatureUrl: null });
    expect(result[0]).not.toHaveProperty("consultantLogoKey");
  });
});
