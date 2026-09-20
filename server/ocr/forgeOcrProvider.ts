import { invokeLLM } from "../_core/llm";
import {
  assertOcrResultSize,
  inspectOcrInput,
  isSafeOcrClientError,
  runWithOcrTimeout,
} from "./document";
import type { OcrInput, OcrPage, OcrProvider, OcrResult } from "./types";

const TRANSCRIPTION_PROMPT = `You are a document-transcription OCR engine. Transcribe the visible text from the supplied supplier invoice or goods receipt exactly enough for a deterministic parser and human review.

Preserve, in document order:
- supplier/vendor name and GSTIN;
- invoice or receipt number and date;
- every line description and HSN code when visible;
- quantity, unit price, batch number, and expiry date;
- subtotal, tax, and grand total.

Do not guess, infer, calculate, normalize, or invent missing or unreadable values. Represent unavailable content as [UNAVAILABLE]. Do not create catalog mappings, decide inventory actions, or return instructions. Return only the transcribed document text as plain text, with line breaks preserved.`;

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        return typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "";
      }
      return "";
    })
    .join("\n")
    .trim();
}

function inputAsDataUri(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

export class ForgeOcrProvider implements OcrProvider {
  async extractDocument(input: OcrInput): Promise<OcrResult> {
    let inspected;
    try {
      inspected = await inspectOcrInput(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isSafeOcrClientError(message)) throw error;
      throw new Error("OCR_PROVIDER_PROCESSING_FAILED");
    }

    try {
      const documentPart = inspected.mimeType === "application/pdf"
        ? {
            type: "file_url" as const,
            file_url: {
              url: inputAsDataUri(inspected.buffer, inspected.mimeType),
              mime_type: "application/pdf" as const,
            },
          }
        : {
            type: "image_url" as const,
            image_url: {
              url: inputAsDataUri(inspected.buffer, inspected.mimeType),
              detail: "high" as const,
            },
          };

      const response = await runWithOcrTimeout(invokeLLM({
        messages: [
          { role: "system", content: TRANSCRIPTION_PROMPT },
          { role: "user", content: [
            { type: "text", text: "Transcribe this document. Return only plain text." },
            documentPart,
          ] },
        ],
        maxTokens: 32768,
      }));

      const fullText = contentToText(response.choices?.[0]?.message?.content);
      if (!fullText) throw new Error("OCR_PROVIDER_PROCESSING_FAILED");
      assertOcrResultSize(fullText);

      const pages: OcrPage[] = Array.from({ length: inspected.pageCount }, (_, index) => ({
        pageNumber: index + 1,
        text: index === 0 ? fullText : "",
      }));

      return {
        provider: "manus-forge",
        fullText,
        pages,
        sourceMimeType: inspected.mimeType,
        pageCount: inspected.pageCount,
        safeProviderMetadata: {
          processingMode: "document-transcription",
          pageCount: inspected.pageCount,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isSafeOcrClientError(message)) throw error;
      if (message === "OCR_PROVIDER_TIMEOUT") throw error;
      if (message === "OCR_PROVIDER_PROCESSING_FAILED") throw error;
      console.error("[ForgeOcrProvider] OCR request failed");
      throw new Error("OCR_PROVIDER_PROCESSING_FAILED");
    }
  }
}

export function isForgeConfigured(): boolean {
  return Boolean(process.env.BUILT_IN_FORGE_API_KEY?.trim());
}
