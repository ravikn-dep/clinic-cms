import * as barcodeGen from "../barcode";
import * as db from "../db";
import { normalizeIndianMobile } from "../external/validation";
import { notifyOwner } from "../_core/notification";
import { storagePut } from "../storage";
import * as utils from "../utils";

export type PatientRegistrationInput = {
  firstName: string;
  lastName: string;
  age?: number | null;
  dateOfBirth?: string | null;
  gender?: "Male" | "Female" | "Other";
  contactNumber: string;
  email?: string;
  address?: string;
};

export type PatientRegistrationActor = {
  auditActorId: string;
  notificationUserId?: number;
  source: "cms" | "external";
};

export async function registerPatientWithTracking(
  input: PatientRegistrationInput,
  actor: PatientRegistrationActor,
) {
  const normalizedContactNumber = normalizeIndianMobile(input.contactNumber);
  if (!normalizedContactNumber) {
    throw new Error("A valid Indian mobile number is required");
  }

  const registrationDate = new Date();
  const patientIdPrefix = utils.generatePatientIdPrefix(registrationDate);
  let dailySequence = (await db.countPatientsByPatientIdPrefix(patientIdPrefix)) + 1;
  let patientId = utils.generatePatientId(dailySequence, registrationDate);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const existingPatient = await db.getPatientById(patientId);
    if (!existingPatient) break;
    dailySequence += 1;
    patientId = utils.generatePatientId(dailySequence, registrationDate);
    if (attempt === 99) {
      throw new Error("Unable to allocate a unique daily Patient ID. Please retry registration.");
    }
  }

  const barcodeData = utils.generateBarcodeData(patientId);
  const barcodeAssets = await barcodeGen.generatePatientBarcodes(patientId);
  const [qrUpload, barcodeUpload] = await Promise.all([
    storagePut(`barcodes/${patientId}-qr.png`, barcodeAssets.qrCodePngBuffer, "image/png"),
    storagePut(`barcodes/${patientId}-barcode.png`, barcodeAssets.barcodePngBuffer, "image/png"),
  ]);

  const patient = await db.createPatient({
    patientId,
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    age: input.age ?? null,
    dateOfBirth: input.dateOfBirth ?? null,
    gender: input.gender,
    contactNumber: input.contactNumber.trim(),
    normalizedContactNumber,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    barcodeData,
    barcodeImageUrl: barcodeUpload.url,
    barcodeImageKey: barcodeUpload.key,
    qrcodeImageUrl: qrUpload.url,
    qrcodeImageKey: qrUpload.key,
  });

  await db.createAuditLog({
    logId: utils.generateAuditLogId(),
    userId: actor.auditActorId,
    actionType: "CREATE",
    tableName: "patients",
    recordId: patientId,
    newValue: JSON.stringify({ patientId, source: actor.source }),
    timestamp: new Date().toISOString(),
  });

  if (actor.notificationUserId) {
    await db.createNotification({
      notificationId: utils.generateNotificationId(),
      userId: actor.notificationUserId,
      title: "New Patient Registration",
      content: `${patient.firstName} ${patient.lastName} has been registered.`,
      notificationType: "patient_registration",
    });
  }

  try {
    await notifyOwner({
      title: "New Patient Registration",
      content: `${patient.firstName} ${patient.lastName} has been registered with Patient ID ${patientId}.`,
    });
  } catch (error) {
    console.warn("[Patient Registration] Owner notification failed", { patientId });
  }

  return {
    success: true as const,
    patientId,
    barcodeData,
    barcodeImageUrl: barcodeUpload.url,
    qrcodeImageUrl: qrUpload.url,
    barcodeImageKey: barcodeUpload.key,
    qrcodeImageKey: qrUpload.key,
    patient,
  };
}
