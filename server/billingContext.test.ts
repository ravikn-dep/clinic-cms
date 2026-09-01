import { describe, expect, it } from "vitest";
import { getBillingContextDate, getBillingContextParams } from "../client/src/lib/billingContext";

describe("historical direct-encounter billing context date", () => {
  it("uses the stored MySQL consultation calendar date for candidate lookup", () => {
    expect(getBillingContextDate("2026-08-29 14:18:40", "2026-08-31")).toBe("2026-08-29");
  });

  it("accepts ISO timestamps without converting through the browser timezone", () => {
    expect(getBillingContextDate("2026-08-29T14:18:40.000Z", "2026-08-31")).toBe("2026-08-29");
  });

  it("retains the active date for absent or invalid stored values", () => {
    expect(getBillingContextDate(undefined, "2026-08-31")).toBe("2026-08-31");
    expect(getBillingContextDate("invalid", "2026-08-31")).toBe("2026-08-31");
  });

  it("hydrates direct-encounter billing context from the browser query string", () => {
    expect(getBillingContextParams("?consultationId=CON-1&encounterId=ENC-1&patientId=DOCM-1&billId=BIL-1")).toEqual({
      consultationId: "CON-1",
      encounterId: "ENC-1",
      patientId: "DOCM-1",
      billId: "BIL-1",
    });
  });
});
