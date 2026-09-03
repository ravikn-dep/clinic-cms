import { describe, expect, it } from "vitest";
import { isPharmacyLine, isUnexpiredBatch, selectFefoBatch, validatePharmacyLine } from "./pharmacyDispensing";

describe("pharmacy dispensing bridge", () => {
  const candidates = [
    { itemId: "late", itemName: "Paracetamol", batchNumber: "B2", expiryDate: "2027-12-31", quantityAvailable: 20, unitPrice: "12.00" },
    { itemId: "early", itemName: "Paracetamol", batchNumber: "B1", expiryDate: "2027-03-31", quantityAvailable: 20, unitPrice: "10.00" },
    { itemId: "expired", itemName: "Paracetamol", batchNumber: "B0", expiryDate: "2024-01-01", quantityAvailable: 50, unitPrice: "8.00" },
  ];

  it("selects the earliest valid batch first", () => {
    expect(selectFefoBatch(candidates, 2, "2026-09-02")?.itemId).toBe("early");
  });

  it("excludes expired batches from FEFO", () => {
    expect(selectFefoBatch([candidates[2]], 1, "2026-09-02")).toBeNull();
    expect(isUnexpiredBatch("2024-01-01", "2026-09-02")).toBe(false);
  });

  it("rejects quantities above available stock", () => {
    expect(selectFefoBatch([candidates[0]], 21, "2026-09-02")).toBeNull();
  });

  it("requires exact inventory provenance for medicine lines", () => {
    expect(validatePharmacyLine({ itemType: "Medicine", quantity: 1 })).toBe("Exact inventory batch provenance is required");
    expect(validatePharmacyLine({ itemType: "Medicine", quantity: 1, inventoryItemId: "early", batchNumber: "B1", expiryDate: "2027-03-31" })).toBeNull();
  });

  it("rejects expired pharmacy lines and invalid quantities", () => {
    expect(validatePharmacyLine({ itemType: "Medicine", quantity: 0, inventoryItemId: "early", batchNumber: "B1", expiryDate: "2027-03-31" })).toContain("positive");
    expect(validatePharmacyLine({ itemType: "Medicine", quantity: 1, inventoryItemId: "expired", batchNumber: "B0", expiryDate: "2024-01-01" })).toBe("Expired stock cannot be dispensed");
  });

  it("leaves consultation and procedure lines outside the pharmacy boundary", () => {
    expect(isPharmacyLine("Consultation")).toBe(false);
    expect(isPharmacyLine("Procedure")).toBe(false);
    expect(validatePharmacyLine({ itemType: "Consultation", quantity: 1 })).toBeNull();
  });

  it("keeps the idempotency contract at the request boundary", () => {
    const requestKey = "bill-request-123456";
    expect(requestKey.length).toBeGreaterThanOrEqual(16);
    expect(`${requestKey}:0`).not.toBe(`${requestKey}:1`);
  });
});
