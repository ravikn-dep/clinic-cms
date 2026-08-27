import { describe, expect, it } from "vitest";
import {
  enrichPurchaseOrderFromVerifiedVendor,
  normalizeGstNumber,
  normalizeVendorName,
  receiptStateForLines,
  resolveVendorMaster,
  vendorAuditSnapshot,
  type VendorMasterRecord,
} from "./procurement";

const alpha: VendorMasterRecord = {
  vendorId: "VENDOR-ALPHA", name: "Alpha Med Supplies", normalizedVendorName: "alpha med supplies",
  contactNumber: "9876543210", gstNumber: "29ABCDE1234F1Z5", normalizedGstNumber: "29ABCDE1234F1Z5",
  email: "orders@alpha.example", address: "Verified address", bankDetails: "verified-bank-reference", isActive: 1,
};

describe("Step 8 governed procurement policy", () => {
  it("normalizes vendor name punctuation and GSTIN casing server-side", () => {
    expect(normalizeVendorName(" Alpha-Med, Supplies ")).toBe("alpha med supplies");
    expect(normalizeGstNumber("29-abcde1234f1z5")).toBe("29ABCDE1234F1Z5");
  });

  it("resolves exactly one active Vendor Master record without creating a vendor", () => {
    const result = resolveVendorMaster({ vendorName: "Alpha Med Supplies", vendorGSTNumber: "29ABCDE1234F1Z5" }, [alpha]);
    expect(result.status).toBe("RESOLVED");
    expect(result.vendor?.vendorId).toBe("VENDOR-ALPHA");
  });

  it("returns ambiguity for more than one candidate instead of silently choosing or merging", () => {
    const result = resolveVendorMaster({ vendorName: "Alpha Med Supplies" }, [alpha, { ...alpha, vendorId: "VENDOR-BETA", normalizedGstNumber: null }]);
    expect(result.status).toBe("AMBIGUOUS");
    expect(result.candidates).toHaveLength(2);
  });

  it("flags GSTIN conflict on a name-resolved master record", () => {
    const result = resolveVendorMaster({ vendorName: "Alpha Med Supplies", vendorGSTNumber: "27ZZZZZ9999Z1Z9" }, [alpha]);
    expect(result.status).toBe("CONFLICT");
    expect(result.conflicts.join(" ")).toMatch(/GSTIN/);
  });

  it("fills only missing values from the explicitly linked master record", () => {
    const enriched = enrichPurchaseOrderFromVerifiedVendor({ vendorName: "Reviewed display name", vendorContactNumber: "", vendorGSTNumber: "" }, alpha);
    expect(enriched.vendorName).toBe("Reviewed display name");
    expect(enriched.vendorContactNumber).toBe("9876543210");
    expect(enriched.vendorGSTNumber).toBe("29ABCDE1234F1Z5");
  });

  it("derives receipt status from immutable PO-line quantities", () => {
    expect(receiptStateForLines([{ quantity: 10, receivedQuantity: 0 }])).toBe("AWAITING_RECEIPT");
    expect(receiptStateForLines([{ quantity: 10, receivedQuantity: 4 }])).toBe("PARTIALLY_RECEIVED");
    expect(receiptStateForLines([{ quantity: 10, receivedQuantity: 10 }])).toBe("FULLY_RECEIVED");
  });

  it("excludes bank detail values from audit snapshots", () => {
    const snapshot = vendorAuditSnapshot(alpha);
    expect(snapshot.bankDetailsPresent).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("verified-bank-reference");
  });
});
