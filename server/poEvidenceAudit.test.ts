import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { setOcrProvider } from "./ocr/provider";
import type { OcrProvider } from "./ocr/types";
import { createPurchaseOrderReviewPrefill, updateReviewField } from "@shared/poReviewPrefill";
import { applySubmittedPurchaseOrderValues, createExtractionReviewEvidence } from "@shared/poExtractionReview";
import type { ParsedPurchaseDocument } from "./poParsing/types";

const adminContext: TrpcContext = {
  user: {
    id: 44,
    openId: "phase3-step4-admin",
    email: "doctor@example.com",
    name: "Dr Evidence",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  req: {} as any,
  res: {} as any,
};

const userContext: TrpcContext = {
  ...adminContext,
  user: { ...adminContext.user!, role: "user" },
};

const parsedDocument: ParsedPurchaseDocument = {
  documentType: "GST_INVOICE",
  invoiceNumber: { value: "INV-STEP4", confidence: "high", sourceText: "Invoice No: INV-STEP4" },
  invoiceDate: { value: "2026-08-22", confidence: "high", sourceText: "Date: 2026-08-22" },
  vendorName: { value: "Apex Pharma", confidence: "medium", sourceText: "APEX PHARMA DISTRIBUTORS" },
  vendorGstin: { value: "29AABCA1234F1Z5", confidence: "high", sourceText: "GSTIN: 29AABCA1234F1Z5" },
  subtotal: { value: 120, confidence: "medium", sourceText: "Taxable Value: 120.00" },
  cgst: { value: 6, confidence: "medium", sourceText: "CGST: 6.00" },
  sgst: { value: 6, confidence: "medium", sourceText: "SGST: 6.00" },
  totalTax: { value: 12, confidence: "medium", sourceText: "Total Tax: 12.00" },
  grandTotal: { value: 132, confidence: "high", sourceText: "Grand Total: 132.00" },
  items: [{
    description: { value: "Paracetamol 500mg", confidence: "high", sourceText: "Paracetamol 500mg" },
    quantity: { value: 10, confidence: "high", sourceText: "10" },
    unitPrice: { value: 12, confidence: "high", sourceText: "12.00" },
    lineTotal: { value: 120, confidence: "high", sourceText: "120.00" },
  }],
  warnings: ["GSTIN was matched from OCR text."],
  reconciliation: {
    lineTotalsMatch: true,
    subtotalMatches: true,
    taxMatches: true,
    grandTotalMatches: true,
  },
};

function createReviewedInput() {
  const review = createPurchaseOrderReviewPrefill(parsedDocument);
  review.header.vendorName = updateReviewField(review.header.vendorName, "Apex Pharma Private Limited");
  return {
    vendorName: "Apex Pharma Private Limited",
    vendorContactNumber: "9876543210",
    totalAmount: "120",
    items: [{ itemName: "Paracetamol 500mg", quantity: 10, unitPrice: "12" }],
    authorizationNotes: "Reviewed by clinician",
    reviewSubmissionId: "b6f4ab21-74e7-4b36-9ac9-3ef4cf98300d",
    extractionProvider: "mock-ocr" as const,
    review,
  };
}

describe("Phase 3 Step 4: reviewed extraction evidence persistence", () => {
  afterEach(() => {
    setOcrProvider(null);
    vi.restoreAllMocks();
  });

  it("keeps OCR, deterministic parsing, and review editing free of PO or evidence writes", async () => {
    const provider: OcrProvider = {
      async extractDocument() {
        return { provider: "mock-ocr", fullText: "GST INVOICE\nApex Pharma\nGrand Total: 132.00", pages: [] };
      },
    };
    setOcrProvider(provider);
    const createPoSpy = vi.spyOn(db, "createPurchaseOrderWithItemsAndExtractionReview");
    const receiptSpy = vi.spyOn(db, "createGoodsReceipt");
    const inventorySpy = vi.spyOn(db, "updateInventoryItem");
    const caller = appRouter.createCaller(adminContext);

    const ocr = await caller.ocr.extractDocument({ data: "ZmFrZQ==", mimeType: "image/png" });
    const parsed = await caller.poParsing.parseOcrText({ fullText: ocr.fullText });
    const review = createPurchaseOrderReviewPrefill(parsed);
    review.header.vendorName = updateReviewField(review.header.vendorName, "Corrected vendor");

    expect(createPoSpy).not.toHaveBeenCalled();
    expect(receiptSpy).not.toHaveBeenCalled();
    expect(inventorySpy).not.toHaveBeenCalled();
  });

  it("creates one Pending Approval PO with a linked immutable evidence snapshot only through explicit reviewed submission", async () => {
    const createSpy = vi.spyOn(db, "createPurchaseOrderWithItemsAndExtractionReview").mockResolvedValue(undefined as never);
    const receiptSpy = vi.spyOn(db, "createGoodsReceipt");
    const inventorySpy = vi.spyOn(db, "updateInventoryItem");
    vi.spyOn(db, "getPurchaseOrderExtractionReviewBySubmissionId").mockResolvedValue(null);
    const caller = appRouter.createCaller(adminContext);

    const result = await caller.purchaseOrders.createFromReviewedExtraction(createReviewedInput());

    expect(result.approvalStatus).toBe("Pending Approval");
    expect(result.evidenceRecorded).toBe(true);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ approvalStatus: "Pending Approval", paymentStatus: "Pending" }),
      expect.any(Array),
      expect.objectContaining({
        review: expect.objectContaining({ purchaseOrderId: result.purchaseOrderId, reviewStatus: "CONFIRMED", reviewerUserId: "44" }),
      }),
    );
    expect(receiptSpy).not.toHaveBeenCalled();
    expect(inventorySpy).not.toHaveBeenCalled();
  });

  it("persists extracted values, source text, corrections, final values, qualitative confidence, and reconciliation separately", () => {
    const review = createReviewedInput().review;
    const evidence = createExtractionReviewEvidence(review);

    expect(evidence.extractedHeader.vendorName).toMatchObject({
      extractedValue: "Apex Pharma",
      sourceText: "APEX PHARMA DISTRIBUTORS",
      confidence: "medium",
    });
    expect(evidence.correctedFields).toContainEqual({
      field: "header.vendorName",
      extractedValue: "Apex Pharma",
      finalValue: "Apex Pharma Private Limited",
    });
    expect(evidence.finalReviewedValues.header.vendorName).toBe("Apex Pharma Private Limited");
    expect(evidence.warnings).toContain("GSTIN was matched from OCR text.");
    expect(evidence.reconciliation.grandTotalMatches).toBe(true);
  });

  it("uses server-validated submitted form values as the final evidence values without replacing extracted provenance", () => {
    const review = createReviewedInput().review;
    const finalReview = applySubmittedPurchaseOrderValues(review, {
      vendorName: "Apex Pharma Final Name",
      vendorGSTNumber: "29AABCA1234F1Z5",
      items: [{ itemName: "Paracetamol 650mg", quantity: 12, unitPrice: "13" }],
    });
    const evidence = createExtractionReviewEvidence(finalReview);

    expect(evidence.extractedHeader.vendorName).toMatchObject({
      extractedValue: "Apex Pharma",
      sourceText: "APEX PHARMA DISTRIBUTORS",
    });
    expect(evidence.finalReviewedValues.header.vendorName).toBe("Apex Pharma Final Name");
    expect(evidence.finalReviewedValues.items[0]).toMatchObject({
      description: "Paracetamol 650mg",
      quantity: "12",
      unitPrice: "13",
    });
    expect(evidence.correctedFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "header.vendorName", finalValue: "Apex Pharma Final Name" }),
      expect.objectContaining({ field: "items.0.description", finalValue: "Paracetamol 650mg" }),
    ]));
  });

  it("derives reviewer identity and Pending Approval status from server-controlled values", async () => {
    const createSpy = vi.spyOn(db, "createPurchaseOrderWithItemsAndExtractionReview").mockResolvedValue(undefined as never);
    vi.spyOn(db, "getPurchaseOrderExtractionReviewBySubmissionId").mockResolvedValue(null);
    const caller = appRouter.createCaller(adminContext);
    const forgedInput = {
      ...createReviewedInput(),
      reviewerUserId: "forged-reviewer",
      approvalStatus: "Approved",
    } as any;

    await caller.purchaseOrders.createFromReviewedExtraction(forgedInput);

    const [, , persistence] = createSpy.mock.calls[0];
    const [po] = createSpy.mock.calls[0];
    expect(persistence.review.reviewerUserId).toBe("44");
    expect(po.approvalStatus).toBe("Pending Approval");
  });

  it("rejects replayed review submission identifiers without creating a PO or evidence", async () => {
    const createSpy = vi.spyOn(db, "createPurchaseOrderWithItemsAndExtractionReview");
    vi.spyOn(db, "getPurchaseOrderExtractionReviewBySubmissionId").mockResolvedValue({ reviewId: "existing" } as any);
    const caller = appRouter.createCaller(adminContext);

    await expect(caller.purchaseOrders.createFromReviewedExtraction(createReviewedInput())).rejects.toThrow("already been submitted");
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("fails the explicit reviewed submission when the atomic PO-and-evidence write fails", async () => {
    const createSpy = vi.spyOn(db, "createPurchaseOrderWithItemsAndExtractionReview").mockRejectedValue(new Error("transaction failed"));
    const receiptSpy = vi.spyOn(db, "createGoodsReceipt");
    const inventorySpy = vi.spyOn(db, "updateInventoryItem");
    vi.spyOn(db, "getPurchaseOrderExtractionReviewBySubmissionId").mockResolvedValue(null);
    const caller = appRouter.createCaller(adminContext);

    await expect(caller.purchaseOrders.createFromReviewedExtraction(createReviewedInput())).rejects.toThrow("Unable to create the reviewed purchase order and its evidence record");
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(receiptSpy).not.toHaveBeenCalled();
    expect(inventorySpy).not.toHaveBeenCalled();
  });

  it("rejects unrecognized provider labels before any PO or evidence write", async () => {
    const createSpy = vi.spyOn(db, "createPurchaseOrderWithItemsAndExtractionReview");
    const caller = appRouter.createCaller(adminContext);
    const unsafeInput = { ...createReviewedInput(), extractionProvider: "credential-path:/secret" } as any;

    await expect(caller.purchaseOrders.createFromReviewedExtraction(unsafeInput)).rejects.toThrow();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("provides read-only evidence retrieval only to authenticated users with purchase-order access", async () => {
    vi.spyOn(db, "getPurchaseOrderById").mockResolvedValue({ purchaseOrderId: "po-1" } as any);
    vi.spyOn(db, "getPurchaseOrderExtractionReview").mockResolvedValue({ reviewId: "review-1", purchaseOrderId: "po-1" } as any);
    const adminCaller = appRouter.createCaller(adminContext);
    await expect(adminCaller.purchaseOrders.getExtractionReview({ purchaseOrderId: "po-1" })).resolves.toMatchObject({ reviewId: "review-1" });

    const userCaller = appRouter.createCaller(userContext);
    await expect(userCaller.purchaseOrders.getExtractionReview({ purchaseOrderId: "po-1" })).rejects.toThrow("permission");
  });

  it("stores structured field-level provenance rather than raw OCR full text and requires baseline constraints", () => {
    const evidence = createExtractionReviewEvidence(createReviewedInput().review);
    expect(JSON.stringify(evidence)).not.toContain("fullText");

    const baseline = fs.readFileSync(path.join(process.cwd(), "drizzle/baseline/current_schema.sql"), "utf8");
    expect(baseline).toContain("CREATE TABLE `purchaseOrderExtractionReviews`");
    expect(baseline).toContain("CONSTRAINT `purchaseOrderExtractionReviews_reviewId` PRIMARY KEY(`reviewId`)");
    expect(baseline).toContain("CONSTRAINT `purchaseOrderExtractionReviews_purchaseOrder_unique` UNIQUE(`purchaseOrderId`)");
    expect(baseline).toContain("CONSTRAINT `purchaseOrderExtractionReviews_submission_unique` UNIQUE(`reviewSubmissionId`)");
  });
});
