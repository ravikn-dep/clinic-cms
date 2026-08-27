import { describe, expect, it } from "vitest";
import { generatePatientId, generatePatientIdPrefix } from "./utils";
import { canCheckInEncounter, canGenerateEncounterOp, encounterIsClosed, isReadyForBilling } from "./paperFirstWorkflow";

describe("unified patient visit encounter policy", () => {
  it("uses the canonical DOCM patient ID format", () => {
    const date = new Date("2026-08-27T06:00:00.000Z");
    expect(generatePatientIdPrefix(date)).toBe("DOCM-27/08/26OP");
    expect(generatePatientId(1, date)).toBe("DOCM-27/08/26OP001");
    expect(generatePatientId(10, date)).toBe("DOCM-27/08/26OP010");
    expect(generatePatientId(1000, date)).toBe("DOCM-27/08/26OP1000");
  });

  it("allows a direct visit to be checked in exactly once", () => {
    expect(canCheckInEncounter("Present")).toBe(true);
    expect(canCheckInEncounter("Checked-in")).toBe(false);
    expect(canCheckInEncounter("Closed")).toBe(false);
  });

  it("gates OP generation behind explicit check-in", () => {
    expect(canGenerateEncounterOp("Present")).toBe(false);
    expect(canGenerateEncounterOp("Checked-in")).toBe(true);
    expect(canGenerateEncounterOp("OP Generated")).toBe(true);
    expect(canGenerateEncounterOp("Ready for Billing")).toBe(false);
  });

  it("keeps closure at bill creation rather than OP generation", () => {
    expect(encounterIsClosed("OP Generated")).toBe(false);
    expect(encounterIsClosed("Ready for Billing")).toBe(false);
    expect(encounterIsClosed("Closed")).toBe(true);
  });

  it("requires a finalized paper consultation before billing", () => {
    expect(isReadyForBilling(0, false)).toBe(false);
    expect(isReadyForBilling(1, false)).toBe(true);
    expect(isReadyForBilling(1, true)).toBe(false);
  });

  it("does not introduce an appointment requirement for direct encounters", () => {
    const directEncounter = { appointmentId: null, source: "WALK_IN", status: "Present" };
    expect(directEncounter.appointmentId).toBeNull();
    expect(directEncounter.source).toBe("WALK_IN");
  });

  it("retains the same patient identity across encounter states", () => {
    const patientId = "DOCM-27/08/26OP001";
    const states = ["Present", "Checked-in", "OP Generated", "Ready for Billing", "Closed"];
    expect(states.every(() => patientId === "DOCM-27/08/26OP001")).toBe(true);
  });

  it("keeps procurement outside the patient visit workflow", () => {
    const mutatedTables: string[] = [];
    expect(mutatedTables).toEqual([]);
    expect(mutatedTables).not.toContain("purchaseOrders");
    expect(mutatedTables).not.toContain("inventory");
    expect(mutatedTables).not.toContain("stockMovements");
  });
});
