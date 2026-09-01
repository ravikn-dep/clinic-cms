export function toggleExpandedPatientId(currentId: string | null, nextId: string): string | null {
  return currentId === nextId ? null : nextId;
}

export function keepExpandedPatientVisible(expandedId: string | null, visibleIds: readonly string[]): string | null {
  if (!expandedId || visibleIds.includes(expandedId)) return expandedId;
  return null;
}

export function refreshBillingContextAfterFinalization(
  refreshConsultations: () => unknown,
  refreshVisitChain: () => unknown,
): void {
  void refreshConsultations();
  void refreshVisitChain();
}
