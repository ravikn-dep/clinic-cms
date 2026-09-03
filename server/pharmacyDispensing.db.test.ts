import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb, createDispensedBill } from "./db";
import { auditLogs, billItems, bills, dispensingRecords, inventory } from "../drizzle/schema";

const db = await getDb();

const createdInventoryIds: string[] = [];
const createdBillIds: string[] = [];
const createdBillItemIds: string[] = [];
const createdDispensingIds: string[] = [];

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "").slice(0, 28)}`;
}

function billInput(params: {
  billId: string;
  billItemId: string;
  dispensingId: string;
  inventoryItemId: string;
  itemName: string;
  batchNumber: string;
  idempotencyKey: string;
  quantity: number;
}) {
  return {
    bill: {
      billId: params.billId,
      patientId: `ATT76-PAT-${params.billId.slice(-8)}`,
      totalAmount: "10.00" as any,
      discountAmount: "0.00" as any,
      taxAmount: "0.00" as any,
      finalAmount: "10.00" as any,
      paymentStatus: "Pending" as const,
    },
    items: [{
      billId: params.billId,
      billItemId: params.billItemId,
      itemType: "Medicine",
      description: params.itemName,
      quantity: params.quantity,
      unitPrice: "10.00" as any,
      subtotal: "10.00" as any,
      inventoryItemId: params.inventoryItemId,
      catalogItemId: null,
      batchNumber: params.batchNumber,
      expiryDate: "2099-12-31",
      dispensingId: params.dispensingId,
      idempotencyKey: params.idempotencyKey,
    }],
    actorId: "ATT76-TEST-ACTOR",
  };
}

async function cleanup() {
  if (!db) return;
  if (createdDispensingIds.length) await db.delete(dispensingRecords).where(inArray(dispensingRecords.dispensingId, createdDispensingIds));
  if (createdBillIds.length) await db.delete(auditLogs).where(inArray(auditLogs.recordId, createdBillIds));
  if (createdBillItemIds.length) await db.delete(billItems).where(inArray(billItems.billItemId, createdBillItemIds));
  if (createdBillIds.length) await db.delete(bills).where(inArray(bills.billId, createdBillIds));
  if (createdInventoryIds.length) await db.delete(inventory).where(inArray(inventory.itemId, createdInventoryIds));
}

afterEach(async () => {
  await cleanup();
  createdInventoryIds.length = 0;
  createdBillIds.length = 0;
  createdBillItemIds.length = 0;
  createdDispensingIds.length = 0;
});

describe("Attachment 76 real database dispensing hardening", () => {
  it("allows at most the available stock across concurrent oversell attempts and leaves no failed orphan bill", async () => {
    if (!db) throw new Error("Development database is required for this test");

    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    const inventoryItemId = id("ATT76-INV");
    const itemName = `ATT76-RACE-${suffix}`;
    const batchNumber = `ATT76-BATCH-${suffix}`;
    const billIds = [id("ATT76-BILL-A"), id("ATT76-BILL-B")];
    const billItemIds = [id("ATT76-ITEM-A"), id("ATT76-ITEM-B")];
    const dispensingIds = [id("ATT76-DISP-A"), id("ATT76-DISP-B")];
    const idempotencyKeys = [id("ATT76-RACE-A"), id("ATT76-RACE-B")];
    createdInventoryIds.push(inventoryItemId);
    createdBillIds.push(...billIds);
    createdBillItemIds.push(...billItemIds);
    createdDispensingIds.push(...dispensingIds);

    await db.insert(inventory).values({
      itemId: inventoryItemId,
      itemName,
      batchNumber,
      expiryDate: "2099-12-31",
      quantityAvailable: 1,
      reorderLevel: 0,
      unitPrice: "10.00" as any,
    });

    const attempts = billIds.map((billId, index) => createDispensedBill(billInput({
      billId,
      billItemId: billItemIds[index],
      dispensingId: dispensingIds[index],
      inventoryItemId,
      itemName,
      batchNumber,
      idempotencyKey: idempotencyKeys[index],
      quantity: 1,
    })));
    const results = await Promise.allSettled(attempts);
    const successful = results.filter((result) => result.status === "fulfilled");
    const failed = results.filter((result) => result.status === "rejected");

    const stock = await db.select({ quantityAvailable: inventory.quantityAvailable }).from(inventory).where(eq(inventory.itemId, inventoryItemId));
    const persistedBills = await db.select({ billId: bills.billId }).from(bills).where(inArray(bills.billId, billIds));
    const persistedItems = await db.select({ billItemId: billItems.billItemId }).from(billItems).where(inArray(billItems.billItemId, billItemIds));
    const persistedDispensing = await db.select({ dispensingId: dispensingRecords.dispensingId }).from(dispensingRecords).where(inArray(dispensingRecords.dispensingId, dispensingIds));

    expect(successful.length).toBe(1);
    expect(failed.length).toBe(1);
    expect(stock[0]?.quantityAvailable).toBe(0);
    expect(persistedBills).toHaveLength(1);
    expect(persistedItems).toHaveLength(1);
    expect(persistedDispensing).toHaveLength(1);
  });

  it("returns one logical result for simultaneous requests with the same idempotency key", async () => {
    if (!db) throw new Error("Development database is required for this test");

    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
    const inventoryItemId = id("ATT76-IDEMP-INV");
    const billIds = [id("ATT76-IDEMP-A"), id("ATT76-IDEMP-B")];
    const billItemIds = [id("ATT76-IDEMP-ITEM-A"), id("ATT76-IDEMP-ITEM-B")];
    const dispensingIds = [id("ATT76-IDEMP-DISP-A"), id("ATT76-IDEMP-DISP-B")];
    const sharedKey = `ATT76-SHARED-${suffix}`;
    createdInventoryIds.push(inventoryItemId);
    createdBillIds.push(...billIds);
    createdBillItemIds.push(...billItemIds);
    createdDispensingIds.push(...dispensingIds);

    await db.insert(inventory).values({
      itemId: inventoryItemId,
      itemName: `ATT76-IDEMP-${suffix}`,
      batchNumber: `ATT76-IDEMP-BATCH-${suffix}`,
      expiryDate: "2099-12-31",
      quantityAvailable: 2,
      reorderLevel: 0,
      unitPrice: "10.00" as any,
    });

    const common = {
      inventoryItemId,
      itemName: `ATT76-IDEMP-${suffix}`,
      batchNumber: `ATT76-IDEMP-BATCH-${suffix}`,
      idempotencyKey: sharedKey,
      quantity: 1,
    };
    const results = await Promise.allSettled([
      createDispensedBill(billInput({ ...common, billId: billIds[0], billItemId: billItemIds[0], dispensingId: dispensingIds[0] })),
      createDispensedBill(billInput({ ...common, billId: billIds[1], billItemId: billItemIds[1], dispensingId: dispensingIds[1] })),
    ]);

    const successful = results.filter((result): result is PromiseFulfilledResult<{ billId: string; created: boolean }> => result.status === "fulfilled");
    expect(successful.length).toBe(2);
    expect(new Set(successful.map((result) => result.value.billId)).size).toBe(1);
    expect(successful.filter((result) => result.value.created)).toHaveLength(1);
    const stock = await db.select({ quantityAvailable: inventory.quantityAvailable }).from(inventory).where(eq(inventory.itemId, inventoryItemId));
    expect(stock[0]?.quantityAvailable).toBe(1);
  });
});
