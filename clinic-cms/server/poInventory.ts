import * as db from "./db";
import * as utils from "./utils";

export type POInventoryLine = {
  itemName: string;
  quantity: number;
  unitPrice: number;
  batchNumber?: string;
  expiryDate?: string;
};

export function parsePoMoney(value: string | number | undefined): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function parsePoQuantity(value: string | number | undefined): number {
  if (typeof value === "number") return Math.max(1, Math.floor(value));
  const n = Number.parseInt(String(value ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Add or update pharmacy inventory from approved PO line items. */
export async function syncPurchaseOrderItemsToInventory(
  purchaseOrderId: string,
  items: POInventoryLine[],
  userId: string
): Promise<{ updated: number; created: number }> {
  let updated = 0;
  let created = 0;

  for (const item of items) {
    if (!item.itemName?.trim()) continue;

    const quantity = parsePoQuantity(item.quantity);
    const unitPrice = parsePoMoney(item.unitPrice);
    const existingItem = await db.getInventoryByName(item.itemName.trim());

    if (existingItem) {
      const currentQuantity = existingItem.quantityAvailable || 0;
      await db.updateInventoryItem(existingItem.itemId, {
        quantityAvailable: currentQuantity + quantity,
        ...(unitPrice > 0 ? { unitPrice: unitPrice.toString() as any } : {}),
      });
      updated += 1;
    } else {
      const itemId = utils.generateAuditLogId();
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      await db.createInventoryItem({
        itemId,
        itemName: item.itemName.trim(),
        quantityAvailable: quantity,
        unitPrice: (unitPrice > 0 ? unitPrice : 0).toString() as any,
        reorderLevel: Math.max(1, Math.ceil(quantity * 0.2)),
        batchNumber: item.batchNumber || `PO-${purchaseOrderId}`,
        expiryDate: item.expiryDate || futureDate.toISOString().split("T")[0],
      });
      created += 1;
    }

    await db.createAuditLog({
      logId: utils.generateAuditLogId(),
      userId,
      actionType: "CREATE",
      tableName: "inventory",
      recordId: item.itemName.trim(),
      newValue: JSON.stringify({
        itemName: item.itemName.trim(),
        quantity,
        source: `PO-${purchaseOrderId}`,
      }),
      timestamp: new Date(),
    });
  }

  return { updated, created };
}
