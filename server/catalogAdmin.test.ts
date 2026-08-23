import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { suggestCatalogMatches } from "./catalogMatching/matcher";

const adminContext: TrpcContext = {
  user: {
    id: 41,
    openId: "catalog-admin",
    name: "Catalog Admin",
    email: "catalog.admin@example.test",
    loginMethod: "local",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  req: {} as any,
  res: {} as any,
};

const staffContext: TrpcContext = {
  ...adminContext,
  user: { ...adminContext.user!, id: 42, openId: "catalog-staff", role: "staff" },
};

const activeItem = {
  catalogItemId: "catalog-paracetamol-650",
  canonicalName: "Paracetamol 650 mg Tablet",
  normalizedName: "paracetamol 650 mg tablet",
  genericName: "Paracetamol",
  brandName: "Dolo 650",
  strength: "650 mg",
  dosageForm: "Tablet",
  manufacturer: null,
  hsnCode: "30049099",
  gstRate: "12.00",
  active: 1,
};

const activeAlias = {
  aliasId: "alias-dolo-650",
  catalogItemId: activeItem.catalogItemId,
  vendorId: "",
  aliasText: "DOLO 650 TAB",
  normalizedAlias: "dolo 650 tablet",
  source: "MANUAL_CURATED",
  active: 1,
  createdBy: "41",
};

const createItemInput = {
  canonicalName: "Paracetamol 650 mg Tablet",
  genericName: "Paracetamol",
  brandName: "Dolo 650",
  strength: "650 mg",
  dosageForm: "Tablet",
  manufacturer: null,
  hsnCode: "30049099",
  gstRate: 12,
};

function mockNoBusinessWrites() {
  return {
    po: vi.spyOn(db, "createPurchaseOrderWithItemsAndExtractionReview"),
    receipt: vi.spyOn(db, "createGoodsReceipt"),
    inventory: vi.spyOn(db, "updateInventoryItem"),
  };
}

function expectNoBusinessWrites(spies: ReturnType<typeof mockNoBusinessWrites>) {
  expect(spies.po).not.toHaveBeenCalled();
  expect(spies.receipt).not.toHaveBeenCalled();
  expect(spies.inventory).not.toHaveBeenCalled();
}

describe("Phase 3 Step 7: governed catalog administration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("allows an admin to create an explicitly curated catalog item with server-derived normalization and an actor-attributed audit event", async () => {
    vi.spyOn(db, "getCatalogItemByNormalizedName").mockResolvedValue(null);
    const createSpy = vi.spyOn(db, "createCatalogItemWithAudit").mockResolvedValue(undefined as never);
    const writes = mockNoBusinessWrites();

    const result = await appRouter.createCaller(adminContext).catalogAdmin.createItem(createItemInput);
    const [item, audit] = createSpy.mock.calls[0];

    expect(result.normalizedName).toBe("paracetamol 650 mg tablet");
    expect(item).toMatchObject({
      canonicalName: "Paracetamol 650 mg Tablet",
      normalizedName: "paracetamol 650 mg tablet",
      strength: "650 mg",
      dosageForm: "Tablet",
    });
    expect(audit).toMatchObject({
      actionType: "CATALOG_ITEM_CREATED",
      tableName: "catalogItems",
      userId: "41",
      recordId: item.catalogItemId,
    });
    expect(audit.newValue).toContain("paracetamol 650 mg tablet");
    expectNoBusinessWrites(writes);
  });

  it("rejects a duplicate normalized canonical identity and retains clinically distinct strength values", async () => {
    vi.spyOn(db, "getCatalogItemByNormalizedName").mockResolvedValue(activeItem as any);
    const createSpy = vi.spyOn(db, "createCatalogItemWithAudit");
    const caller = appRouter.createCaller(adminContext);

    await expect(caller.catalogAdmin.createItem(createItemInput)).rejects.toThrow("same normalized name");
    expect(createSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    vi.spyOn(db, "getCatalogItemByNormalizedName").mockResolvedValue(null);
    const distinctCreate = vi.spyOn(db, "createCatalogItemWithAudit").mockResolvedValue(undefined as never);
    await caller.catalogAdmin.createItem({ ...createItemInput, canonicalName: "Paracetamol 500 mg Tablet", strength: "500 mg" });
    expect(distinctCreate.mock.calls[0][0]).toMatchObject({ normalizedName: "paracetamol 500 mg tablet", strength: "500 mg" });
  });

  it("updates catalog metadata without rewriting PO descriptions, immutable review evidence, receipts, inventory, or stock boundaries", async () => {
    vi.spyOn(db, "getCatalogItemById").mockResolvedValue(activeItem as any);
    vi.spyOn(db, "getCatalogItemByNormalizedName").mockResolvedValue(activeItem as any);
    const updateSpy = vi.spyOn(db, "updateCatalogItemWithAudit").mockResolvedValue(undefined);
    const writes = mockNoBusinessWrites();

    const result = await appRouter.createCaller(adminContext).catalogAdmin.updateItem({
      catalogItemId: activeItem.catalogItemId,
      updates: { manufacturer: "Curated Pharma" },
    });

    expect(result.catalogItemId).toBe(activeItem.catalogItemId);
    expect(updateSpy.mock.calls[0][1]).toMatchObject({ manufacturer: "Curated Pharma", normalizedName: activeItem.normalizedName });
    expect(updateSpy.mock.calls[0][2]).toMatchObject({ actionType: "CATALOG_ITEM_UPDATED", userId: "41" });
    expectNoBusinessWrites(writes);
  });

  it("soft-deactivates and reactivates catalog items while preserving their retrievability for historical and admin views", async () => {
    vi.spyOn(db, "getCatalogItemById")
      .mockResolvedValueOnce(activeItem as any)
      .mockResolvedValueOnce({ ...activeItem, active: 0 } as any);
    const activeSpy = vi.spyOn(db, "setCatalogItemActiveWithAudit").mockResolvedValue(undefined);
    vi.spyOn(db, "listCatalogItemsForAdmin").mockResolvedValue([{ ...activeItem, active: 0 }] as any);

    const caller = appRouter.createCaller(adminContext);
    const inactive = await caller.catalogAdmin.setItemActive({ catalogItemId: activeItem.catalogItemId, active: false });
    const historical = await caller.catalogAdmin.listItems({ includeInactive: true });
    const reactivated = await caller.catalogAdmin.setItemActive({ catalogItemId: activeItem.catalogItemId, active: true });

    expect(inactive.active).toBe(0);
    expect(historical[0]).toMatchObject({ catalogItemId: activeItem.catalogItemId, active: 0 });
    expect(reactivated.active).toBe(1);
    expect(activeSpy.mock.calls.map((call) => call[2].actionType)).toEqual(["CATALOG_ITEM_DEACTIVATED", "CATALOG_ITEM_REACTIVATED"]);
    expect(suggestCatalogMatches({ lineDescription: activeItem.canonicalName }, [], [])).toEqual([]);
  });

  it("creates explicit global and vendor-specific aliases with server-derived normalization, unique vendor scope, and durable audit attribution", async () => {
    vi.spyOn(db, "getCatalogItemById").mockResolvedValue(activeItem as any);
    vi.spyOn(db, "getCatalogAliasByVendorAndNormalizedAlias").mockResolvedValue(null);
    vi.spyOn(db, "getVendorById").mockResolvedValue({ vendorId: "vendor-1", name: "Supplier One", isActive: 1 } as any);
    const createSpy = vi.spyOn(db, "createCatalogAliasWithAudit").mockResolvedValue(undefined as never);
    const caller = appRouter.createCaller(adminContext);

    await caller.catalogAdmin.createAlias({ catalogItemId: activeItem.catalogItemId, aliasText: "DOLO-650 TAB", source: "MANUAL_CURATED" });
    await caller.catalogAdmin.createAlias({ catalogItemId: activeItem.catalogItemId, aliasText: "D 650", vendorId: "vendor-1", source: "VENDOR_CURATED" });

    expect(createSpy.mock.calls[0][0]).toMatchObject({ vendorId: "", normalizedAlias: "dolo 650 tablet", createdBy: "41" });
    expect(createSpy.mock.calls[0][1]).toMatchObject({ actionType: "CATALOG_ALIAS_CREATED", userId: "41" });
    expect(createSpy.mock.calls[1][0]).toMatchObject({ vendorId: "vendor-1", normalizedAlias: "d 650" });
  });

  it("rejects duplicate aliases and ensures deactivated aliases no longer participate in the active matching read path", async () => {
    vi.spyOn(db, "getCatalogItemById").mockResolvedValue(activeItem as any);
    vi.spyOn(db, "getCatalogAliasByVendorAndNormalizedAlias").mockResolvedValue(activeAlias as any);
    const createSpy = vi.spyOn(db, "createCatalogAliasWithAudit");
    await expect(appRouter.createCaller(adminContext).catalogAdmin.createAlias({
      catalogItemId: activeItem.catalogItemId,
      aliasText: "DOLO 650 TAB",
      source: "MANUAL_CURATED",
    })).rejects.toThrow("same vendor scope");
    expect(createSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
    vi.spyOn(db, "getCatalogAliasById")
      .mockResolvedValueOnce(activeAlias as any)
      .mockResolvedValueOnce({ ...activeAlias, active: 0 } as any);
    const activeSpy = vi.spyOn(db, "setCatalogAliasActiveWithAudit").mockResolvedValue(undefined);
    const caller = appRouter.createCaller(adminContext);
    const inactive = await caller.catalogAdmin.setAliasActive({ aliasId: activeAlias.aliasId, active: false });
    const reactivated = await caller.catalogAdmin.setAliasActive({ aliasId: activeAlias.aliasId, active: true });
    expect(inactive.active).toBe(0);
    expect(reactivated.active).toBe(1);
    expect(activeSpy.mock.calls.map((call) => call[2].actionType)).toEqual(["CATALOG_ALIAS_DEACTIVATED", "CATALOG_ALIAS_REACTIVATED"]);
    expect(suggestCatalogMatches({ lineDescription: activeAlias.aliasText }, [activeItem], []).some((match) => match.source === "ALIAS")).toBe(false);
  });

  it("enforces vendor-specific alias uniqueness independently from the global alias namespace", async () => {
    vi.spyOn(db, "getCatalogItemById").mockResolvedValue(activeItem as any);
    vi.spyOn(db, "getVendorById").mockResolvedValue({ vendorId: "vendor-1", name: "Supplier One", isActive: 1 } as any);
    vi.spyOn(db, "getCatalogAliasByVendorAndNormalizedAlias").mockResolvedValue({ ...activeAlias, vendorId: "vendor-1", aliasText: "D 650", normalizedAlias: "d 650" } as any);
    const createSpy = vi.spyOn(db, "createCatalogAliasWithAudit");

    await expect(appRouter.createCaller(adminContext).catalogAdmin.createAlias({
      catalogItemId: activeItem.catalogItemId,
      vendorId: "vendor-1",
      aliasText: "D-650",
      source: "VENDOR_CURATED",
    })).rejects.toThrow("same vendor scope");
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("allows authorized purchase-order readers to search curated catalog records but rejects staff and consultants from every catalog write", async () => {
    vi.spyOn(db, "checkFeatureAccess").mockResolvedValue(true);
    vi.spyOn(db, "listCatalogItemsForAdmin").mockResolvedValue([activeItem] as any);
    const staffCaller = appRouter.createCaller(staffContext);

    await expect(staffCaller.catalogAdmin.listItems()).resolves.toHaveLength(1);
    await expect(staffCaller.catalogAdmin.createItem(createItemInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(staffCaller.catalogAdmin.createAlias({ catalogItemId: activeItem.catalogItemId, aliasText: "DOLO 650 TAB", source: "MANUAL_CURATED" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const consultantCaller = appRouter.createCaller({ ...staffContext, user: { ...staffContext.user!, role: "consultant" } });
    await expect(consultantCaller.catalogAdmin.setItemActive({ catalogItemId: activeItem.catalogItemId, active: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps catalog writes reference-only: no PO creation, human-match acceptance, goods receipt, inventory, or stock mutation occurs", async () => {
    vi.spyOn(db, "getCatalogItemByNormalizedName").mockResolvedValue(null);
    vi.spyOn(db, "createCatalogItemWithAudit").mockResolvedValue(undefined as never);
    const writes = mockNoBusinessWrites();

    await appRouter.createCaller(adminContext).catalogAdmin.createItem(createItemInput);

    expectNoBusinessWrites(writes);
  });
});
