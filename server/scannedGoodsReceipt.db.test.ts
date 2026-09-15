import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { createScannedGoodsReceipt, getDb, getScannedGoodsReceiptMetrics } from "./db";
import { auditLogs, catalogItems, inventory, scannedGoodsReceiptItems, scannedGoodsReceipts, scannedReceiptInventoryLocks, scannedReceiptStockMovements } from "../drizzle/schema";

const db = await getDb();
const receiptIds: string[] = [];
const inventoryIds: string[] = [];
const catalogIds: string[] = [];
const lockKeys: string[] = [];
const receivedBy = `SCANNED-RECEIPT-TEST-${crypto.randomUUID()}`;

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "").slice(0, 28)}`;
}

async function cleanup() {
  if (!db) return;
  if (receiptIds.length) {
    await db.delete(scannedReceiptStockMovements).where(inArray(scannedReceiptStockMovements.receiptId, receiptIds));
    await db.delete(scannedGoodsReceiptItems).where(inArray(scannedGoodsReceiptItems.receiptId, receiptIds));
    await db.delete(auditLogs).where(inArray(auditLogs.recordId, receiptIds));
    await db.delete(scannedGoodsReceipts).where(inArray(scannedGoodsReceipts.receiptId, receiptIds));
  }
  if (lockKeys.length) await db.delete(scannedReceiptInventoryLocks).where(inArray(scannedReceiptInventoryLocks.lockKey, lockKeys));
  if (inventoryIds.length) await db.delete(inventory).where(inArray(inventory.itemId, inventoryIds));
  if (catalogIds.length) await db.delete(catalogItems).where(inArray(catalogItems.catalogItemId, catalogIds));
}

afterEach(async () => {
  await cleanup();
  receiptIds.length = 0;
  inventoryIds.length = 0;
  catalogIds.length = 0;
  lockKeys.length = 0;
});

describe("direct scanned Goods Receipt posting", () => {
  it("updates an exact batch, creates a new batch under the same catalog medicine, replays idempotently, and supplies dashboard metrics", async () => {
    if (!db) throw new Error("Development database is required for this test");

    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 18);
    const catalogItemId = id("SCAN-CATALOG");
    const existingInventoryId = id("SCAN-INV");
    const canonicalName = `Scanned Receipt Medicine ${suffix}`;
    catalogIds.push(catalogItemId);
    inventoryIds.push(existingInventoryId);
    await db.insert(catalogItems).values({
      catalogItemId,
      canonicalName,
      normalizedName: `scanned receipt medicine ${suffix}`,
      active: 1,
    });
    await db.insert(inventory).values({
      itemId: existingInventoryId,
      itemName: canonicalName,
      catalogItemId,
      batchNumber: "SCAN-BATCH-A",
      expiryDate: "2099-12-31",
      quantityAvailable: 5,
      reorderLevel: 2,
      unitPrice: "10.00" as any,
    });

    const firstReceiptId = id("GRS");
    const firstSubmission = crypto.randomUUID();
    receiptIds.push(firstReceiptId);
    lockKeys.push(`${catalogItemId}|SCAN-BATCH-A|2099-12-31`);
    const first = await createScannedGoodsReceipt({
      receiptId: firstReceiptId,
      reviewSubmissionId: firstSubmission,
      receiptNumber: `INV-${suffix}`,
      receiptDate: "2026-09-12",
      vendorName: "Scanned Receipt Test Supplier",
      documentType: "GST_INVOICE",
      reviewJson: "{}",
      warningsJson: "[]",
      receivedBy,
      lines: [{ lineNumber: 1, catalogItemId, extractedDescription: canonicalName, batchNumber: "SCAN-BATCH-A", expiryDate: "2099-12-31", receivedQuantity: 3, unitCost: "12.50" }],
    });
    expect(first.idempotent).toBe(false);
    expect(first.lines[0]).toMatchObject({ previousQuantity: 5, resultingQuantity: 8, quantityAdded: 3 });

    const replay = await createScannedGoodsReceipt({
      receiptId: id("GRS-RETRY"),
      reviewSubmissionId: firstSubmission,
      receiptNumber: `INV-${suffix}`,
      receiptDate: "2026-09-12",
      vendorName: "Scanned Receipt Test Supplier",
      documentType: "GST_INVOICE",
      reviewJson: "{}",
      warningsJson: "[]",
      receivedBy,
      lines: [{ lineNumber: 1, catalogItemId, extractedDescription: canonicalName, batchNumber: "SCAN-BATCH-A", expiryDate: "2099-12-31", receivedQuantity: 3, unitCost: "12.50" }],
    });
    expect(replay).toMatchObject({ success: true, idempotent: true, receiptId: firstReceiptId });

    const secondReceiptId = id("GRS");
    receiptIds.push(secondReceiptId);
    lockKeys.push(`${catalogItemId}|SCAN-BATCH-B|2098-12-31`);
    const second = await createScannedGoodsReceipt({
      receiptId: secondReceiptId,
      reviewSubmissionId: crypto.randomUUID(),
      receiptNumber: `INV-${suffix}-B`,
      receiptDate: "2026-09-13",
      vendorName: "Scanned Receipt Test Supplier",
      documentType: "GST_INVOICE",
      reviewJson: "{}",
      warningsJson: "[]",
      receivedBy,
      lines: [{ lineNumber: 1, catalogItemId, extractedDescription: canonicalName, batchNumber: "SCAN-BATCH-B", expiryDate: "2098-12-31", receivedQuantity: 7, unitCost: "13.00" }],
    });
    const newInventoryId = String(second.lines[0]?.inventoryItemId);
    inventoryIds.push(newInventoryId);
    expect(second.idempotent).toBe(false);
    expect(second.lines[0]).toMatchObject({ previousQuantity: 0, resultingQuantity: 7, quantityAdded: 7 });

    const rows = await db.select().from(inventory).where(inArray(inventory.itemId, [existingInventoryId, newInventoryId]));
    expect(rows.map((row) => ({ batchNumber: row.batchNumber, quantityAvailable: row.quantityAvailable })).sort((a, b) => a.batchNumber.localeCompare(b.batchNumber)))
      .toEqual([{ batchNumber: "SCAN-BATCH-A", quantityAvailable: 8 }, { batchNumber: "SCAN-BATCH-B", quantityAvailable: 7 }]);
    const audit = await db.select().from(auditLogs).where(eq(auditLogs.recordId, firstReceiptId));
    expect(audit.filter((row) => row.actionType === "SCANNED_RECEIPT_POSTED")).toHaveLength(1);
    await expect(getScannedGoodsReceiptMetrics({ receivedBy })).resolves.toEqual({
      postedReceipts: 2,
      receivedUnits: 10,
    });
  });
});
