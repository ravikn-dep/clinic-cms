import { describe, expect, it } from "vitest";
import * as db from "./db";

describe("Phase 4 Step 2 appointment-context consultation persistence", () => {
  it("creates an audited appointment, checks it in, and returns one consultation across retries", async () => {
    const suffix = Date.now().toString();
    const appointmentId = await db.createVisitAppointmentWithAudit({
      patientId: `PAT-VISIT-${suffix}`,
      consultantId: Number(`7${suffix.slice(-6)}`),
      appointmentDate: "2026-12-15",
      appointmentTime: "09:00",
      appointmentSource: "WALK_IN",
      notes: "Synthetic visit workflow test",
      actorId: "test-front-desk",
    });

    const scheduled = await db.getAppointmentById(appointmentId);
    expect(scheduled).toMatchObject({ appointmentId, status: "Scheduled", appointmentSource: "WALK_IN" });

    const checkedIn = await db.checkInAppointmentWithAudit(appointmentId, "test-front-desk");
    expect(checkedIn.status).toBe("Checked-in");
    expect(checkedIn.checkedInAt).toBeTruthy();

    const first = await db.startAppointmentConsultationWithAudit(appointmentId, "test-consultant");
    const retry = await db.startAppointmentConsultationWithAudit(appointmentId, "test-consultant");
    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.consultation.consultationId).toBe(first.consultation.consultationId);
    expect(retry.consultation.appointmentId).toBe(appointmentId);
  });

  it("does not start a consultation before the authoritative check-in transition", async () => {
    const suffix = Date.now().toString();
    const appointmentId = await db.createVisitAppointmentWithAudit({
      patientId: `PAT-PRECHECK-${suffix}`,
      consultantId: Number(`8${suffix.slice(-6)}`),
      appointmentDate: "2026-12-16",
      appointmentTime: "09:00",
      appointmentSource: "MANUAL",
      actorId: "test-front-desk",
    });
    await expect(db.startAppointmentConsultationWithAudit(appointmentId, "test-consultant")).rejects.toThrow("checked in");
  });
});
