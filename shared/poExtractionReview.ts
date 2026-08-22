import type { PurchaseOrderReviewLine, PurchaseOrderReviewPrefill, ReviewField } from "./poReviewPrefill";

export type CorrectedExtractionField = {
  field: string;
  extractedValue: string;
  finalValue: string;
};

export type SubmittedPurchaseOrderValues = {
  vendorName: string;
  vendorGSTNumber?: string;
  items: Array<{ itemName: string; quantity: number; unitPrice: string }>;
};

type ExtractedFieldEvidence = {
  extractedValue: string;
  sourceText?: string;
  confidence: "high" | "medium" | "low";
  warnings: string[];
};

function extractedFieldEvidence(field: ReviewField): ExtractedFieldEvidence {
  return {
    extractedValue: field.extractedValue,
    ...(field.sourceText ? { sourceText: field.sourceText } : {}),
    confidence: field.confidence,
    warnings: [...field.warnings],
  };
}

function finalFieldValue(field: ReviewField): string {
  return field.value;
}

function fieldFromSubmittedValue(field: ReviewField, value: string): ReviewField {
  return { ...field, value, edited: value !== field.extractedValue };
}

function emptyReviewField(): ReviewField {
  return { value: "", extractedValue: "", confidence: "low", warnings: [], edited: false };
}

function emptyReviewLine(): PurchaseOrderReviewLine {
  return {
    description: emptyReviewField(),
    hsnCode: emptyReviewField(),
    batchNumber: emptyReviewField(),
    expiryDate: emptyReviewField(),
    quantity: emptyReviewField(),
    unitPrice: emptyReviewField(),
    discount: emptyReviewField(),
    gstRate: emptyReviewField(),
    taxableAmount: emptyReviewField(),
    lineTotal: emptyReviewField(),
  };
}

/**
 * The user can continue editing supported PO form fields after review. Derive
 * their authoritative final values from the server-validated submission while
 * retaining the original extracted evidence in the review snapshot.
 */
export function applySubmittedPurchaseOrderValues(
  review: PurchaseOrderReviewPrefill,
  submitted: SubmittedPurchaseOrderValues,
): PurchaseOrderReviewPrefill {
  return {
    ...review,
    header: {
      ...review.header,
      vendorName: fieldFromSubmittedValue(review.header.vendorName, submitted.vendorName),
      vendorGstin: fieldFromSubmittedValue(review.header.vendorGstin, submitted.vendorGSTNumber ?? ""),
    },
    items: submitted.items.map((item, index) => {
      const existing = review.items[index] ?? emptyReviewLine();
      return {
        ...existing,
        description: fieldFromSubmittedValue(existing.description, item.itemName),
        quantity: fieldFromSubmittedValue(existing.quantity, String(item.quantity)),
        unitPrice: fieldFromSubmittedValue(existing.unitPrice, item.unitPrice),
      };
    }),
  };
}

function collectCorrections(
  fields: Record<string, ReviewField>,
  prefix: string,
): CorrectedExtractionField[] {
  return Object.entries(fields)
    .filter(([, field]) => field.edited)
    .map(([fieldName, field]) => ({
      field: `${prefix}.${fieldName}`,
      extractedValue: field.extractedValue,
      finalValue: field.value,
    }));
}

/**
 * Creates the immutable structured audit snapshot persisted only after explicit
 * PO submission. Raw OCR fullText is deliberately excluded; field-level parser
 * sourceText is retained only where the deterministic parser supplied it.
 */
export function createExtractionReviewEvidence(review: PurchaseOrderReviewPrefill) {
  const extractedHeader = Object.fromEntries(
    Object.entries(review.header).map(([name, field]) => [name, extractedFieldEvidence(field)]),
  );
  const extractedTotals = Object.fromEntries(
    Object.entries(review.totals).map(([name, field]) => [name, extractedFieldEvidence(field)]),
  );
  const extractedItems = review.items.map((item) => Object.fromEntries(
    Object.entries(item).map(([name, field]) => [name, extractedFieldEvidence(field)]),
  ));

  const finalReviewedValues = {
    header: Object.fromEntries(Object.entries(review.header).map(([name, field]) => [name, finalFieldValue(field)])),
    totals: Object.fromEntries(Object.entries(review.totals).map(([name, field]) => [name, finalFieldValue(field)])),
    items: review.items.map((item) => Object.fromEntries(
      Object.entries(item).map(([name, field]) => [name, finalFieldValue(field)]),
    )),
  };

  const correctedFields = [
    ...collectCorrections(review.header, "header"),
    ...collectCorrections(review.totals, "totals"),
    ...review.items.flatMap((item, index) => collectCorrections(item, `items.${index}`)),
  ];

  return {
    documentType: review.documentType,
    extractedHeader,
    extractedItems,
    extractedTotals,
    reconciliation: review.reconciliation,
    warnings: [...review.warnings],
    correctedFields,
    finalReviewedValues,
  };
}
