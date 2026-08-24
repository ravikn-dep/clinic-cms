import { afterEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { validateConsultantImageDataUrl } from "./consultantAssets";
import { generateConsultationOPHTML } from "../client/src/lib/opFormGenerator";

const baseUser = {
  id: 11, openId: "phase4-user", name: "Dr Test", email: "doctor@example.test", loginMethod: "local",
  role: "admin" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
};
const ctx = (role: "admin" | "consultant" | "staff", id = role === "consultant" ? 21 : role === "staff" ? 31 : 11): TrpcContext => ({
  user: { ...baseUser, id, role }, req: {} as any, res: {} as any,
});
const activeConsultant = {
  id: 21, userId: "CONS-001", name: "Dr Consultant", role: "consultant", isActive: 1,
  registrationNumber: "REG-001", stateCounsilSection: "Medical Council", qualifications: "MBBS", specialization: "Orthopedics",
};

function zeroBusinessWrites() {
  return {
    po: vi.spyOn(db, "createPurchaseOrderWithItemsAndExtractionReview"),
    receipt: vi.spyOn(db, "createGoodsReceipt"),
    inventory: vi.spyOn(db, "updateInventoryItem"),
  };
}

describe("Phase 4 Step 1 consultant OP foundation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("allows only an admin to update authoritative consultant details and writes a server-attributed safe audit event", async () => {
    vi.spyOn(db, "getConsultantProfileById").mockResolvedValue(activeConsultant as any);
    const update = vi.spyOn(db, "updateConsultantProfileById").mockResolvedValue(undefined);
    const audit = vi.spyOn(db, "createAuditLog").mockResolvedValue(undefined);
    const writes = zeroBusinessWrites();
    await appRouter.createCaller(ctx("admin")).consultants.updateProfile({ consultantId: 21, qualifications: "MBBS, MS", specialization: "Orthopedics" });
    expect(update).toHaveBeenCalledWith(21, expect.objectContaining({ qualifications: "MBBS, MS", specialization: "Orthopedics" }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ actionType: "CONSULTANT_PROFILE_UPDATED", userId: "11", recordId: "21" }));
    expect(writes.po).not.toHaveBeenCalled(); expect(writes.receipt).not.toHaveBeenCalled(); expect(writes.inventory).not.toHaveBeenCalled();
    await expect(appRouter.createCaller(ctx("consultant", 21)).consultants.updateProfile({ consultantId: 21, qualifications: "Tampered" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(appRouter.createCaller(ctx("staff")).consultants.updateProfile({ consultantId: 21, qualifications: "Tampered" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("validates PNG/JPEG content and server-owned limits before consultant asset storage", () => {
    const png = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64")}`;
    const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64")}`;
    expect(validateConsultantImageDataUrl(png)).toMatchObject({ mimeType: "image/png", extension: "png" });
    expect(validateConsultantImageDataUrl(jpeg)).toMatchObject({ mimeType: "image/jpeg", extension: "jpg" });
    expect(() => validateConsultantImageDataUrl("data:image/gif;base64,R0lGODlh")).toThrow("PNG or JPEG");
    expect(() => validateConsultantImageDataUrl(`data:image/png;base64,${Buffer.from("not-an-image").toString("base64")}`)).toThrow("content is not");
  });

  it("rejects inactive consultants for new appointments and allows an authorized staff workflow to select an active consultant", async () => {
    vi.spyOn(db, "checkFeatureAccess").mockResolvedValue(true);
    vi.spyOn(db, "getActiveConsultantById").mockResolvedValue(null);
    await expect(appRouter.createCaller(ctx("staff")).appointments.create({ patientId: "PAT-1", consultantId: 21, appointmentDate: "2026-08-24", appointmentTime: "10:00" })).rejects.toThrow("not active");
    vi.spyOn(db, "getActiveConsultantById").mockResolvedValue(activeConsultant as any);
    vi.spyOn(db, "checkAppointmentConflict").mockResolvedValue(false);
    const create = vi.spyOn(db, "createAppointmentSafely").mockResolvedValue("APT-1");
    await expect(appRouter.createCaller(ctx("staff")).appointments.create({ patientId: "PAT-1", consultantId: 21, appointmentDate: "2026-08-24", appointmentTime: "10:00" })).resolves.toMatchObject({ appointmentId: "APT-1", consultantId: 21 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ consultantId: 21 }));
  });

  it("derives a consultant's own appointment identity and rejects consultantId tampering", async () => {
    vi.spyOn(db, "getActiveConsultantById").mockResolvedValue(activeConsultant as any);
    await expect(appRouter.createCaller(ctx("consultant", 21)).appointments.create({ patientId: "PAT-1", consultantId: 22, appointmentDate: "2026-08-24", appointmentTime: "10:00" })).rejects.toThrow("another consultant");
  });

  it("persists consultant attribution for a new consultation and rejects inactive or cross-consultant identity", async () => {
    vi.spyOn(db, "getActiveConsultantById").mockResolvedValue(activeConsultant as any);
    const create = vi.spyOn(db, "createConsultation").mockResolvedValue({ consultationId: "CON-1" } as any);
    await appRouter.createCaller(ctx("consultant", 21)).consultations.create({ patientId: "PAT-1" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ patientId: "PAT-1", consultantId: 21 }));
    await expect(appRouter.createCaller(ctx("consultant", 21)).consultations.create({ patientId: "PAT-1", consultantId: 22 })).rejects.toThrow("another consultant");
  });

  it("rejects consultation and appointment record access when a consultant tampers with another consultant's identifier", async () => {
    vi.spyOn(db, "getConsultationById").mockResolvedValue({ consultationId: "CON-OTHER", consultantId: 22 } as any);
    await expect(appRouter.createCaller(ctx("consultant", 21)).consultations.getById({ consultationId: "CON-OTHER" })).rejects.toThrow("not authorized");
    vi.spyOn(db, "getAppointmentById").mockResolvedValue({ appointmentId: "APT-OTHER", consultantId: 22 } as any);
    const cancel = vi.spyOn(db, "cancelAppointment");
    await expect(appRouter.createCaller(ctx("consultant", 21)).appointments.cancel({ appointmentId: "APT-OTHER" })).rejects.toThrow("Failed to cancel appointment");
    expect(cancel).not.toHaveBeenCalled();
  });

  it("returns branded print data only for the consultation-linked consultant and omits raw storage secrets", async () => {
    vi.spyOn(db, "getConsultationPrintData").mockResolvedValue({
      consultationId: "CON-1", consultantId: 21, consultantName: "Dr Consultant", firstName: "Shared", lastName: "Patient", patientId: "PAT-1",
      contactNumber: "9999999999", consultationDate: "2026-08-24T10:00:00.000Z", qualifications: "MBBS", specialization: "Orthopedics",
      registrationNumber: "REG-001", registrationCouncil: "Medical Council", clinicalHistory: "History", presentComplaints: "Pain",
      advisedInvestigations: "X-ray", treatmentPlan: "Rest", consultantLogoKey: null, signatureKey: null,
    } as any);
    const audit = vi.spyOn(db, "createAuditLog").mockResolvedValue(undefined);
    const payload = await appRouter.createCaller(ctx("consultant", 21)).consultations.getBrandedPrintData({ consultationId: "CON-1" });
    expect(payload.facility).toMatchObject({ name: "MAX DIAGNOSTICS", location: "Punjagutta" });
    expect(JSON.stringify(payload)).not.toContain("consultantLogoKey");
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ actionType: "CONSULTATION_OP_PRINT_VIEWED", userId: "21" }));
  });

  it("renders consultant identity on the left and Max Diagnostics identity on the right while safely omitting absent images", () => {
    const html = generateConsultationOPHTML({
      consultationId: "CON-1", consultationDate: "2026-08-24T10:00:00.000Z", patientId: "PAT-1", firstName: "Shared", lastName: "Patient",
      age: 35, gender: "Female", contactNumber: "9999999999", consultantName: "Dr Consultant", qualifications: "MBBS",
      specialization: "Orthopedics", registrationNumber: "REG-001", facility: { name: "MAX DIAGNOSTICS", location: "Punjagutta" },
    });
    expect(html.indexOf('identity consultant')).toBeLessThan(html.indexOf('identity facility'));
    expect(html).toContain("Dr Consultant"); expect(html).toContain("MAX DIAGNOSTICS"); expect(html).toContain("Punjagutta");
    expect(html).not.toContain('src="undefined"'); expect(html).not.toContain('src="null"');
  });

  it("keeps patient, pharmacy, PO, receipt, inventory, and stock boundaries untouched by consultant profile and OP workflows", async () => {
    vi.spyOn(db, "getConsultantProfileById").mockResolvedValue(activeConsultant as any);
    vi.spyOn(db, "updateConsultantProfileById").mockResolvedValue(undefined);
    vi.spyOn(db, "createAuditLog").mockResolvedValue(undefined);
    const writes = zeroBusinessWrites();
    await appRouter.createCaller(ctx("admin")).consultants.updateProfile({ consultantId: 21, designation: "Consultant" });
    expect(writes.po).not.toHaveBeenCalled(); expect(writes.receipt).not.toHaveBeenCalled(); expect(writes.inventory).not.toHaveBeenCalled();
  });
});
