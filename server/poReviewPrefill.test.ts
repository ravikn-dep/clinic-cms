import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { setOcrProvider } from "./ocr/provider";
import type { OcrProvider } from "./ocr/types";
import {
  createPurchaseOrderReviewPrefill,
  qualitativeConfidenceLabel,
  updateReviewField,
} from "@shared/poReviewPrefill";
import type { ParsedPurchaseDocument } from "./poParsing/types";

const context: TrpcContext = {
  user: {
    id: 1,
    openId: "phase3-step3-test-user",
    email: "doctor@example.com",
    name: "Test Doctor",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  req: {} as any,
  res: {} as any,
};

const field = <T>(value: T | null, confidence: "high" | "medium" | "low" = "medium", sourceText?: string) => ({
  value,
  confidence,
  sourceText,
});

describe("Phase 3 Step 3: Scan PO review and safe structured prefill", () => {
  afterEach(() => {
    setOcrProvider(null);
    vi.restoreAllMocks();
  });

  it("feeds OCR full text into the deterministic parser and maps the result into editable review state", async () => {
    const provider: OcrProvider = {
      async extractDocument() {
        return {
          provider: "step3-test-ocr",
          fullText: [
            "GST INVOICE",
            "Apex Pharma Distributors",
            "GSTIN: 29AABCA1234F1Z5",
            "Invoice No: INV-100",
            "Paracetamol 500mg 10 12.00 120.00",
            "Grand Total: 120.00",
          ].join("\n"),
          pages: [{ pageNumber: 1, text: "deterministic test page" }],
        };
      },
    };
    setOcrProvider(provider);
    const caller = appRouter.createCaller(context);
    const ocrResult = await caller.ocr.extractDocument({
      data: "ZmFrZS1pbWFnZS1ieXRlcw==",
      mimeType: "image/jpeg",
    });
    const parsed = await caller.poParsing.parseOcrText({ fullText: ocrResult.fullText });
    const review = createPurchaseOrderReviewPrefill(parsed);

    expect(ocrResult.fullText).toContain("GST INVOICE");
    expect(review.documentType).toBe("GST_INVOICE");
    expect(review.header.vendorGstin.value).toBe("29AABCA1234F1Z5");
    expect(review.header.vendorGstin.sourceText).toContain("GSTIN");
    expect(review.items.length).toBeGreaterThan(0);
    expect(review.items[0].description.value).toContain("Paracetamol");
    expect(review.requiresExplicitSubmission).toBe(true);
  });

  it("keeps missing parsed fields blank and maps qualitative confidence without percentages", () => {
    const document: ParsedPurchaseDocument = {
      documentType: "PURCHASE_ORDER",
      invoiceNumber: field(null, "low"),
      invoiceDate: field(null, "low"),
      vendorName: field(null, "low"),
      vendorGstin: field(null, "low"),
      grandTotal: field(null, "low"),
      items: [],
      warnings: [],
      reconciliation: {
        lineTotalsMatch: null,
        subtotalMatches: null,
        taxMatches: null,
        grandTotalMatches: null,
      },
    };

    const review = createPurchaseOrderReviewPrefill(document);

    expect(review.header.invoiceNumber.value).toBe("");
    expect(review.header.vendorName.value).toBe("");
    expect(qualitativeConfidenceLabel(review.header.vendorName.confidence)).toBe("LOW");
    expect(review.warnings).toEqual(expect.arrayContaining([
      "Missing invoice or purchase order number.",
      "Missing vendor name.",
    ]));
  });

  it("preserves OCR provenance when a user corrects an extracted value", () => {
    const document: ParsedPurchaseDocument = {
      documentType: "GST_INVOICE",
      invoiceNumber: field("INV-100", "high", "Invoice No: INV-100"),
      invoiceDate: field("12/08/2026", "high", "Date: 12/08/2026"),
      vendorName: field("Apex Pharma", "medium", "APEX PHARMA DISTRIBUTORS"),
      vendorGstin: field("29AABCA1234F1Z5", "high", "GSTIN: 29AABCA1234F1Z5"),
      grandTotal: field(100, "high", "Total: 100.00"),
      items: [],
      warnings: [],
      reconciliation: {
        lineTotalsMatch: null,
        subtotalMatches: null,
        taxMatches: null,
        grandTotalMatches: true,
      },
    };
    const review = createPurchaseOrderReviewPrefill(document);
    const corrected = updateReviewField(review.header.vendorName, "Apex Pharma Private Limited");

    expect(corrected.value).toBe("Apex Pharma Private Limited");
    expect(corrected.extractedValue).toBe("Apex Pharma");
    expect(corrected.sourceText).toBe("APEX PHARMA DISTRIBUTORS");
    expect(corrected.edited).toBe(true);
  });

  it("surfaces arithmetic mismatch warnings without silently altering extracted financial values", () => {
    const document: ParsedPurchaseDocument = {
      documentType: "GST_INVOICE",
      invoiceNumber: field("INV-200", "high"),
      invoiceDate: field("12/08/2026", "high"),
      vendorName: field("Apex Pharma", "high"),
      vendorGstin: field("29AABCA1234F1Z5", "high"),
      grandTotal: field(125, "high", "Grand Total: 125.00"),
      items: [],
      warnings: [],
      reconciliation: {
        lineTotalsMatch: false,
        subtotalMatches: true,
        taxMatches: true,
        grandTotalMatches: false,
        delta: 5,
      },
    };

    const review = createPurchaseOrderReviewPrefill(document);

    expect(review.totals.grandTotal.value).toBe("125");
    expect(review.warnings).toEqual(expect.arrayContaining([
      "Line totals do not reconcile with quantity and unit price.",
      "Grand total does not reconcile (difference: ₹5.00).",
    ]));
  });

  it("performs zero PO, goods receipt, inventory, or stock mutations during OCR and parsing", async () => {
    const createPoSpy = vi.spyOn(db, "createPurchaseOrderWithItems");
    const receiptSpy = vi.spyOn(db, "createGoodsReceipt");
    const inventorySpy = vi.spyOn(db, "updateInventoryItem");
    const caller = appRouter.createCaller(context);

    const ocrResult = await caller.ocr.extractDocument({
      data: "ZmFrZS1pbWFnZS1ieXRlcw==",
      mimeType: "image/png",
    });
    await caller.poParsing.parseOcrText({ fullText: ocrResult.fullText });

    expect(createPoSpy).not.toHaveBeenCalled();
    expect(receiptSpy).not.toHaveBeenCalled();
    expect(inventorySpy).not.toHaveBeenCalled();
  });

  it("creates a purchase order only through explicit submission and keeps it Pending Approval", async () => {
    const createPoSpy = vi.spyOn(db, "createPurchaseOrderWithItems").mockResolvedValue(undefined);
    vi.spyOn(db, "createAuditLog").mockResolvedValue(undefined);
    vi.spyOn(db, "createPurchaseOrderHistory").mockResolvedValue(undefined);
    const receiptSpy = vi.spyOn(db, "createGoodsReceipt");
    const inventorySpy = vi.spyOn(db, "updateInventoryItem");
    const caller = appRouter.createCaller(context);

    await caller.purchaseOrders.create({
      vendorName: "Apex Pharma",
      vendorContactNumber: "9876543210",
      totalAmount: "120",
      items: [{ itemName: "Paracetamol 500mg", quantity: 10, unitPrice: "12" }],
    });

    expect(createPoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ approvalStatus: "Pending Approval", paymentStatus: "Pending" }),
      expect.any(Array),
    );
    expect(receiptSpy).not.toHaveBeenCalled();
    expect(inventorySpy).not.toHaveBeenCalled();
  });
});
