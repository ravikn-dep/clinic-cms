import { nanoid } from "nanoid";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { suggestCatalogMatches } from "./catalogMatching/matcher";
import type { PurchaseOrderReviewPrefill } from "../shared/poReviewPrefill";
import type { CatalogResolutionDecision } from "../shared/catalogResolution";
import * as utils from "./utils";

const reviewFieldSchema = z.object({
  value: z.string().max(2_000),
  extractedValue: z.string().max(2_000),
  sourceText: z.string().max(2_000).optional(),
  confidence: z.enum(["high", "medium", "low"]),
  warnings: z.array(z.string().max(500)).max(50),
  edited: z.boolean(),
});

const purchaseOrderReviewPrefillSchema = z.object({
  documentType: z.enum(["PURCHASE_ORDER", "GST_INVOICE", "UNKNOWN"]),
  header: z.object({
    invoiceNumber: reviewFieldSchema,
    invoiceDate: reviewFieldSchema,
    vendorName: reviewFieldSchema,
    vendorGstin: reviewFieldSchema,
  }),
  totals: z.object({
    subtotal: reviewFieldSchema,
    cgst: reviewFieldSchema,
    sgst: reviewFieldSchema,
    igst: reviewFieldSchema,
    totalTax: reviewFieldSchema,
    grandTotal: reviewFieldSchema,
  }),
  items: z.array(z.object({
    description: reviewFieldSchema,
    hsnCode: reviewFieldSchema,
    batchNumber: reviewFieldSchema,
    expiryDate: reviewFieldSchema,
    quantity: reviewFieldSchema,
    unitPrice: reviewFieldSchema,
    discount: reviewFieldSchema,
    gstRate: reviewFieldSchema,
    taxableAmount: reviewFieldSchema,
    lineTotal: reviewFieldSchema,
  })).max(100),
  warnings: z.array(z.string().max(500)).max(100),
  reconciliation: z.object({
    lineTotalsMatch: z.boolean().nullable(),
    subtotalMatches: z.boolean().nullable(),
    taxMatches: z.boolean().nullable(),
    grandTotalMatches: z.boolean().nullable(),
    delta: z.number().finite().optional(),
  }),
  requiresExplicitSubmission: z.literal(true),
});

const catalogResolutionInputSchema = z.object({
  lineIndex: z.number().int().min(0).max(99),
  decision: z.enum(["ACCEPTED", "UNMATCHED"]),
  catalogItemId: z.string().min(1).max(50).optional(),
}).superRefine((value, ctx) => {
  if (value.decision === "ACCEPTED" && !value.catalogItemId) {
    ctx.addIssue({ code: "custom", message: "An accepted catalog match requires a catalog item" });
  }
  if (value.decision === "UNMATCHED" && value.catalogItemId) {
    ctx.addIssue({ code: "custom", message: "An unmatched decision cannot include a catalog item" });
  }
});

async function requirePurchaseOrderAccess(user: { role: "user" | "admin" | "consultant" | "staff" }) {
  if (user.role === "user" || !(await db.checkFeatureAccess(user.role, "purchase_orders"))) {
    throw new Error("You do not have permission to access purchase-order evidence");
  }
}

async function buildCatalogResolutionEvidence(
  decisions: z.infer<typeof catalogResolutionInputSchema>[],
  review: PurchaseOrderReviewPrefill,
  confirmedAt: string,
): Promise<{ resolutions: CatalogResolutionDecision[]; catalogItemIdsByLineIndex: Map<number, string> }> {
  const uniqueLineIndices = new Set<number>();
  for (const decision of decisions) {
    if (uniqueLineIndices.has(decision.lineIndex)) throw new Error("Each review line can have only one catalog decision");
    uniqueLineIndices.add(decision.lineIndex);
    if (!review.items[decision.lineIndex]) throw new Error("Catalog decision references an unavailable review line");
  }

  const catalogItems = await db.getActiveCatalogItems();
  const aliases = await db.getActiveCatalogItemAliases();
  const resolutions: CatalogResolutionDecision[] = [];
  const catalogItemIdsByLineIndex = new Map<number, string>();

  for (const decision of decisions) {
    const line = review.items[decision.lineIndex];
    const base = {
      lineIndex: decision.lineIndex,
      originalExtractedDescription: line.description.extractedValue,
      reviewedDescription: line.description.value,
      decision: decision.decision,
      reasons: [] as string[],
      conflicts: [] as string[],
      confirmedAt,
    };
    if (decision.decision === "UNMATCHED") {
      resolutions.push(base);
      continue;
    }

    const candidates = suggestCatalogMatches({
      lineDescription: line.description.value,
      hsnCode: line.hsnCode.value || undefined,
    }, catalogItems, aliases);
    const selected = candidates.find((candidate) => candidate.catalogItemId === decision.catalogItemId);
    if (!selected) throw new Error("The selected catalog item is not a current safe suggestion for this reviewed line");
    if (selected.conflicts.length > 0) throw new Error("A catalog match with strength, form, HSN, or ambiguity conflicts cannot be accepted");

    catalogItemIdsByLineIndex.set(decision.lineIndex, selected.catalogItemId);
    resolutions.push({
      ...base,
      decision: "ACCEPTED",
      catalogItemId: selected.catalogItemId,
      canonicalName: selected.canonicalName,
      matchLevel: selected.matchLevel,
      source: selected.source,
      reasons: selected.reasons,
      conflicts: selected.conflicts,
    });
  }

  return { resolutions, catalogItemIdsByLineIndex };
}

export const goodsReceiptScanRouter = router({
  postReviewedReceipt: protectedProcedure
    .input(z.object({
      reviewSubmissionId: z.string().uuid(),
      review: purchaseOrderReviewPrefillSchema,
      catalogDecisions: z.array(catalogResolutionInputSchema).min(1).max(100),
    }))
    .mutation(async ({ input, ctx }) => {
      await requirePurchaseOrderAccess(ctx.user);
      if (input.catalogDecisions.length !== input.review.items.length) {
        throw new Error("Every scanned receipt line must have an explicit catalog decision before inventory can be updated");
      }

      const receiptNumber = input.review.header.invoiceNumber.value.trim();
      const receiptDate = input.review.header.invoiceDate.value.trim();
      const vendorName = input.review.header.vendorName.value.trim();
      if (!receiptNumber || !receiptDate || !vendorName) {
        throw new Error("Supplier name, receipt number, and receipt date must be reviewed before posting");
      }

      const confirmedAt = utils.toMysqlDateTime();
      const { resolutions, catalogItemIdsByLineIndex } = await buildCatalogResolutionEvidence(
        input.catalogDecisions,
        input.review as PurchaseOrderReviewPrefill,
        confirmedAt,
      );
      if (catalogItemIdsByLineIndex.size !== input.review.items.length) {
        throw new Error("Unmatched receipt lines cannot update inventory; select a governed catalog item for each line");
      }

      const lines = input.review.items.map((line, lineIndex) => {
        const receivedQuantity = Number(line.quantity.value);
        const unitCost = Number(line.unitPrice.value);
        if (!Number.isInteger(receivedQuantity) || receivedQuantity <= 0) throw new Error(`Line ${lineIndex + 1} requires a positive whole quantity`);
        if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error(`Line ${lineIndex + 1} requires a valid unit price`);
        if (!line.batchNumber.value.trim() || !line.expiryDate.value.trim()) throw new Error(`Line ${lineIndex + 1} requires a batch number and expiry date`);
        return {
          lineNumber: lineIndex + 1,
          catalogItemId: catalogItemIdsByLineIndex.get(lineIndex)!,
          extractedDescription: line.description.extractedValue || line.description.value,
          batchNumber: line.batchNumber.value.trim(),
          expiryDate: line.expiryDate.value.trim(),
          receivedQuantity,
          unitCost: unitCost.toFixed(2),
        };
      });

      return db.createScannedGoodsReceipt({
        receiptId: `GRS-${nanoid(16)}`,
        reviewSubmissionId: input.reviewSubmissionId,
        receiptNumber,
        receiptDate,
        vendorName,
        vendorGstin: input.review.header.vendorGstin.value.trim() || null,
        documentType: input.review.documentType,
        reviewJson: JSON.stringify({ review: input.review, resolutions }),
        warningsJson: JSON.stringify(input.review.warnings),
        receivedBy: String(ctx.user.id),
        lines,
      });
    }),
});
