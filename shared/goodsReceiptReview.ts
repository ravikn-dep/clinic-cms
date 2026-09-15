import {
  createPurchaseOrderReviewPrefill,
  type PurchaseOrderReviewPrefill,
  type ReviewField,
} from "./poReviewPrefill";
import type { ParsedPurchaseDocument } from "../server/poParsing/types";

/**
 * Goods Receipt Scan keeps the canonical Purchase Order review shape so the
 * posting boundary can accept the same source-aware, editable fields. The
 * adapter adds only receipt-specific completeness warnings and date shaping.
 */
export type GoodsReceiptReviewPrefill = PurchaseOrderReviewPrefill;

function normalizeDateValue(value: string): string {
  const trimmed = value.trim();
  const dayFirst = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const yearFirst = trimmed.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (yearFirst) {
    const [, year, month, day] = yearFirst;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return trimmed;
}

function normalizeDateField(field: ReviewField): ReviewField {
  const normalized = normalizeDateValue(field.value);
  if (normalized === field.value) return field;
  return {
    ...field,
    value: normalized,
    extractedValue: normalized,
    edited: false,
  };
}

function addWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

/**
 * Maps the canonical Purchase Order review-prefill into the Goods Receipt
 * review contract. No database or inventory operation occurs here.
 */
export function createGoodsReceiptReviewPrefill(
  document: ParsedPurchaseDocument,
): GoodsReceiptReviewPrefill {
  const review = createPurchaseOrderReviewPrefill(document);
  const warnings = [...review.warnings];

  review.header.invoiceDate = normalizeDateField(review.header.invoiceDate);

  if (!review.header.vendorName.value.trim()) addWarning(warnings, "Receipt review: supplier name is required.");
  if (!review.header.invoiceNumber.value.trim()) addWarning(warnings, "Receipt review: receipt or invoice number is required.");
  if (!review.header.invoiceDate.value.trim()) addWarning(warnings, "Receipt review: receipt date is required.");
  if (document.documentType === "GST_INVOICE" && !review.header.vendorGstin.value.trim()) {
    addWarning(warnings, "Receipt review: GSTIN is missing from the GST invoice.");
  }

  review.items = review.items.map((line, index) => {
    const nextLine = {
      ...line,
      expiryDate: normalizeDateField(line.expiryDate),
    };
    if (!nextLine.description.value.trim()) addWarning(warnings, `Receipt line ${index + 1}: description is missing.`);
    if (!nextLine.quantity.value.trim()) addWarning(warnings, `Receipt line ${index + 1}: received quantity is required.`);
    if (!nextLine.unitPrice.value.trim()) addWarning(warnings, `Receipt line ${index + 1}: unit cost is required.`);
    if (!nextLine.batchNumber.value.trim()) addWarning(warnings, `Receipt line ${index + 1}: batch number is required for inventory traceability.`);
    if (!nextLine.expiryDate.value.trim()) addWarning(warnings, `Receipt line ${index + 1}: expiry date is required for inventory traceability.`);
    addWarning(warnings, `Receipt line ${index + 1}: map to a governed catalog medicine before posting.`);
    return nextLine;
  });

  return {
    ...review,
    warnings,
  };
}
