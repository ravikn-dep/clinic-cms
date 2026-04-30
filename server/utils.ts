import crypto from "crypto";
import { nanoid } from "nanoid";

const PATIENT_ID_TIME_ZONE = "Asia/Kolkata";

function formatTwoDigitNumber(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Format a date segment for the clinic OP patient ID.
 * Format: dd/mm/yy in the clinic's local India time zone.
 */
export function formatPatientIdDateSegment(registrationDate: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PATIENT_ID_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(registrationDate);

  const day = parts.find((part) => part.type === "day")?.value ?? formatTwoDigitNumber(registrationDate.getDate());
  const month = parts.find((part) => part.type === "month")?.value ?? formatTwoDigitNumber(registrationDate.getMonth() + 1);
  const year = parts.find((part) => part.type === "year")?.value ?? formatTwoDigitNumber(registrationDate.getFullYear() % 100);

  return `${day}/${month}/${year}`;
}

/**
 * Generate the prefix used to count today's OP registrations.
 * Format: DOCM-dd/mm/yyOP
 */
export function generatePatientIdPrefix(registrationDate: Date = new Date()): string {
  return `DOCM-${formatPatientIdDateSegment(registrationDate)}OP`;
}

/**
 * Generate a clinic OP patient ID from a date and daily sequence number.
 * Format: DOCM-dd/mm/yyOP001, DOCM-dd/mm/yyOP002, ...
 */
export function generatePatientId(dailySequence: number, registrationDate: Date = new Date()): string {
  if (!Number.isInteger(dailySequence) || dailySequence < 1) {
    throw new Error("Patient daily sequence must be a positive integer");
  }

  return `${generatePatientIdPrefix(registrationDate)}${dailySequence.toString().padStart(3, "0")}`;
}

/**
 * Generate a unique Consultation ID
 * Format: CON-{timestamp}-{random}
 */
export function generateConsultationId(): string {
  return `CON-${Date.now()}-${nanoid(6)}`;
}

/**
 * Generate a unique Bill ID
 * Format: BIL-{timestamp}-{random}
 */
export function generateBillId(): string {
  return `BIL-${Date.now()}-${nanoid(6)}`;
}

/**
 * Generate a unique Bill Item ID
 * Format: BIT-{random}
 */
export function generateBillItemId(): string {
  return `BIT-${nanoid(8)}`;
}

/**
 * Generate a unique Inventory Item ID
 * Format: INV-{random}
 */
export function generateInventoryItemId(): string {
  return `INV-${nanoid(8)}`;
}

/**
 * Generate a unique Audit Log ID
 * Format: AUD-{timestamp}-{random}
 */
export function generateAuditLogId(): string {
  return `AUD-${Date.now()}-${nanoid(6)}`;
}

/**
 * Generate a unique Notification ID
 * Format: NOT-{timestamp}-{random}
 */
export function generateNotificationId(): string {
  return `NOT-${Date.now()}-${nanoid(6)}`;
}

/**
 * Generate barcode data (typically the patient ID itself)
 */
export function generateBarcodeData(patientId: string): string {
  return patientId;
}

/**
 * Create a digital signature using HMAC-SHA256
 * In production, this would use asymmetric cryptography (RSA-2048)
 */
export function createDigitalSignature(content: string, secretKey: string): string {
  return crypto.createHmac("sha256", secretKey).update(content).digest("hex");
}

/**
 * Verify a digital signature
 */
export function verifyDigitalSignature(content: string, signature: string, secretKey: string): boolean {
  const expectedSignature = createDigitalSignature(content, secretKey);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}
