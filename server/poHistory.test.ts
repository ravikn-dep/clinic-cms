import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => {
  const historyStore: any[] = [];
  return {
    store: historyStore,
    db: {
      createPurchaseOrder: vi.fn().mockResolvedValue(undefined),
      createPurchaseOrderHistory: vi.fn().mockImplementation(async (entry) => {
        historyStore.push(entry);
        return entry;
      }),
      getPurchaseOrderHistory: vi.fn().mockImplementation(async (poId) => {
        return historyStore.filter((h) => h.purchaseOrderId === poId);
      }),
    },
  };
});

vi.mock("./db", () => mockState.db);
import * as db from "./db";

describe("Purchase Order History", () => {
  beforeEach(() => {
    mockState.store.length = 0;
    vi.clearAllMocks();
  });

  it("persists approval and OCR correction-review events for one purchase order", async () => {
    const purchaseOrderId = "PO-HISTORY-001";

    await db.createPurchaseOrder({
      purchaseOrderId,
      vendorName: "History Test Vendor",
      vendorContactNumber: "9999999999",
      totalAmount: "1.00" as any,
      paymentStatus: "Pending",
      approvalStatus: "Pending Approval",
    });

    await db.createPurchaseOrderHistory({
      historyId: "POH-001-APPROVED",
      purchaseOrderId,
      eventType: "APPROVED",
      actorId: "test-admin",
      actorName: "Test Administrator",
      eventSummary: "Purchase order approved.",
      details: JSON.stringify({ approvalStatus: "Approved" }),
    });

    await db.createPurchaseOrderHistory({
      historyId: "POH-001-CORRECTION",
      purchaseOrderId,
      eventType: "OCR_CORRECTION_REVIEWED",
      actorId: "test-user",
      actorName: "Test Reviewer",
      eventSummary: "2 OCR field(s) manually verified before PO submission.",
      details: JSON.stringify({ verifiedFields: ["vendorName", "vendorGstNumber"] }),
    });

    const history = await db.getPurchaseOrderHistory(purchaseOrderId);
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: "APPROVED", actorName: "Test Administrator" }),
      expect.objectContaining({ eventType: "OCR_CORRECTION_REVIEWED", actorName: "Test Reviewer" }),
    ]));
  });
});
