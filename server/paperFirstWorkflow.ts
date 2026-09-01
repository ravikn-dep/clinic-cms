export type PaperAppointmentStatus = "Scheduled" | "Checked-in" | "Completed" | "Cancelled" | "No-show" | "Rescheduled";
export type EncounterStatus = "Present" | "Checked-in" | "OP Generated" | "Ready for Billing" | "Closed";

export function canCheckInEncounter(status: string | null | undefined) {
  return status === "Present";
}

export function canGenerateEncounterOp(status: string | null | undefined) {
  return status === "Checked-in" || status === "OP Generated";
}

export function encounterIsClosed(status: string | null | undefined) {
  return status === "Closed";
}

export function canGeneratePaperOp(status: PaperAppointmentStatus) {
  return status === "Checked-in";
}

export function canCompleteEncounter(actorRole: string, actorId: number, consultantId: number) {
  return actorRole === "admin" || (actorRole === "consultant" && actorId === consultantId);
}

export function isReadyForBilling(isFinalized: number | null | undefined, hasBill: boolean) {
  return isFinalized === 1 && !hasBill;
}

export function closesVisitAfterBillCreation(billCreated: boolean) {
  return billCreated;
}

export function paperOpSectionTitles() {
  return [
    "Chief complaints / history",
    "Clinical examination / findings",
    "Investigations",
    "Diagnosis / assessment",
    "Treatment / prescription",
    "Advice / follow-up",
  ] as const;
}
