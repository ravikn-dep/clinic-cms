/** Map OCR extraction payload into purchase order form fields. */
export function mapExtractedPoToForm(extracted: {
  vendorName?: string;
  vendorContactNumber?: string;
  vendorGstNumber?: string;
  vendorAddress?: string;
  vendorEmail?: string;
  items?: Array<{
    name?: string;
    quantity?: string | number;
    valuePerItem?: string | number;
    batchNumber?: string;
    expiryDate?: string;
  }>;
  notes?: string;
}) {
  const parsePrice = (value: string | number | undefined) => {
    if (value === undefined || value === null) return "";
    const cleaned = String(value).replace(/[^\d.-]/g, "");
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? String(n) : "";
  };

  const parseQty = (value: string | number | undefined) => {
    if (typeof value === "number") return Math.max(1, Math.floor(value));
    const n = Number.parseInt(String(value ?? "").replace(/\D/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  const items =
    extracted.items?.length
      ? extracted.items.map((item) => ({
          itemName: item.name?.trim() || "",
          quantity: parseQty(item.quantity),
          unitPrice: parsePrice(item.valuePerItem),
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
        }))
      : [{ itemName: "", quantity: 1, unitPrice: "" }];

  return {
    vendorName: extracted.vendorName?.trim() || "",
    vendorContactNumber: extracted.vendorContactNumber?.trim() || "",
    vendorEmail: extracted.vendorEmail?.trim() || "",
    vendorGSTNumber: extracted.vendorGstNumber?.trim() || "",
    vendorBankDetails: "",
    vendorAddress: extracted.vendorAddress?.trim() || "",
    expectedDeliveryDate: "",
    notes: extracted.notes?.trim() || "",
    items,
  };
}
