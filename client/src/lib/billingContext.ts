const storedDatePattern = /^(\d{4}-\d{2}-\d{2})(?:\s|T|$)/;

/**
 * Returns the database calendar date carried by a stored consultation timestamp.
 * This intentionally matches the DATE(encounters.createdAt) query used by the
 * encounter billing candidate source, avoiding browser-timezone date drift.
 */
export function getBillingContextDate(timestamp: string | null | undefined, fallbackDate: string): string {
  const match = timestamp?.match(storedDatePattern);
  return match?.[1] ?? fallbackDate;
}

export function getBillingContextParams(search: string) {
  const params = new URLSearchParams(search);
  return {
    consultationId: params.get("consultationId"),
    encounterId: params.get("encounterId"),
    patientId: params.get("patientId"),
    billId: params.get("billId"),
  };
}
