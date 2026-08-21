export type ParsedField<T> = {
  value: T | null;
  sourceText?: string;
  confidence?: "high" | "medium" | "low";
  warnings?: string[];
};

export type ParsedPoLine = {
  description: ParsedField<string>;
  hsnCode?: ParsedField<string>;
  batchNumber?: ParsedField<string>;
  expiryDate?: ParsedField<string>;
  quantity: ParsedField<number>;
  unitPrice: ParsedField<number>;
  discount?: ParsedField<number>;
  gstRate?: ParsedField<number>;
  taxableAmount?: ParsedField<number>;
  lineTotal?: ParsedField<number>;
};

export type ParsedPurchaseDocument = {
  documentType: "PURCHASE_ORDER" | "GST_INVOICE" | "UNKNOWN";
  invoiceNumber: ParsedField<string>;
  invoiceDate: ParsedField<string>;
  vendorName: ParsedField<string>;
  vendorGstin: ParsedField<string>;
  subtotal?: ParsedField<number>;
  cgst?: ParsedField<number>;
  sgst?: ParsedField<number>;
  igst?: ParsedField<number>;
  totalTax?: ParsedField<number>;
  grandTotal: ParsedField<number>;
  items: ParsedPoLine[];
  warnings: string[];
  reconciliation: {
    lineTotalsMatch: boolean | null;
    subtotalMatches: boolean | null;
    taxMatches: boolean | null;
    grandTotalMatches: boolean | null;
    delta?: number;
  };
};
