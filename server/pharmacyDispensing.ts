export type PharmacyStockCandidate = {
  itemId: string;
  itemName: string;
  batchNumber: string;
  expiryDate: string;
  quantityAvailable: number | null;
  unitPrice: string;
  catalogItemId?: string | null;
};

export function clinicToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function isUnexpiredBatch(expiryDate: string, today = clinicToday()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(expiryDate) && expiryDate >= today;
}

export function selectFefoBatch(
  candidates: PharmacyStockCandidate[],
  quantity: number,
  today = clinicToday(),
): PharmacyStockCandidate | null {
  if (!Number.isInteger(quantity) || quantity <= 0) return null;
  return candidates
    .filter((candidate) => Number(candidate.quantityAvailable ?? 0) >= quantity && isUnexpiredBatch(candidate.expiryDate, today))
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.itemId.localeCompare(b.itemId))[0] ?? null;
}

export function validatePharmacyLine(line: {
  itemType: string;
  quantity: number;
  inventoryItemId?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
}): string | null {
  if (line.itemType !== "Medicine") return null;
  if (!line.inventoryItemId || !line.batchNumber || !line.expiryDate) return "Exact inventory batch provenance is required";
  if (!Number.isInteger(line.quantity) || line.quantity <= 0) return "Dispensing quantity must be a positive integer";
  if (!isUnexpiredBatch(line.expiryDate)) return "Expired stock cannot be dispensed";
  return null;
}

export function isPharmacyLine(itemType: string): boolean {
  return itemType === "Medicine";
}
