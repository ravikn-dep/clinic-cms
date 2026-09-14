import { describe, expect, it } from "vitest";
import { createGoodsReceiptReviewPrefill } from "../shared/goodsReceiptReview";
import type { ParsedPurchaseDocument } from "../server/poParsing/types";

const field = <T>(value: T | null, sourceText?: string) => ({ value, sourceText, confidence: value === null ? "low" as const : "high" as const });

function documentFixture(overrides: Partial<ParsedPurchaseDocument> = {}): ParsedPurchaseDocument {
  return {
    documentType: "GST_INVOICE",
    invoiceNumber: field("INV-100", "Invoice No: INV-100"),
    invoiceDate: field("15/08/2026", "Date: 15/08/2026"),
    vendorName: field("Apex Pharma Distributors", "Apex Pharma Distributors"),
    vendorGstin: field("29AABCA1234F1Z5", "GSTIN: 29AABCA1234F1Z5"),
    subtotal: field(1000, "Subtotal: 1000.00"),
    cgst: field(90, "CGST: 90.00"),
    sgst: field(90, "SGST: 90.00"),
    igst: field(null),
    totalTax: field(180, "Tax: 180.00"),
    grandTotal: field(1180, "Grand Total: 1180.00"),
    items: [{
      description: field("Paracetamol 500mg Tablet", "Paracetamol 500mg Tablet 100 10.00 1000.00"),
      hsnCode: field("3004", "HSN: 3004"),
      batchNumber: field("BAT-100", "Batch: BAT-100"),
      expiryDate: field("2028-12-31", "Expiry: 2028-12-31"),
      quantity: field(100, "Qty: 100"),
      unitPrice: field(10, "Rate: 10.00"),
      discount: field(null),
      gstRate: field(null),
      taxableAmount: field(1000),
      lineTotal: field(1000),
    }],
    warnings: [],
    reconciliation: { lineTotalsMatch: true, subtotalMatches: true, taxMatches: true, grandTotalMatches: true, delta: 0 },
    ...overrides,
  };
}

describe("Goods Receipt Scan canonical OCR review adapter", () => {
  it("reuses PO review values while normalizing receipt dates for editable date inputs", () => {
    const review = createGoodsReceiptReviewPrefill(documentFixture());
    expect(review.header.vendorName.value).toBe("Apex Pharma Distributors");
    expect(review.header.invoiceNumber.value).toBe("INV-100");
    expect(review.header.invoiceDate.value).toBe("2026-08-15");
    expect(review.header.invoiceDate.sourceText).toBe("Date: 15/08/2026");
    expect(review.header.vendorGstin.value).toBe("29AABCA1234F1Z5");
    expect(review.totals.grandTotal.value).toBe("1180");
    expect(review.items[0].description.value).toBe("Paracetamol 500mg Tablet");
    expect(review.items[0].quantity.value).toBe("100");
    expect(review.items[0].unitPrice.value).toBe("10");
    expect(review.items[0].batchNumber.value).toBe("BAT-100");
    expect(review.items[0].expiryDate.value).toBe("2028-12-31");
    expect(review.items[0].description.edited).toBe(false);
    expect(review.requiresExplicitSubmission).toBe(true);
  });

  it("flags missing receipt identity, traceability, quantity, cost, and catalog mapping fields without fabricating values", () => {
    const review = createGoodsReceiptReviewPrefill(documentFixture({
      invoiceNumber: field(null),
      invoiceDate: field(null),
      vendorName: field(null),
      vendorGstin: field(null),
      items: [{
        description: field(null),
        hsnCode: field(null),
        batchNumber: field(null),
        expiryDate: field(null),
        quantity: field(null),
        unitPrice: field(null),
        discount: field(null),
        gstRate: field(null),
        taxableAmount: field(null),
        lineTotal: field(null),
      }],
    }));
    expect(review.header.vendorName.value).toBe("");
    expect(review.header.invoiceNumber.value).toBe("");
    expect(review.header.invoiceDate.value).toBe("");
    expect(review.items[0].batchNumber.value).toBe("");
    expect(review.items[0].expiryDate.value).toBe("");
    expect(review.warnings).toEqual(expect.arrayContaining([
      "Receipt review: supplier name is required.",
      "Receipt review: receipt or invoice number is required.",
      "Receipt review: receipt date is required.",
      "Receipt line 1: received quantity is required.",
      "Receipt line 1: unit cost is required.",
      "Receipt line 1: batch number is required for inventory traceability.",
      "Receipt line 1: expiry date is required for inventory traceability.",
      "Receipt line 1: map to a governed catalog medicine before posting.",
    ]));
  });

  it("does not perform posting or inventory work; it returns only review data", () => {
    const review = createGoodsReceiptReviewPrefill(documentFixture());
    expect(review).not.toHaveProperty("receiptId");
    expect(review).not.toHaveProperty("inventory");
    expect(review).not.toHaveProperty("stockMovement");
    expect(review.requiresExplicitSubmission).toBe(true);
  });
});
