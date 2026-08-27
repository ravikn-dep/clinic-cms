import { describe, expect, it } from "vitest";
import { keepExpandedPatientVisible, toggleExpandedPatientId } from "../client/src/lib/patientRecordsView";

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
});
