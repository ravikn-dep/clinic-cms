import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { suggestCatalogMatches } from "./catalogMatching/matcher";
import type { CatalogAliasRecord, CatalogRecord } from "./catalogMatching/types";
import { createPurchaseOrderReviewPrefill } from "@shared/poReviewPrefill";
import type { ParsedPurchaseDocument } from "./poParsing/types";

const catalogItems: CatalogRecord[] = [
  {
    catalogItemId: "catalog-paracetamol-650",
    canonicalName: "Paracetamol 650 mg Tablet",
    normalizedName: "paracetamol 650 mg tablet",
    genericName: "Paracetamol",
    brandName: "Dolo 650",
    strength: "650 mg",
    dosageForm: "Tablet",
    manufacturer: "Example Pharma",
    hsnCode: "30049099",
  },
  {
    catalogItemId: "catalog-amoxicillin-suspension",
    canonicalName: "Amoxicillin 250 mg/5 ml Suspension",
    normalizedName: "amoxicillin 250 mg 5 ml suspension",
    genericName: "Amoxicillin",
    brandName: null,
    strength: "250 mg/5 ml",
    dosageForm: "Suspension",
    manufacturer: null,
    hsnCode: "30041010",
  },
];

const aliases: CatalogAliasRecord[] = [
  { aliasId: "alias-dolo", catalogItemId: "catalog-paracetamol-650", vendorId: "", aliasText: "DOLO 650 TAB", normalizedAlias: "dolo 650 tablet" },
  { aliasId: "alias-vendor-dolo", catalogItemId: "catalog-paracetamol-650", vendorId: "vendor-1", aliasText: "D-650", normalizedAlias: "d 650" },
];

const parsedDocument: ParsedPurchaseDocument = {
  documentType: "GST_INVOICE",
  invoiceNumber: { value: "INV-CATALOG-1", confidence: "high", sourceText: "Invoice: INV-CATALOG-1" },
  invoiceDate: { value: "2026-08-22", confidence: "high", sourceText: "Date: 2026-08-22" },
  vendorName: { value: "Supplier One", confidence: "medium", sourceText: "SUPPLIER ONE" },
  vendorGstin: { value: "29AABCA1234F1Z5", confidence: "high", sourceText: "GSTIN: 29AABCA1234F1Z5" },
  subtotal: { value: 130, confidence: "high", sourceText: "Taxable: 130" },
  cgst: { value: 0, confidence: "low", sourceText: "" },
  sgst: { value: 0, confidence: "low", sourceText: "" },
  totalTax: { value: 0, confidence: "low", sourceText: "" },
  grandTotal: { value: 130, confidence: "high", sourceText: "Grand total: 130" },
  items: [{
    description: { value: "DOLO 650 TAB", confidence: "high", sourceText: "DOLO 650 TAB" },
    quantity: { value: 10, confidence: "high", sourceText: "10" },
    unitPrice: { value: 13, confidence: "high", sourceText: "13.00" },
    lineTotal: { value: 130, confidence: "high", sourceText: "130.00" },
  }],
  warnings: [],
  reconciliation: { lineTotalsMatch: true, subtotalMatches: true, taxMatches: true, grandTotalMatches: true },
};

const adminContext: TrpcContext = {
  user: {
    id: 52,
    openId: "catalog-admin",
    email: "admin@example.com",
    name: "Catalog Reviewer",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  req: {} as any,
  res: {} as any,
};

function reviewedInput(decision: "ACCEPTED" | "UNMATCHED" = "ACCEPTED") {
  return {
    vendorName: "Supplier One",
    vendorContactNumber: "9876543210",
    totalAmount: "130",
    items: [{ itemName: "DOLO 650 TAB", quantity: 10, unitPrice: "13" }],
    reviewSubmissionId: "e2a7799d-4a28-42e2-8c28-702aa95f8154",
    extractionProvider: "mock-ocr" as const,
    review: createPurchaseOrderReviewPrefill(parsedDocument),
    catalogResolutions: decision === "ACCEPTED"
      ? [{ lineIndex: 0, decision: "ACCEPTED" as const, catalogItemId: "catalog-paracetamol-650" }]
      : [{ lineIndex: 0, decision: "UNMATCHED" as const }],
  };
}

function mockCatalogReads() {
  vi.spyOn(db, "getActiveCatalogItems").mockResolvedValue(catalogItems as any);
  vi.spyOn(db, "getActiveCatalogItemAliases").mockResolvedValue(aliases as any);
}

describe("Phase 3 Step 5: safe supplier catalog matching", () => {
  afterEach(() => vi.restoreAllMocks());

  it("matches exact canonical normalized names, punctuation, case, and whitespace deterministically", () => {
    const matches = suggestCatalogMatches({ lineDescription: "  PARACETAMOL-650MG   TABLET  " }, catalogItems, aliases);
    expect(matches[0]).toMatchObject({ catalogItemId: "catalog-paracetamol-650", matchLevel: "EXACT", source: "CANONICAL_NAME" });
  });

  it("matches active global aliases and vendor-specific aliases without inferring clinical equivalence", () => {
    const globalAlias = suggestCatalogMatches({ lineDescription: "DOLO-650 TAB" }, catalogItems, aliases);
    const vendorAlias = suggestCatalogMatches({ lineDescription: "D 650", vendorId: "vendor-1" }, catalogItems, aliases);
    expect(globalAlias[0]).toMatchObject({ source: "ALIAS", matchLevel: "EXACT" });
    expect(vendorAlias[0]).toMatchObject({ source: "VENDOR_ALIAS", matchLevel: "EXACT" });
  });

  it("returns HSN-supported suggestions but exposes strength and dosage-form conflicts as POSSIBLE", () => {
    const hsnMatch = suggestCatalogMatches({ lineDescription: "Paracetamol 650 mg Tablet", hsnCode: "30049099" }, catalogItems, aliases);
    const strengthConflict = suggestCatalogMatches({ lineDescription: "Paracetamol 500 mg Tablet" }, catalogItems, aliases);
    const formConflict = suggestCatalogMatches({ lineDescription: "Amoxicillin 500 mg Capsule" }, catalogItems, aliases);
    expect(hsnMatch[0]?.reasons).toContain("HSN agreement");
    expect(strengthConflict[0]).toMatchObject({ matchLevel: "POSSIBLE" });
    expect(strengthConflict[0]?.conflicts).toContain("Strength mismatch");
    expect(formConflict[0]).toMatchObject({ matchLevel: "POSSIBLE" });
    expect(formConflict[0]?.conflicts).toContain("Dosage-form mismatch");
  });

  it("marks equally ranked candidates as POSSIBLE and returns no fabricated suggestion when no safe overlap exists", () => {
    const ambiguous = suggestCatalogMatches(
      { lineDescription: "Paracetamol 650 mg Tablet" },
      [
        { ...catalogItems[0], catalogItemId: "catalog-paracetamol-brand-a", canonicalName: "Paracetamol 650 mg Tablet Brand A" },
        { ...catalogItems[0], catalogItemId: "catalog-paracetamol-brand-b", canonicalName: "Paracetamol 650 mg Tablet Brand B" },
      ],
      aliases,
    );
    const noMatch = suggestCatalogMatches({ lineDescription: "Orthopedic implant screw" }, catalogItems, aliases);
    expect(ambiguous.filter((match) => match.matchLevel === "POSSIBLE").length).toBeGreaterThan(1);
    expect(ambiguous[0]?.conflicts).toContain("Multiple equally ranked candidates require selection");
    expect(noMatch).toEqual([]);
  });

  it("keeps the matching endpoint read-only and prevents inventory, PO, receipt, stock, or alias writes", async () => {
    mockCatalogReads();
    const createPoSpy = vi.spyOn(db, "createPurchaseOrderWithItemsAndExtractionReview");
    const inventorySpy = vi.spyOn(db, "updateInventoryItem");
    const receiptSpy = vi.spyOn(db, "createGoodsReceipt");
    const caller = appRouter.createCaller(adminContext);

    const result = await caller.catalogMatching.suggestMatches({ lineDescription: "DOLO 650 TAB" });

    expect(result[0]).toMatchObject({ catalogItemId: "catalog-paracetamol-650" });
    expect(createPoSpy).not.toHaveBeenCalled();
    expect(inventorySpy).not.toHaveBeenCalled();
    expect(receiptSpy).not.toHaveBeenCalled();
  });

  it("requires explicit accepted confirmation before linking a PO line and preserves extracted and reviewed provenance", async () => {
    mockCatalogReads();
    vi.spyOn(db, "getPurchaseOrderExtractionReviewBySubmissionId").mockResolvedValue(null);
    const createSpy = vi.spyOn(db, "createPurchaseOrderWithItemsAndExtractionReview").mockResolvedValue(undefined as never);
    const receiptSpy = vi.spyOn(db, "createGoodsReceipt");
    const inventorySpy = vi.spyOn(db, "updateInventoryItem");
    const caller = appRouter.createCaller(adminContext);

    const result = await caller.purchaseOrders.createFromReviewedExtraction(reviewedInput());
    const [purchaseOrder, items, persistence] = createSpy.mock.calls[0];
    const resolutions = JSON.parse(String(persistence.review.catalogResolutionsJson));

    expect(result.approvalStatus).toBe("Pending Approval");
    expect(purchaseOrder.approvalStatus).toBe("Pending Approval");
    expect(items[0]?.catalogItemId).toBe("catalog-paracetamol-650");
    expect(resolutions[0]).toMatchObject({
      decision: "ACCEPTED",
      catalogItemId: "catalog-paracetamol-650",
      canonicalName: "Paracetamol 650 mg Tablet",
      originalExtractedDescription: "DOLO 650 TAB",
      reviewedDescription: "DOLO 650 TAB",
    });
    expect(receiptSpy).not.toHaveBeenCalled();
    expect(inventorySpy).not.toHaveBeenCalled();
  });

  it("permits an explicitly unmatched line without a catalog link and rejects a conflicted selection", async () => {
    mockCatalogReads();
    vi.spyOn(db, "getPurchaseOrderExtractionReviewBySubmissionId").mockResolvedValue(null);
    const createSpy = vi.spyOn(db, "createPurchaseOrderWithItemsAndExtractionReview").mockResolvedValue(undefined as never);
    const caller = appRouter.createCaller(adminContext);

    await caller.purchaseOrders.createFromReviewedExtraction(reviewedInput("UNMATCHED"));
    expect(createSpy.mock.calls[0][1][0]?.catalogItemId).toBeUndefined();

    const conflict = reviewedInput();
    conflict.items[0].itemName = "Paracetamol 500 mg Tablet";
    conflict.review.items[0].description.value = "Paracetamol 500 mg Tablet";
    await expect(caller.purchaseOrders.createFromReviewedExtraction({ ...conflict, reviewSubmissionId: "45f9f877-2d45-45ad-9eec-e15ee0eb2c1a" })).rejects.toThrow("conflicts cannot be accepted");
  });

  it("rejects non-purchase-order roles and verifies alias duplicate prevention is part of the migration", async () => {
    const userCaller = appRouter.createCaller({ ...adminContext, user: { ...adminContext.user!, role: "user" } });
    await expect(userCaller.catalogMatching.suggestMatches({ lineDescription: "DOLO 650 TAB" })).rejects.toThrow("permission");

    const migration = fs.readFileSync(path.join(process.cwd(), "drizzle/0022_motionless_quicksilver.sql"), "utf8");
    expect(migration).toContain("catalogItemAliases_vendor_alias_unique");
    expect(migration).toContain("catalogItems_normalizedName_unique");
  });
});
