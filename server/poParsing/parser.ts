import type { ParsedPurchaseDocument, ParsedPoLine, ParsedField } from "./types";

export function parseOcrText(fullText: string): ParsedPurchaseDocument {
  const text = fullText || "";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const warnings: string[] = [];

  const createField = <T>(value: T | null, sourceText?: string, confidence: "high" | "medium" | "low" = "medium"): ParsedField<T> => ({
    value,
    sourceText,
    confidence: value !== null ? confidence : "low",
  });

  const gstinRegex = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9]{1}[Z]{1}[0-9A-Z]{1})\b/i;
  let gstinVal: string | null = null;
  let gstinSource: string | undefined = undefined;
  for (const line of lines) {
    const match = line.match(gstinRegex);
    if (match) {
      gstinVal = match[1].toUpperCase();
      gstinSource = line;
      break;
    }
  }

  const invRegex = /(?:invoice|inv|bill|po|order)[\s#no.:]+([A-Z0-9\-\/]+)/i;
  let invVal: string | null = null;
  let invSource: string | undefined = undefined;
  for (const line of lines) {
    const match = line.match(invRegex);
    if (match && match[1] && match[1].length > 1) {
      invVal = match[1];
      invSource = line;
      break;
    }
  }

  const dateRegex = /\b([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})\b/;
  let dateVal: string | null = null;
  let dateSource: string | undefined = undefined;
  for (const line of lines) {
    const match = line.match(dateRegex);
    if (match) {
      dateVal = match[1];
      dateSource = line;
      break;
    }
  }

  let vendorVal: string | null = null;
  let vendorSource: string | undefined = undefined;
  const vendorKeywords = /pharma|distribut|agency|enterpris|diagnostic|med|hospital|supplier|store/i;
  for (const line of lines.slice(0, 5)) {
    if (vendorKeywords.test(line) && line.length < 60) {
      vendorVal = line;
      vendorSource = line;
      break;
    }
  }

  const totalRegex = /(?:grand\s+total|total\s+amount|net\s+amount|amount\s+payable|total)[\s:rs]*([0-9,]+\.[0-9]{2})/i;
  let grandTotalVal: number = 0;
  let foundTotal = false;
  for (const line of lines) {
    const match = line.match(totalRegex);
    if (match) {
      const parsed = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(parsed)) {
        grandTotalVal = parsed;
        foundTotal = true;
      }
    }
  }

  const cgstRegex = /cgst[\s:rs]*([0-9,]+\.[0-9]{2})/i;
  const sgstRegex = /sgst[\s:rs]*([0-9,]+\.[0-9]{2})/i;
  const igstRegex = /igst[\s:rs]*([0-9,]+\.[0-9]{2})/i;

  let cgstVal: number | undefined = undefined;
  let sgstVal: number | undefined = undefined;
  let igstVal: number | undefined = undefined;

  for (const line of lines) {
    const cMatch = line.match(cgstRegex);
    if (cMatch) cgstVal = parseFloat(cMatch[1].replace(/,/g, ""));
    const sMatch = line.match(sgstRegex);
    if (sMatch) sgstVal = parseFloat(sMatch[1].replace(/,/g, ""));
    const iMatch = line.match(igstRegex);
    if (iMatch) igstVal = parseFloat(iMatch[1].replace(/,/g, ""));
  }

  const subtotalRegex = /(?:subtotal|taxable\s+value|sub\s+total)[\s:rs]*([0-9,]+\.[0-9]{2})/i;
  let subtotalVal: number | undefined = undefined;
  for (const line of lines) {
    const match = line.match(subtotalRegex);
    if (match) {
      subtotalVal = parseFloat(match[1].replace(/,/g, ""));
    }
  }

  const items: ParsedPoLine[] = [];
  const itemKeywords = /tablet|capsule|syrup|injection|mg|ml|strip|box|pack|tab|cap|inj|cream|ointment/i;
  
  for (const line of lines) {
    if (itemKeywords.test(line)) {
      const numbers = line.match(/([0-9,]+\.[0-9]{2}|[0-9]+)/g);
      if (numbers && numbers.length >= 3) {
        const unitPrice = parseFloat(numbers[numbers.length - 2]) || 0;
        const qty = parseFloat(numbers[numbers.length - 3]) || 1;
        const lineTot = parseFloat(numbers[numbers.length - 1]) || (qty * unitPrice);

        const batchMatch = line.match(/(?:batch|bat|b\.no)[\s:#]*([A-Z0-9\-]+)/i);
        const expiryMatch = line.match(/(?:exp|expiry)[\s:#]*([0-9]{2}[\/\-][0-9]{2,4}|[0-9]{4}[\/\-][0-9]{2})/i);

        items.push({
          description: createField(line, line, "medium"),
          quantity: createField(qty, String(qty), "medium"),
          unitPrice: createField(unitPrice, String(unitPrice), "medium"),
          batchNumber: batchMatch ? createField(batchMatch[1], batchMatch[0], "high") : createField<string>(null),
          expiryDate: expiryMatch ? createField(expiryMatch[1], expiryMatch[0], "high") : createField<string>(null),
          lineTotal: createField(lineTot, String(lineTot), "medium"),
        });
      } else if (numbers && numbers.length === 2) {
        const qty = parseFloat(numbers[0]) || 1;
        const unitPrice = parseFloat(numbers[1]) || 0;
        items.push({
          description: createField(line, line, "medium"),
          quantity: createField(qty, String(qty), "medium"),
          unitPrice: createField(unitPrice, String(unitPrice), "medium"),
          lineTotal: createField(qty * unitPrice, `${qty} * ${unitPrice}`, "medium"),
        });
      }
    }
  }

  if (items.length === 0 && grandTotalVal > 0) {
    items.push({
      description: createField("Extracted Invoice Item", text.slice(0, 50), "low"),
      quantity: createField(1, "1", "low"),
      unitPrice: createField(grandTotalVal, String(grandTotalVal), "low"),
      lineTotal: createField(grandTotalVal, String(grandTotalVal), "low"),
    });
  }

  if (!foundTotal && items.length > 0) {
    grandTotalVal = items.reduce((sum, item) => sum + (item.lineTotal?.value || 0), 0);
  }

  const documentType = gstinVal ? "GST_INVOICE" : "PURCHASE_ORDER";

  return {
    documentType,
    invoiceNumber: createField(invVal, invSource, invVal ? "high" : "low"),
    invoiceDate: createField(dateVal, dateSource, dateVal ? "high" : "low"),
    vendorName: createField(vendorVal, vendorSource, vendorVal ? "high" : "low"),
    vendorGstin: createField(gstinVal, gstinSource, gstinVal ? "high" : "low"),
    subtotal: subtotalVal !== undefined ? createField(subtotalVal, String(subtotalVal), "medium") : undefined,
    cgst: cgstVal !== undefined ? createField(cgstVal, String(cgstVal), "medium") : undefined,
    sgst: sgstVal !== undefined ? createField(sgstVal, String(sgstVal), "medium") : undefined,
    igst: igstVal !== undefined ? createField(igstVal, String(igstVal), "medium") : undefined,
    grandTotal: createField(grandTotalVal, String(grandTotalVal), foundTotal ? "high" : "medium"),
    items,
    warnings,
    reconciliation: {
      lineTotalsMatch: null,
      subtotalMatches: null,
      taxMatches: null,
      grandTotalMatches: null,
    },
  };
}
