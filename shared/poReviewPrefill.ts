import type { ParsedField, ParsedPoLine, ParsedPurchaseDocument } from "../server/poParsing/types";

export type ReviewConfidence = "high" | "medium" | "low";

export type ReviewField = {
  value: string;
  extractedValue: string;
  sourceText?: string;
  confidence: ReviewConfidence;
  warnings: string[];
  edited: boolean;
};

export type PurchaseOrderReviewLine = {
  description: ReviewField;
  hsnCode: ReviewField;
  batchNumber: ReviewField;
  expiryDate: ReviewField;
  quantity: ReviewField;
  unitPrice: ReviewField;
  discount: ReviewField;
  gstRate: ReviewField;
  taxableAmount: ReviewField;
  lineTotal: ReviewField;
};

export type PurchaseOrderReviewPrefill = {
  documentType: ParsedPurchaseDocument["documentType"];
  header: {
    invoiceNumber: ReviewField;
    invoiceDate: ReviewField;
    vendorName: ReviewField;
    vendorGstin: ReviewField;
  };
  totals: {
    subtotal: ReviewField;
    cgst: ReviewField;
    sgst: ReviewField;
    igst: ReviewField;
    totalTax: ReviewField;
    grandTotal: ReviewField;
  };
  items: PurchaseOrderReviewLine[];
  warnings: string[];
  reconciliation: ParsedPurchaseDocument["reconciliation"];
  requiresExplicitSubmission: true;
};

const valueAsString = (value: unknown) => (value === null || value === undefined ? "" : String(value));

export function toReviewField<T>(field?: ParsedField<T>): ReviewField {
  const extractedValue = valueAsString(field?.value);
  return {
    value: extractedValue,
    extractedValue,
    sourceText: field?.sourceText,
    confidence: field?.confidence ?? "low",
    warnings: field?.warnings ?? [],
    edited: false,
  };
}

function toReviewLine(line: ParsedPoLine): PurchaseOrderReviewLine {
  return {
    description: toReviewField(line.description),
    hsnCode: toReviewField(line.hsnCode),
    batchNumber: toReviewField(line.batchNumber),
    expiryDate: toReviewField(line.expiryDate),
    quantity: toReviewField(line.quantity),
    unitPrice: toReviewField(line.unitPrice),
    discount: toReviewField(line.discount),
    gstRate: toReviewField(line.gstRate),
    taxableAmount: toReviewField(line.taxableAmount),
    lineTotal: toReviewField(line.lineTotal),
  };
}

export function reconciliationWarnings(document: ParsedPurchaseDocument): string[] {
  const warnings = [...document.warnings];
  const { reconciliation } = document;

  if (reconciliation.lineTotalsMatch === false) warnings.push("Line totals do not reconcile with quantity and unit price.");
  if (reconciliation.subtotalMatches === false) warnings.push("Subtotal does not reconcile with the extracted line totals.");
  if (reconciliation.taxMatches === false) warnings.push("Tax values do not reconcile with the extracted subtotal.");
  if (reconciliation.grandTotalMatches === false) {
    warnings.push(`Grand total does not reconcile${reconciliation.delta === undefined ? "." : ` (difference: ₹${reconciliation.delta.toFixed(2)}).`}`);
  }

  if (!document.invoiceNumber.value) warnings.push("Missing invoice or purchase order number.");
  if (!document.vendorName.value) warnings.push("Missing vendor name.");
  if (document.documentType === "GST_INVOICE" && !document.vendorGstin.value) warnings.push("Missing GSTIN for the extracted GST invoice.");

  document.items.forEach((item, index) => {
    if (!item.quantity.value) warnings.push(`Line ${index + 1}: missing quantity.`);
    if (!item.unitPrice.value && item.unitPrice.value !== 0) warnings.push(`Line ${index + 1}: missing unit price.`);
  });

  return Array.from(new Set(warnings));
}

export function createPurchaseOrderReviewPrefill(document: ParsedPurchaseDocument): PurchaseOrderReviewPrefill {
  return {
    documentType: document.documentType,
    header: {
      invoiceNumber: toReviewField(document.invoiceNumber),
      invoiceDate: toReviewField(document.invoiceDate),
      vendorName: toReviewField(document.vendorName),
      vendorGstin: toReviewField(document.vendorGstin),
    },
    totals: {
      subtotal: toReviewField(document.subtotal),
      cgst: toReviewField(document.cgst),
      sgst: toReviewField(document.sgst),
      igst: toReviewField(document.igst),
      totalTax: toReviewField(document.totalTax),
      grandTotal: toReviewField(document.grandTotal),
    },
    items: document.items.map(toReviewLine),
    warnings: reconciliationWarnings(document),
    reconciliation: document.reconciliation,
    requiresExplicitSubmission: true,
  };
}

export function updateReviewField(field: ReviewField, value: string): ReviewField {
  return {
    ...field,
    value,
    edited: value !== field.extractedValue,
  };
}

export function qualitativeConfidenceLabel(confidence: ReviewConfidence): "HIGH" | "MEDIUM" | "LOW" {
  return confidence.toUpperCase() as "HIGH" | "MEDIUM" | "LOW";
}
