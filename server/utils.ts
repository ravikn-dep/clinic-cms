import crypto from "crypto";
import { nanoid } from "nanoid";

/**
 * Generate a unique Patient ID based on deterministic hashing
 * Format: PAT-{8-char-hash}
 */
export function generatePatientId(firstName: string, lastName: string, dateOfBirth: string): string {
  const input = `${firstName.toLowerCase()}-${lastName.toLowerCase()}-${dateOfBirth}`;
  const hash = crypto.createHash("sha256").update(input).digest("hex").substring(0, 8).toUpperCase();
  return `PAT-${hash}`;
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
