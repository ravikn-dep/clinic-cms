import { describe, expect, it, vi } from "vitest";
import { keepExpandedPatientVisible, refreshBillingContextAfterFinalization, toggleExpandedPatientId } from "../client/src/lib/patientRecordsView";

describe("Patient Records inline preview policy", () => {
  it("opens the clicked patient and closes the previously expanded patient", () => {
    expect(toggleExpandedPatientId(null, "PAT-A")).toBe("PAT-A");
    expect(toggleExpandedPatientId("PAT-A", "PAT-B")).toBe("PAT-B");
  });

  it("toggles the active patient preview closed", () => {
    expect(toggleExpandedPatientId("PAT-A", "PAT-A")).toBeNull();
  });

  it("collapses an expanded patient when filtering removes it from visible rows", () => {
    expect(keepExpandedPatientVisible("PAT-A", ["PAT-B", "PAT-C"])).toBeNull();
    expect(keepExpandedPatientVisible("PAT-B", ["PAT-A", "PAT-B"])).toBe("PAT-B");
    expect(keepExpandedPatientVisible(null, ["PAT-A"])).toBeNull();
  });

  it("refreshes both consultation and visit-chain context after finalization", () => {
    const refreshConsultations = vi.fn();
    const refreshVisitChain = vi.fn();

    refreshBillingContextAfterFinalization(refreshConsultations, refreshVisitChain);

    expect(refreshConsultations).toHaveBeenCalledOnce();
    expect(refreshVisitChain).toHaveBeenCalledOnce();
  });
});
