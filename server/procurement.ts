export type VendorMasterRecord = {
  vendorId: string;
  name: string;
  normalizedVendorName: string | null;
  contactNumber: string | null;
  gstNumber: string | null;
  normalizedGstNumber: string | null;
  email: string | null;
  address: string | null;
  bankDetails: string | null;
  isActive: number | null;
};

export type VendorResolution = {
  status: "UNRESOLVED" | "AMBIGUOUS" | "RESOLVED" | "CONFLICT";
  vendor?: VendorMasterRecord;
  candidates: VendorMasterRecord[];
  conflicts: string[];
};

export type PurchaseOrderVendorValues = {
  vendorName: string;
  vendorContactNumber?: string | null;
  vendorEmail?: string | null;
  vendorGSTNumber?: string | null;
  vendorBankDetails?: string | null;
  vendorAddress?: string | null;
};

export function normalizeVendorName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-IN")
    .replace(/[\s\-_,./]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeGstNumber(value: string | null | undefined): string | null {
  const normalized = (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized || null;
}

function differs(input: string | null | undefined, verified: string | null | undefined): boolean {
  return Boolean(input?.trim() && verified?.trim() && input.trim() !== verified.trim());
}

export function resolveVendorMaster(
  values: Pick<PurchaseOrderVendorValues, "vendorName" | "vendorGSTNumber">,
  activeVendors: VendorMasterRecord[],
): VendorResolution {
  const normalizedName = normalizeVendorName(values.vendorName);
  const normalizedGst = normalizeGstNumber(values.vendorGSTNumber);
  const candidates = activeVendors.filter((vendor) =>
    (normalizedName && vendor.normalizedVendorName === normalizedName)
    || (normalizedGst && vendor.normalizedGstNumber === normalizedGst),
  );

  const uniqueCandidates: VendorMasterRecord[] = [];
  for (const candidate of candidates) {
    if (!uniqueCandidates.some((vendor) => vendor.vendorId === candidate.vendorId)) uniqueCandidates.push(candidate);
  }
  if (uniqueCandidates.length === 0) return { status: "UNRESOLVED", candidates: [], conflicts: [] };
  if (uniqueCandidates.length > 1) return { status: "AMBIGUOUS", candidates: uniqueCandidates, conflicts: [] };

  const vendor = uniqueCandidates[0];
  const conflicts: string[] = [];
  if (normalizedGst && vendor.normalizedGstNumber && normalizedGst !== vendor.normalizedGstNumber) {
    conflicts.push("GSTIN conflicts with the linked Vendor Master record");
  }
  return {
    status: conflicts.length > 0 ? "CONFLICT" : "RESOLVED",
    vendor,
    candidates: uniqueCandidates,
    conflicts,
  };
}

export function enrichPurchaseOrderFromVerifiedVendor(
  values: PurchaseOrderVendorValues,
  vendor: VendorMasterRecord,
): PurchaseOrderVendorValues {
  return {
    vendorName: values.vendorName || vendor.name,
    vendorContactNumber: values.vendorContactNumber?.trim() || vendor.contactNumber || "",
    vendorEmail: values.vendorEmail?.trim() || vendor.email || undefined,
    vendorGSTNumber: values.vendorGSTNumber?.trim() || vendor.gstNumber || undefined,
    vendorBankDetails: values.vendorBankDetails?.trim() || vendor.bankDetails || undefined,
    vendorAddress: values.vendorAddress?.trim() || vendor.address || undefined,
  };
}

export function receiptStateForLines(items: Array<{ quantity: number | null; receivedQuantity: number | null }>) {
  const ordered = items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
  const received = items.reduce((sum, item) => sum + Number(item.receivedQuantity ?? 0), 0);
  if (ordered > 0 && received >= ordered) return "FULLY_RECEIVED" as const;
  if (received > 0) return "PARTIALLY_RECEIVED" as const;
  return "AWAITING_RECEIPT" as const;
}

export function vendorAuditSnapshot(vendor: VendorMasterRecord) {
  return {
    vendorId: vendor.vendorId,
    name: vendor.name,
    normalizedVendorName: vendor.normalizedVendorName,
    gstNumber: vendor.gstNumber,
    normalizedGstNumber: vendor.normalizedGstNumber,
    contactNumber: vendor.contactNumber,
    email: vendor.email,
    address: vendor.address,
    bankDetailsPresent: Boolean(vendor.bankDetails),
    isActive: Boolean(vendor.isActive),
  };
}
