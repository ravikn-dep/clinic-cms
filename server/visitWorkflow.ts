import { normalizeIndianMobile } from "./external/validation";

export type VisitPatientCandidate = {
  patientId: string;
  firstName: string;
  lastName: string;
  age: number | null;
  gender: string | null;
  contactNumber: string;
  normalizedContactNumber: string | null;
};

export type RankedPatientCandidate = VisitPatientCandidate & {
  matchStrength: "EXACT_PATIENT_ID" | "EXACT_MOBILE" | "EXACT_NAME" | "PARTIAL_NAME";
};

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
}

export function rankPatientCandidates(query: string, candidates: VisitPatientCandidate[]): RankedPatientCandidate[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const normalizedMobile = normalizeIndianMobile(trimmed);
  const normalizedQuery = normalizeName(trimmed);

  return candidates.map((candidate): RankedPatientCandidate => {
    const fullName = normalizeName(`${candidate.firstName} ${candidate.lastName}`);
    const matchStrength: RankedPatientCandidate["matchStrength"] = candidate.patientId.toLocaleLowerCase("en-IN") === normalizedQuery
      ? "EXACT_PATIENT_ID"
      : normalizedMobile && candidate.normalizedContactNumber === normalizedMobile
        ? "EXACT_MOBILE"
        : fullName === normalizedQuery
          ? "EXACT_NAME"
          : "PARTIAL_NAME";
    return { ...candidate, matchStrength };
  }).sort((left, right) => {
    const rank = { EXACT_PATIENT_ID: 0, EXACT_MOBILE: 1, EXACT_NAME: 2, PARTIAL_NAME: 3 } as const;
    return rank[left.matchStrength] - rank[right.matchStrength] || left.patientId.localeCompare(right.patientId);
  });
}

export function hasStrongDuplicate(normalizedContactNumber: string | null, candidates: VisitPatientCandidate[]) {
  return Boolean(normalizedContactNumber && candidates.some((candidate) => candidate.normalizedContactNumber === normalizedContactNumber));
}

export function canCheckInAppointment(status: string | null) {
  return status === "Scheduled" || status === "Rescheduled";
}

export function canStartAppointmentConsultation(status: string | null) {
  return status === "Checked-in";
}
