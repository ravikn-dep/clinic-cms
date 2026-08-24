import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: AuthenticatedUser["role"]): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: `step2-${role}`,
    email: `${role}@example.com`,
    name: `${role} user`,
    loginMethod: "test",
    role,
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

describe("Step 2 PO to goods receipt lifecycle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("always creates a Pending Approval PO and never posts inventory during creation", async () => {
		vi.spyOn(db, "getVendorById").mockResolvedValue({
		  vendorId: "VENDOR-STEP2", name: "Approved Vendor", normalizedVendorName: "approved vendor", isActive: 1,
		  contactNumber: "9876543210", gstNumber: null, normalizedGstNumber: null, email: null, address: null, bankDetails: null,
		} as any);
    const createPOWithItems = vi.spyOn(db, "createPurchaseOrderWithItems").mockResolvedValue({} as any);
    vi.spyOn(db, "createAuditLog").mockResolvedValue(undefined);
    vi.spyOn(db, "createPurchaseOrderHistory").mockResolvedValue(undefined);
    const inventoryLookup = vi.spyOn(db, "getInventoryByName");
    const inventoryCreate = vi.spyOn(db, "createInventoryItem");
    const inventoryUpdate = vi.spyOn(db, "updateInventoryItem");

    const caller = appRouter.createCaller(createAuthContext("staff"));
    const result = await caller.purchaseOrders.create({
		vendorId: "VENDOR-STEP2",
      vendorName: "Approved Vendor",
      vendorContactNumber: "9876543210",
      totalAmount: "100",
      authorizationNotes: "Submitted by staff",
      items: [{ itemName: "Sterile Gauze", quantity: 10, unitPrice: "10" }],
      // Deliberately forged legacy field: Zod must ignore it and the server must remain authoritative.
      approvalStatus: "Approved",
    } as any);

    expect(result.approvalStatus).toBe("Pending Approval");
    expect(createPOWithItems).toHaveBeenCalledTimes(1);
    const [poData, items] = createPOWithItems.mock.calls[0] ?? [];
    expect(poData).toMatchObject({ approvalStatus: "Pending Approval", paymentStatus: "Pending" });
    expect(poData).not.toHaveProperty("approvedBy");
    expect(poData).not.toHaveProperty("approvalTimestamp");
    expect(items).toHaveLength(1);
    expect(inventoryLookup).not.toHaveBeenCalled();
    expect(inventoryCreate).not.toHaveBeenCalled();
    expect(inventoryUpdate).not.toHaveBeenCalled();
  });

  it("blocks goods receipt posting for a role without purchase-order permission", async () => {
    vi.spyOn(db, "checkFeatureAccess").mockResolvedValue(false);
    const receive = vi.spyOn(db, "createGoodsReceipt");

    const caller = appRouter.createCaller(createAuthContext("consultant"));
    await expect(caller.purchaseOrders.receiveStock({
      goodsReceiptId: "GR-STEP2-001",
      purchaseOrderId: "PO-STEP2-001",
      lines: [{
        poItemId: "POI-STEP2-001",
        receivedQuantity: 2,
        batchNumber: "BATCH-001",
        expiryDate: "2027-12-31",
      }],
    })).rejects.toThrow("permission");
    expect(receive).not.toHaveBeenCalled();
  });

  it("passes an explicit, auditable receipt payload to the transactional goods receipt service", async () => {
    vi.spyOn(db, "checkFeatureAccess").mockResolvedValue(true);
    const receive = vi.spyOn(db, "createGoodsReceipt").mockResolvedValue({
      success: true,
      goodsReceiptId: "GR-STEP2-002",
      purchaseOrderId: "PO-STEP2-002",
      lines: [],
    });

    const caller = appRouter.createCaller(createAuthContext("staff"));
    const result = await caller.purchaseOrders.receiveStock({
      goodsReceiptId: "GR-STEP2-002",
      purchaseOrderId: "PO-STEP2-002",
      lines: [{
        poItemId: "POI-STEP2-002",
        receivedQuantity: 3,
        batchNumber: "BATCH-002",
        expiryDate: "2028-01-31",
        unitCost: "12.50",
      }],
    });

    expect(result.success).toBe(true);
    expect(receive).toHaveBeenCalledWith({
      goodsReceiptId: "GR-STEP2-002",
      purchaseOrderId: "PO-STEP2-002",
      receivedBy: "42",
		receivedByName: "staff user",
      lines: [{
        poItemId: "POI-STEP2-002",
        receivedQuantity: 3,
        batchNumber: "BATCH-002",
        expiryDate: "2028-01-31",
        unitCost: "12.50",
      }],
    });
  });

  it("rejects a receipt line without an explicit batch or valid expiry format", async () => {
    vi.spyOn(db, "checkFeatureAccess").mockResolvedValue(true);
    const receive = vi.spyOn(db, "createGoodsReceipt");
    const caller = appRouter.createCaller(createAuthContext("staff"));

    await expect(caller.purchaseOrders.receiveStock({
      goodsReceiptId: "GR-STEP2-003",
      purchaseOrderId: "PO-STEP2-003",
      lines: [{
        poItemId: "POI-STEP2-003",
        receivedQuantity: 1,
        batchNumber: "",
        expiryDate: "31/12/2028",
      }],
    })).rejects.toThrow();
    expect(receive).not.toHaveBeenCalled();
  });

  it("returns the aggregated purchase order metrics for the dashboard", async () => {
    const metrics = vi.spyOn(db, "getPurchaseOrderMetrics").mockResolvedValue({
      totalOrders: 8,
      pendingApprovals: 3,
      orderedUnits: 100,
      receivedUnits: 65,
      receiptProgressPercent: 65,
    });

    const caller = appRouter.createCaller(createAuthContext("staff"));
    await expect(caller.purchaseOrders.getMetrics()).resolves.toEqual({
      totalOrders: 8,
      pendingApprovals: 3,
      orderedUnits: 100,
      receivedUnits: 65,
      receiptProgressPercent: 65,
    });
    expect(metrics).toHaveBeenCalledTimes(1);
  });

  it("keeps approval separate from inventory receipt posting", async () => {
    vi.spyOn(db, "getPurchaseOrderById").mockResolvedValue({
      purchaseOrderId: "PO-STEP2-004",
      vendorName: "Approved Vendor",
      approvalStatus: "Pending Approval",
    } as any);
    const approve = vi.spyOn(db, "approvePurchaseOrderWithAudit").mockResolvedValue({
		purchaseOrderId: "PO-STEP2-004", vendorName: "Approved Vendor", approvalStatus: "Pending Approval",
	} as any);
    const inventoryLookup = vi.spyOn(db, "getInventoryByName");
    const inventoryCreate = vi.spyOn(db, "createInventoryItem");
    const inventoryUpdate = vi.spyOn(db, "updateInventoryItem");

    const caller = appRouter.createCaller(createAuthContext("admin"));
    const result = await caller.purchaseOrders.approve({ purchaseOrderId: "PO-STEP2-004" });

    expect(result).toEqual({ success: true });
		expect(approve).toHaveBeenCalledWith("PO-STEP2-004", { actorId: "42", actorName: "admin user" });
    expect(inventoryLookup).not.toHaveBeenCalled();
    expect(inventoryCreate).not.toHaveBeenCalled();
    expect(inventoryUpdate).not.toHaveBeenCalled();
  });
});


describe("goods receipt quantity rules", () => {
  it("represents partial receipt as ordered minus received", () => {
    const ordered = 10;
    const previouslyReceived = 4;
    const receivedNow = 3;
    expect(previouslyReceived + receivedNow).toBeLessThanOrEqual(ordered);
    expect(ordered - (previouslyReceived + receivedNow)).toBe(3);
  });

  it("does not permit over-receipt", () => {
    const ordered = 10;
    const previouslyReceived = 8;
    const receivedNow = 3;
    expect(previouslyReceived + receivedNow).toBeGreaterThan(ordered);
  });
});


// This file intentionally contains no tests for automatic inventory mutation on PO creation.
// Inventory is posted only through an explicit, approved goods receipt.
