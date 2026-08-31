import { describe, expect, it } from "vitest";
import { createBillingItemId, getBillingCandidateKey } from "../client/src/lib/billingRowIdentity";

describe("billing row identity", () => {
  it("prefers the persistent encounter identity for direct encounters", () => {
    expect(getBillingCandidateKey({
      encounterId: "ENC-1",
      appointmentId: null,
      consultationId: "CON-1",
      patientId: "DOCM-1",
    })).toContain("encounter:ENC-1");
  });

  it("does not use a null appointment ID as a row key", () => {
    const key = getBillingCandidateKey({ appointmentId: null, encounterId: "ENC-2", patientId: "DOCM-2" });
    expect(key).not.toContain("null");
    expect(key).toBe("encounter:ENC-2|patient:DOCM-2");
  });

  it("combines available persistent IDs to distinguish billing candidates", () => {
    const first = getBillingCandidateKey({ appointmentId: "APT-1", patientId: "DOCM-3" });
    const second = getBillingCandidateKey({ appointmentId: "APT-2", patientId: "DOCM-3" });
    expect(first).not.toBe(second);
  });

  it("returns a deterministic fallback only for an unlinked malformed candidate", () => {
    expect(getBillingCandidateKey({})).toBe("billing-candidate:unlinked");
  });

  it("allocates unique stable IDs when unsaved rows are created", () => {
    const first = createBillingItemId();
    const second = createBillingItemId();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^item-\d+$/);
    expect(second).toMatch(/^item-\d+$/);
  });
});
