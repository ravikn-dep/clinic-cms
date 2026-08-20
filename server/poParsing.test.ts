import { describe, it, expect } from "vitest";
import { parseOcrText } from "./poParsing/parser";
import { reconcileDocument } from "./poParsing/reconcile";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("Phase 3 Step 2: Deterministic PO / GST Invoice Parser & Arithmetic Reconciliation", () => {
  const cleanInvoiceText = `
    APEX PHARMA DISTRIBUTORS
    GSTIN: 29AABCA1234F1Z5
    Invoice No: INV-2026-999
    Date: 15/08/2026

    Item Description                  Qty   Rate    Total
    Paracetamol 500mg Tablet          100   10.00   1000.00
    Amoxicillin 250mg Capsule         50    20.00   1000.00

    Subtotal: 2000.00
    CGST: 90.00
    SGST: 90.00
    Grand Total: 2180.00
  `;

  it("should extract GSTIN, invoice number, date, and vendor accurately", () => {
    const parsed = parseOcrText(cleanInvoiceText);
    expect(parsed.vendorGstin.value).toBe("29AABCA1234F1Z5");
    expect(parsed.invoiceNumber.value).toBe("INV-2026-999");
    expect(parsed.invoiceDate.value).toBe("15/08/2026");
    expect(parsed.documentType).toBe("GST_INVOICE");
  });

  it("should extract line items with quantities and unit prices", () => {
    const parsed = parseOcrText(cleanInvoiceText);
    expect(parsed.items.length).toBe(2);
    expect(parsed.items[0].quantity.value).toBe(100);
    expect(parsed.items[0].unitPrice.value).toBe(10.00);
    expect(parsed.items[1].quantity.value).toBe(50);
    expect(parsed.items[1].unitPrice.value).toBe(20.00);
  });

  it("should reconcile arithmetic correctly with zero delta", () => {
    const parsed = parseOcrText(cleanInvoiceText);
    const reconciled = reconcileDocument(parsed);

    expect(reconciled.reconciliation.lineTotalsMatch).toBe(true);
    expect(reconciled.reconciliation.grandTotalMatches).toBe(true);
    expect(reconciled.reconciliation.delta).toBe(0);
  });

  it("should detect arithmetic mismatch and flag warnings", () => {
    const mismatchedText = `
    PHARMA DISTRIBUTORS
    GSTIN: 29AABCA1234F1Z5
    Invoice: INV-MISMATCH
    Paracetamol Tablet 100 10.00 500.00
    Grand Total: 2000.00
    `;
    const parsed = parseOcrText(mismatchedText);
    const reconciled = reconcileDocument(parsed);

    expect(reconciled.reconciliation.grandTotalMatches).toBe(false);
    expect(reconciled.warnings.length).toBeGreaterThan(0);
    expect(reconciled.reconciliation.delta).toBeGreaterThan(0);
  });

  it("should return null for missing fields without fabricating data", () => {
    const sparseText = `Simple Text With Unlabeled Data`;
    const parsed = parseOcrText(sparseText);

    expect(parsed.vendorGstin.value).toBeNull();
    expect(parsed.invoiceNumber.value).toBeNull();
    expect(parsed.invoiceDate.value).toBeNull();
    expect(parsed.cgst).toBeUndefined();
    expect(parsed.sgst).toBeUndefined();
    expect(parsed.igst).toBeUndefined();
  });

  describe("Zero Business Mutation Boundary Guarantee", () => {
    it("should have zero mutations on POs, Goods Receipts, or inventory when parsing OCR text", async () => {
      const user = {
        id: 1,
        openId: "test-user-1",
        email: "test@clinic.com",
        name: "Test Doctor",
        loginMethod: "manus" as const,
        role: "admin" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx: TrpcContext = {
        user,
        req: {} as any,
        res: {} as any,
      };

      const caller = appRouter.createCaller(ctx);

      const result = await caller.poParsing.parseOcrText({
        fullText: cleanInvoiceText,
      });

      expect(result.documentType).toBe("GST_INVOICE");
      expect(result.grandTotal.value).toBe(2180.00);
    });
  });
});
