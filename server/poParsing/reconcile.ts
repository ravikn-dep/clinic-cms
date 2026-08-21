import type { ParsedPurchaseDocument } from "./types";

const TOLERANCE = 0.50; // ₹0.50 currency tolerance

export function reconcileDocument(doc: ParsedPurchaseDocument): ParsedPurchaseDocument {
  let lineTotalsMatch: boolean | null = true;
  let calculatedSubtotal = 0;

  for (const item of doc.items) {
    const qty = item.quantity.value || 0;
    const price = item.unitPrice.value || 0;
    const expectedLineTotal = qty * price;
    const actualLineTotal = item.lineTotal?.value ?? expectedLineTotal;

    if (Math.abs(expectedLineTotal - actualLineTotal) > TOLERANCE) {
      lineTotalsMatch = false;
      doc.warnings.push(`Line total mismatch for "${item.description.value}": expected ${expectedLineTotal}, found ${actualLineTotal}`);
    }
    calculatedSubtotal += actualLineTotal;
  }

  let subtotalMatches: boolean | null = null;
  if (doc.subtotal !== undefined && doc.subtotal.value !== null) {
    subtotalMatches = Math.abs(calculatedSubtotal - doc.subtotal.value) <= TOLERANCE;
    if (!subtotalMatches) {
      doc.warnings.push(`Subtotal mismatch: calculated ${calculatedSubtotal}, extracted ${doc.subtotal.value}`);
    }
  }

  const baseForTax = doc.subtotal?.value ?? calculatedSubtotal;
  const cgst = doc.cgst?.value || 0;
  const sgst = doc.sgst?.value || 0;
  const igst = doc.igst?.value || 0;
  const totalTax = cgst + sgst + igst;

  let taxMatches: boolean | null = null;
  if (doc.totalTax !== undefined && doc.totalTax.value !== null) {
    taxMatches = Math.abs(totalTax - doc.totalTax.value) <= TOLERANCE;
  }

  const expectedGrandTotal = baseForTax + totalTax;
  const actualGrandTotal = doc.grandTotal.value || 0;
  const grandTotalMatches = Math.abs(expectedGrandTotal - actualGrandTotal) <= TOLERANCE;

  if (!grandTotalMatches) {
    doc.warnings.push(`Grand total mismatch: expected ${expectedGrandTotal}, extracted ${actualGrandTotal}`);
  }

  const delta = Math.abs(expectedGrandTotal - actualGrandTotal);

  doc.reconciliation = {
    lineTotalsMatch,
    subtotalMatches,
    taxMatches,
    grandTotalMatches,
    delta: Math.round(delta * 100) / 100,
  };

  return doc;
}
