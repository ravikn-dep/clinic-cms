import { PDFDocument } from "pdf-lib";
import type { OcrInput, OcrPage } from "./types";

export const SUPPORTED_OCR_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_PAGES = 5;
export const MAX_OCR_RESULT_CHARACTERS = 250_000;
export const OCR_PROVIDER_TIMEOUT_MS = 25_000;

export type OcrInputInspection = {
  buffer: Buffer;
  mimeType: (typeof SUPPORTED_OCR_MIME_TYPES)[number];
  pageCount: number;
};

function decodeInputData(data: OcrInput["data"]): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data !== "string") throw new Error("Invalid OCR input data format");
  if (data.startsWith("data:")) {
    const base64Data = data.split(",")[1];
    if (!base64Data) throw new Error("Malformed data URI");
    return Buffer.from(base64Data, "base64");
  }
  return Buffer.from(data, "base64");
}

export function validateOcrInput(input: OcrInput): { buffer: Buffer; mimeType: OcrInputInspection["mimeType"] } {
  if (!input || !input.data) throw new Error("OCR input data is required");
  const mimeType = (input.mimeType || "").toLowerCase().trim();
  if (!SUPPORTED_OCR_MIME_TYPES.includes(mimeType as OcrInputInspection["mimeType"])) {
    throw new Error("Unsupported MIME type");
  }

  const buffer = decodeInputData(input.data);
  if (buffer.length === 0) throw new Error("Cannot process empty file for OCR");
  const maxBytes = mimeType === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (buffer.length > maxBytes) throw new Error("File size exceeds maximum allowed limit");
  return { buffer, mimeType: mimeType as OcrInputInspection["mimeType"] };
}

export async function inspectOcrInput(input: OcrInput): Promise<OcrInputInspection> {
  const { buffer, mimeType } = validateOcrInput(input);
  if (mimeType !== "application/pdf") return { buffer, mimeType, pageCount: 1 };
  if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Malformed PDF document");

  try {
    const document = await PDFDocument.load(buffer, { updateMetadata: false });
    const pageCount = document.getPageCount();
    if (pageCount === 0) throw new Error("Malformed PDF document");
    if (pageCount > MAX_PDF_PAGES) throw new Error("PDF exceeds maximum supported page count");
    return { buffer, mimeType, pageCount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("maximum supported page count")) throw error;
    throw new Error("Malformed PDF document");
  }
}

export function composeDocumentFullText(pages: OcrPage[]): string {
  return pages
    .slice()
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .map((page) => `--- PAGE ${page.pageNumber} ---\n${page.text}`)
    .join("\n\n");
}

export function assertOcrResultSize(fullText: string): void {
  if (fullText.length > MAX_OCR_RESULT_CHARACTERS) throw new Error("OCR result exceeds maximum supported size");
}

export async function runWithOcrTimeout<T>(operation: Promise<T>, timeoutMs = OCR_PROVIDER_TIMEOUT_MS): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("OCR_PROVIDER_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function isSafeOcrClientError(message: string): boolean {
  return [
    "Unsupported MIME type",
    "Cannot process empty file for OCR",
    "File size exceeds maximum allowed limit",
    "OCR input data is required",
    "Malformed data URI",
    "Malformed PDF document",
    "PDF exceeds maximum supported page count",
    "OCR result exceeds maximum supported size",
  ].some((safeMessage) => message.includes(safeMessage));
}
