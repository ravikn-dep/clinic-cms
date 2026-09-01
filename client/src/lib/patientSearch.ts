export const PATIENT_SEARCH_DEBOUNCE_MS = 300;

export function canSearchPatientCandidates(query: string): boolean {
  return query.trim().length >= 2;
}
