let nextTemporaryBillItemId = 2;

export function createBillingItemId(): string {
  return `item-${nextTemporaryBillItemId++}`;
}

export type BillingCandidateIdentity = {
  encounterId?: string | null;
  appointmentId?: string | null;
  consultationId?: string | null;
  patientId?: string | null;
};

/**
 * Billing candidates may represent either an appointment-backed encounter or
 * a direct encounter. Prefer the most specific persistent identity available
 * and combine all available identifiers to prevent collisions between rows.
 */
export function getBillingCandidateKey(candidate: BillingCandidateIdentity): string {
  const parts = [
    candidate.encounterId ? `encounter:${candidate.encounterId}` : null,
    candidate.appointmentId ? `appointment:${candidate.appointmentId}` : null,
    candidate.consultationId ? `consultation:${candidate.consultationId}` : null,
    candidate.patientId ? `patient:${candidate.patientId}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join("|") || "billing-candidate:unlinked";
}
