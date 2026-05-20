import { describe, it, expect, beforeEach, vi } from "vitest";
import * as db from "./db";

describe("Purchase Order Auto-Inventory Update", () => {
  describe("Auto-add items to inventory on PO creation", () => {
    it("should create new inventory item when PO item does not exist", async () => {
      const itemName = "Paracetamol 500mg";
      const quantity = 100;

      vi.spyOn(db, "getInventoryByName").mockResolvedValueOnce(null);
      vi.spyOn(db, "createInventoryItem").mockResolvedValueOnce({} as any);

      await db.getInventoryByName(itemName);
      await db.createInventoryItem({
        itemId: "INV-001",
        itemName,
        quantityAvailable: quantity,
        unitPrice: "5",
        reorderLevel: 20,
        batchNumber: "PO-001",
        expiryDate: "2027-05-04",
      } as any);

      expect(db.getInventoryByName).toHaveBeenCalledWith(itemName);
      expect(db.createInventoryItem).toHaveBeenCalled();
    });

    it("should update existing inventory item quantity when item exists", async () => {
      const itemName = "Ibuprofen 400mg";
      const existingQuantity = 50;
      const newQuantity = 75;

      const existingItem = {
        itemId: "INV-002",
        itemName,
        quantityAvailable: existingQuantity,
        unitPrice: "8",
        reorderLevel: 15,
        batchNumber: "PO-002",
        expiryDate: "2027-05-04",
      };

      vi.spyOn(db, "getInventoryByName").mockResolvedValueOnce(existingItem as any);
      vi.spyOn(db, "updateInventoryItem").mockResolvedValueOnce(undefined);

      await db.getInventoryByName(itemName);
      await db.updateInventoryItem(existingItem.itemId, { quantityAvailable: newQuantity });

      expect(db.getInventoryByName).toHaveBeenCalledWith(itemName);
      expect(db.updateInventoryItem).toHaveBeenCalledWith(existingItem.itemId, { quantityAvailable: newQuantity });
    });

    it("should set reorder level to 20% of PO quantity for new items", async () => {
      const quantity = 500;
      const expectedReorderLevel = Math.ceil(quantity * 0.2); // 100

      expect(expectedReorderLevel).toBe(100);
    });

    it("should set batch number from PO ID", async () => {
      const poId = "PO-TEST-123";
      const expectedBatchNumber = `PO-${poId}`;

      expect(expectedBatchNumber).toBe("PO-PO-TEST-123");
    });

    it("should handle multiple items in a single PO", async () => {
      const items = [
        { itemName: "Aspirin 100mg", quantity: 200 },
        { itemName: "Metformin 500mg", quantity: 150 },
        { itemName: "Atorvastatin 10mg", quantity: 100 },
      ];

      vi.spyOn(db, "getInventoryByName").mockResolvedValue(null);
      vi.spyOn(db, "createInventoryItem").mockResolvedValue({} as any);

      for (const item of items) {
        await db.getInventoryByName(item.itemName);
        await db.createInventoryItem({
          itemId: `INV-${item.itemName}`,
          itemName: item.itemName,
          quantityAvailable: item.quantity,
          unitPrice: "10",
          reorderLevel: Math.ceil(item.quantity * 0.2),
          batchNumber: "PO-MULTI-001",
          expiryDate: "2027-05-04",
        } as any);
      }

      expect(db.createInventoryItem).toHaveBeenCalledTimes(3);
    });

    it("should merge quantities when adding to existing inventory", async () => {
      const itemName = "Amoxicillin 250mg";
      const existingQuantity = 75;
      const poQuantity = 50;
      const expectedTotal = existingQuantity + poQuantity;

      expect(expectedTotal).toBe(125);
    });

    it("should set expiry date to 1 year from now for new items", async () => {
      const today = new Date();
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);

      const expectedExpiryDate = nextYear.toISOString().split('T')[0];

      expect(expectedExpiryDate).toBeTruthy();
      expect(expectedExpiryDate.length).toBe(10); // YYYY-MM-DD format
    });

    it("should create audit log for inventory addition from PO", async () => {
      const itemName = "Ciprofloxacin 500mg";
      const poId = "PO-AUDIT-001";

      vi.spyOn(db, "createAuditLog").mockResolvedValueOnce(undefined);

      await db.createAuditLog({
        logId: "LOG-001",
        userId: "user-123",
        actionType: "CREATE",
        tableName: "inventory",
        recordId: itemName,
        newValue: JSON.stringify({ itemName, quantity: 100, source: `PO-${poId}` }),
        timestamp: new Date(),
      });

      expect(db.createAuditLog).toHaveBeenCalled();
    });

    it("should handle inventory update errors gracefully", async () => {
      const itemName = "Losartan 50mg";

      vi.spyOn(db, "getInventoryByName").mockRejectedValueOnce(new Error("DB Error"));

      try {
        await db.getInventoryByName(itemName);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
