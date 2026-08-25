import { describe, expect, it } from "vitest";
import { canCheckInAppointment, canStartAppointmentConsultation, hasStrongDuplicate, rankPatientCandidates } from "./visitWorkflow";

const candidates = [
  { patientId: "PT-100", firstName: "Asha", lastName: "Rao", age: 32, gender: "Female", contactNumber: "+91 98765 43210", normalizedContactNumber: "9876543210" },
  { patientId: "PT-200", firstName: "Asha", lastName: "Reddy", age: 40, gender: "Female", contactNumber: "+91 98765 43211", normalizedContactNumber: "9876543211" },
];

describe("Phase 4 Step 2 visit workflow policy", () => {
  it("ranks exact patient IDs before looser candidate matches", () => {
    const result = rankPatientCandidates("PT-100", candidates);
    expect(result[0]).toMatchObject({ patientId: "PT-100", matchStrength: "EXACT_PATIENT_ID" });
  });

  it("recognizes normalized Indian mobile matches deterministically", () => {
    const result = rankPatientCandidates("+91 98765-43210", candidates);
    expect(result[0]).toMatchObject({ patientId: "PT-100", matchStrength: "EXACT_MOBILE" });
    expect(hasStrongDuplicate("9876543210", candidates)).toBe(true);
    expect(hasStrongDuplicate("9123456789", candidates)).toBe(false);
  });

  it("distinguishes exact and partial name results without modifying records", () => {
    expect(rankPatientCandidates("Asha Rao", candidates)[0].matchStrength).toBe("EXACT_NAME");
    expect(rankPatientCandidates("Asha", candidates).map((candidate) => candidate.matchStrength)).toEqual(["PARTIAL_NAME", "PARTIAL_NAME"]);
  });

  it("permits check-in only from booked states and consultation start only after check-in", () => {
    expect(canCheckInAppointment("Scheduled")).toBe(true);
    expect(canCheckInAppointment("Rescheduled")).toBe(true);
    expect(canCheckInAppointment("Checked-in")).toBe(false);
    expect(canCheckInAppointment("Cancelled")).toBe(false);
    expect(canStartAppointmentConsultation("Checked-in")).toBe(true);
    expect(canStartAppointmentConsultation("Scheduled")).toBe(false);
    expect(canStartAppointmentConsultation("Completed")).toBe(false);
  });
});
