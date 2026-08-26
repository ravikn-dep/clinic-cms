export type PaperAppointmentStatus = "Scheduled" | "Checked-in" | "Completed" | "Cancelled" | "No-show" | "Rescheduled";

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
