import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: AuthenticatedUser["role"] = "admin", id = 1): TrpcContext {
  return {
    user: {
      id,
      openId: `user-${id}`,
      email: `${role}@example.com`,
      name: role,
      loginMethod: "direct",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const row = (overrides: Record<string, unknown> = {}) => ({
  appointment: {
    appointmentId: "APT-1",
    patientId: "PAT-1",
    consultantId: 7,
    appointmentDate: "2026-08-27",
    appointmentTime: "10:30",
    status: "Checked-in",
  },
  patient: { patientId: "PAT-1", firstName: "Asha", lastName: "Rao", age: 34, gender: "Female" },
  consultation: { consultationId: "CON-1", appointmentId: "APT-1", isFinalized: 1 },
  bill: null,
  consultant: { id: 7, name: "Dr. Rao" },
  ...overrides,
});

describe("bills.getEncounterCandidatesByDate", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns only date-matched read data and derives Ready for Billing without mutation", async () => {
    const read = vi.spyOn(db, "getBillingCandidatesByDate").mockResolvedValue([row()] as any);

    const result = await appRouter.createCaller(createAuthContext()).bills.getEncounterCandidatesByDate({ date: "2026-08-27" });

    expect(read).toHaveBeenCalledWith("2026-08-27");
    expect(result).toEqual([expect.objectContaining({
      patientName: "Asha Rao",
      consultantName: "Dr. Rao",
      displayStatus: "Ready for Billing",
      canRaiseBill: true,
    })]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not expose another consultant's encounters", async () => {
    vi.spyOn(db, "getBillingCandidatesByDate").mockResolvedValue([
      row(),
      row({ appointment: { ...row().appointment, appointmentId: "APT-2", consultantId: 8 } }),
    ] as any);

    const result = await appRouter.createCaller(createAuthContext("consultant", 7)).bills.getEncounterCandidatesByDate({ date: "2026-08-27" });

    expect(result).toHaveLength(1);
    expect(result[0]?.consultantId).toBe(7);
  });

  it("derives Billed and never offers Raise Bill for an existing encounter bill", async () => {
    vi.spyOn(db, "getBillingCandidatesByDate").mockResolvedValue([
      row({ bill: { billId: "BILL-1" } }),
    ] as any);

    const result = await appRouter.createCaller(createAuthContext()).bills.getEncounterCandidatesByDate({ date: "2026-08-27" });

    expect(result[0]).toEqual(expect.objectContaining({ displayStatus: "Billed", billId: "BILL-1", canRaiseBill: false }));
  });

  it("rejects unbounded or malformed date input", async () => {
    const read = vi.spyOn(db, "getBillingCandidatesByDate");

    await expect(
      appRouter.createCaller(createAuthContext()).bills.getEncounterCandidatesByDate({ date: "27-08-2026" }),
    ).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
});
