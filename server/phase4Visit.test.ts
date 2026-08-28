import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const activeConsultant = {
  id: 21, userId: "CONS-021", name: "Dr Active", role: "consultant", isActive: 1,
  qualifications: "MBBS", specialization: "Orthopaedics",
};
const patient = {
  patientId: "PAT-100", firstName: "Asha", lastName: "Patient", age: 32, gender: "Female",
  contactNumber: "9876543210", normalizedContactNumber: "9876543210",
};

function caller(role: "admin" | "consultant" | "staff", id = role === "consultant" ? 21 : role === "staff" ? 31 : 11) {
  const ctx: TrpcContext = {
    user: {
      id, openId: `phase4-${role}-${id}`, name: role, email: `${role}-${id}@example.test`, loginMethod: "local", role,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"], res: {} as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

function zeroProcurementAndInventoryWrites() {
  return {
    po: vi.spyOn(db, "createPurchaseOrderWithItemsAndExtractionReview"),
    receipt: vi.spyOn(db, "createGoodsReceipt"),
    inventory: vi.spyOn(db, "updateInventoryItem"),
  };
}

describe("Phase 4 Step 2 unified consultant visit router", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns only active consultant choices to an authorized staff member and requires an active self profile for a consultant", async () => {
    vi.spyOn(db, "checkFeatureAccess").mockResolvedValue(true);
    vi.spyOn(db, "getActiveConsultants").mockResolvedValue([activeConsultant] as any);
    await expect(caller("staff").visits.activeConsultants()).resolves.toEqual([activeConsultant]);

    vi.spyOn(db, "getActiveConsultantById").mockResolvedValue(null);
    await expect(caller("consultant", 21).visits.activeConsultants()).rejects.toThrow("not active");
  });

  it("performs deterministic patient candidate lookup as a zero-write read with a safe PHI audit", async () => {
    vi.spyOn(db, "searchPatients").mockResolvedValue([
      { ...patient, patientId: "PAT-100" },
      { ...patient, patientId: "PAT-101", normalizedContactNumber: "9000000000", contactNumber: "9000000000" },
    ] as any);
    const audit = vi.spyOn(db, "createAuditLog").mockResolvedValue(undefined);
    const writes = zeroProcurementAndInventoryWrites();

    const result = await caller("admin").visits.patientCandidates({ query: "PAT-100" });

    expect(result[0]).toMatchObject({ patientId: "PAT-100", matchStrength: "EXACT_PATIENT_ID" });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ actionType: "PHI_ACCESS", recordId: "visit-patient-search" }));
    expect(JSON.stringify(audit.mock.calls[0]?.[0]?.newValue)).not.toContain("PAT-100");
    expect(writes.po).not.toHaveBeenCalled(); expect(writes.receipt).not.toHaveBeenCalled(); expect(writes.inventory).not.toHaveBeenCalled();
  });

  it("returns a duplicate conflict instead of registering, merging, or overwriting an existing mobile match", async () => {
    vi.spyOn(db, "getPatientsByNormalizedContactNumber").mockResolvedValue([patient] as any);
    const writes = zeroProcurementAndInventoryWrites();

    const result = await caller("admin").visits.registerPatient({
      firstName: "Different", lastName: "Input", age: 40, contactNumber: "9876543210",
    });

    expect(result).toEqual(expect.objectContaining({ created: false, requiresResolution: true }));
    if (!result.created) expect(result.candidates).toEqual([expect.objectContaining({ patientId: "PAT-100" })]);
    expect(writes.po).not.toHaveBeenCalled(); expect(writes.receipt).not.toHaveBeenCalled(); expect(writes.inventory).not.toHaveBeenCalled();
  });

  it("creates an explicit appointment with a controlled source, authoritative actor audit boundary, and no procurement/inventory write", async () => {
    vi.spyOn(db, "getPatientById").mockResolvedValue(patient as any);
    vi.spyOn(db, "getActiveConsultantById").mockResolvedValue(activeConsultant as any);
    const create = vi.spyOn(db, "createVisitAppointmentWithAudit").mockResolvedValue("APT-100");
    const writes = zeroProcurementAndInventoryWrites();

    await expect(caller("admin").visits.createAppointment({
      patientId: "PAT-100", consultantId: 21, appointmentDate: "2026-08-25", appointmentTime: "10:00", appointmentSource: "PHONE",
    })).resolves.toMatchObject({ appointmentId: "APT-100", patientId: "PAT-100", consultantId: 21 });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ patientId: "PAT-100", consultantId: 21, appointmentSource: "PHONE", actorId: "11" }));
    expect(writes.po).not.toHaveBeenCalled(); expect(writes.receipt).not.toHaveBeenCalled(); expect(writes.inventory).not.toHaveBeenCalled();
  });

  it("returns the existing consultation context when resuming an OP-generated direct encounter without creating another visit", async () => {
    vi.spyOn(db, "getPatientById").mockResolvedValue(patient as any);
    vi.spyOn(db, "getActiveConsultantById").mockResolvedValue(activeConsultant as any);
    const create = vi.spyOn(db, "createDirectEncounterWithAudit").mockResolvedValue({
      encounter: { encounterId: "ENC-100", patientId: "PAT-100", consultantId: 21, status: "OP Generated", source: "MANUAL" },
      created: false,
    } as any);
    const consultation = vi.spyOn(db, "getConsultationByEncounterId").mockResolvedValue({ consultationId: "CON-100", encounterId: "ENC-100" } as any);
    const writes = zeroProcurementAndInventoryWrites();

    await expect(caller("admin").visits.createEncounter({ patientId: "PAT-100", consultantId: 21, source: "MANUAL" }))
      .resolves.toMatchObject({ created: false, encounter: { encounterId: "ENC-100", status: "OP Generated" }, consultation: { consultationId: "CON-100" } });

    expect(create).toHaveBeenCalledTimes(1);
    expect(consultation).toHaveBeenCalledWith("ENC-100");
    expect(writes.po).not.toHaveBeenCalled(); expect(writes.receipt).not.toHaveBeenCalled(); expect(writes.inventory).not.toHaveBeenCalled();
  });

  it("rejects consultant appointment tampering before invoking the transactional booking helper", async () => {
    vi.spyOn(db, "getPatientById").mockResolvedValue(patient as any);
    const create = vi.spyOn(db, "createVisitAppointmentWithAudit");

    await expect(caller("consultant", 21).visits.createAppointment({
      patientId: "PAT-100", consultantId: 22, appointmentDate: "2026-08-25", appointmentTime: "10:00", appointmentSource: "MANUAL",
    })).rejects.toThrow("another consultant");
    expect(create).not.toHaveBeenCalled();
  });

  it("delegates permitted check-in and idempotent appointment consultation start with server-derived appointment context", async () => {
    vi.spyOn(db, "getAppointmentById").mockResolvedValue({ appointmentId: "APT-100", consultantId: 21, patientId: "PAT-100", status: "Checked-in" } as any);
    const checkIn = vi.spyOn(db, "checkInAppointmentWithAudit").mockResolvedValue({ appointmentId: "APT-100", status: "Checked-in" } as any);
    const start = vi.spyOn(db, "startAppointmentConsultationWithAudit")
      .mockResolvedValueOnce({ consultation: { consultationId: "CON-100", appointmentId: "APT-100", patientId: "PAT-100", consultantId: 21 }, created: true } as any)
      .mockResolvedValueOnce({ consultation: { consultationId: "CON-100", appointmentId: "APT-100", patientId: "PAT-100", consultantId: 21 }, created: false } as any);

    await caller("consultant", 21).visits.checkIn({ appointmentId: "APT-100" });
    const first = await caller("consultant", 21).visits.startConsultation({ appointmentId: "APT-100" });
    const retry = await caller("consultant", 21).visits.startConsultation({ appointmentId: "APT-100" });

    expect(checkIn).toHaveBeenCalledWith("APT-100", "21");
    expect(first).toMatchObject({ created: true, consultation: { appointmentId: "APT-100", patientId: "PAT-100", consultantId: 21 } });
    expect(retry).toMatchObject({ created: false, consultation: { consultationId: "CON-100" } });
  });

  it("rejects cross-consultant check-in and consultation start without invoking lifecycle helpers", async () => {
    vi.spyOn(db, "getAppointmentById").mockResolvedValue({ appointmentId: "APT-OTHER", consultantId: 22, patientId: "PAT-100", status: "Scheduled" } as any);
    const checkIn = vi.spyOn(db, "checkInAppointmentWithAudit");
    const start = vi.spyOn(db, "startAppointmentConsultationWithAudit");

    await expect(caller("consultant", 21).visits.checkIn({ appointmentId: "APT-OTHER" })).rejects.toThrow("another consultant");
    await expect(caller("consultant", 21).visits.startConsultation({ appointmentId: "APT-OTHER" })).rejects.toThrow("another consultant");
    expect(checkIn).not.toHaveBeenCalled(); expect(start).not.toHaveBeenCalled();
  });

  it("keeps branded OP data restricted to the consultation-linked consultant", async () => {
    vi.spyOn(db, "getConsultationPrintData").mockResolvedValue({ consultationId: "CON-OTHER", consultantId: 22 } as any);
    const audit = vi.spyOn(db, "createAuditLog").mockResolvedValue(undefined);

    await expect(caller("consultant", 21).consultations.getBrandedPrintData({ consultationId: "CON-OTHER" })).rejects.toThrow("not authorized");
    expect(audit).not.toHaveBeenCalled();
  });

  it("returns all appointments to authorized administration while preserving consultant-specific list filtering", async () => {
    const operationalAppointments = vi.spyOn(db, "getOperationalAppointments").mockImplementation(async ({ consultantId } = {}) => (
      consultantId
        ? [{ appointmentId: "APT-200", consultantId: 21, status: "Scheduled" }]
        : [{ appointmentId: "APT-100", consultantId: 21, status: "Scheduled" }]
    ) as any);

    await expect(caller("admin").appointments.list({})).resolves.toEqual([expect.objectContaining({ appointmentId: "APT-100" })]);
    await expect(caller("consultant", 21).appointments.list({})).resolves.toEqual([expect.objectContaining({ appointmentId: "APT-200" })]);
    expect(operationalAppointments).toHaveBeenNthCalledWith(1);
    expect(operationalAppointments).toHaveBeenNthCalledWith(2, { consultantId: 21, patientId: undefined });
  });
});
