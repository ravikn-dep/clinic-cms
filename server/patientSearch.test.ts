import { describe, expect, it } from "vitest";
import { canSearchPatientCandidates, PATIENT_SEARCH_DEBOUNCE_MS } from "../client/src/lib/patientSearch";

describe("patient candidate search gating", () => {
  it("waits for a short intentional query before requesting candidates", () => {
    expect(PATIENT_SEARCH_DEBOUNCE_MS).toBe(300);
    expect(canSearchPatientCandidates("")).toBe(false);
    expect(canSearchPatientCandidates(" ")).toBe(false);
    expect(canSearchPatientCandidates("D")).toBe(false);
    expect(canSearchPatientCandidates("DO")).toBe(true);
  });
});
