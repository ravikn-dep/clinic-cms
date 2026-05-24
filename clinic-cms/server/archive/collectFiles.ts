import { bills, consultations, patients, users } from "../../drizzle/schema";
import { getDb } from "../db";

export interface ArchivableFile {
  key: string;
  zipPath: string;
}

function addFile(
  files: ArchivableFile[],
  seen: Set<string>,
  key: string | null | undefined,
  zipPath: string
) {
  if (!key?.trim() || seen.has(key)) return;
  seen.add(key);
  files.push({ key: key.trim(), zipPath });
}

/** Collects unique storage keys referenced across clinical tables (copy-only archive). */
export async function collectArchivableFiles(): Promise<ArchivableFile[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const seen = new Set<string>();
  const files: ArchivableFile[] = [];

  const patientRows = await db
    .select({
      patientId: patients.patientId,
      barcodeImageKey: patients.barcodeImageKey,
      qrcodeImageKey: patients.qrcodeImageKey,
    })
    .from(patients);

  for (const row of patientRows) {
    addFile(files, seen, row.barcodeImageKey, `patients/${row.patientId}/barcode`);
    addFile(files, seen, row.qrcodeImageKey, `patients/${row.patientId}/qrcode`);
  }

  const consultationRows = await db
    .select({
      consultationId: consultations.consultationId,
      audioFileKey: consultations.audioFileKey,
    })
    .from(consultations);

  for (const row of consultationRows) {
    addFile(
      files,
      seen,
      row.audioFileKey,
      `consultations/${row.consultationId}/audio`
    );
  }

  const billRows = await db
    .select({
      billId: bills.billId,
      invoicePdfKey: bills.invoicePdfKey,
      receiptPdfKey: bills.receiptPdfKey,
    })
    .from(bills);

  for (const row of billRows) {
    addFile(files, seen, row.invoicePdfKey, `bills/${row.billId}/invoice.pdf`);
    addFile(files, seen, row.receiptPdfKey, `bills/${row.billId}/receipt.pdf`);
  }

  const userRows = await db
    .select({
      id: users.id,
      qrcodeLoginKey: users.qrcodeLoginKey,
    })
    .from(users);

  for (const row of userRows) {
    addFile(files, seen, row.qrcodeLoginKey, `users/${row.id}/login-qrcode`);
  }

  return files;
}
