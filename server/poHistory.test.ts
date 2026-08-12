import * as db from "./db";
import { beforeAll, describe, expect, it } from "vitest";

describe("Purchase Order History", () => {
  const purchaseOrderId = `PO-HISTORY-${Date.now()}`;

  beforeAll(async () => {
    await db.createPurchaseOrder({
      purchaseOrderId,
      vendorName: "History Test Vendor",
      vendorContactNumber: "9999999999",
      totalAmount: "1.00" as any,
      paymentStatus: "Pending",
      approvalStatus: "Pending Approval",
    });
  });

  it("persists approval and OCR correction-review events for one purchase order", async () => {
    await db.createPurchaseOrderHistory({
      historyId: `POH-${Date.now()}-APPROVED`,
      purchaseOrderId,
      eventType: "APPROVED",
      actorId: "test-admin",
      actorName: "Test Administrator",
      eventSummary: "Purchase order approved.",
      details: JSON.stringify({ approvalStatus: "Approved" }),
    });
    await db.createPurchaseOrderHistory({
      historyId: `POH-${Date.now()}-CORRECTION`,
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
