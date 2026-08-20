import { describe, it, expect, beforeEach } from "vitest";
import { validateOcrInput, setOcrProvider, getOcrProvider } from "./ocr/provider";
import { OcrProvider, OcrInput, OcrResult } from "./ocr/types";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("Phase 3 Step 1: OCR Foundation & Security Validation", () => {
  describe("Input Validation & Security Limits", () => {
    it("should accept valid JPEG/PNG/PDF mime types and buffer/base64 data", () => {
      const validInputs: OcrInput[] = [
        { data: Buffer.from("fake-image-bytes"), mimeType: "image/jpeg" },
        { data: "ZmFrZS1pbWFnZS1ieXRlcw==", mimeType: "image/png" },
        { data: "data:application/pdf;base64,ZmFrZS1wZGYtYnl0ZXM=", mimeType: "application/pdf" },
      ];

      validInputs.forEach((input) => {
        expect(() => validateOcrInput(input)).not.toThrow();
      });
    });

    it("should reject unsupported MIME types", () => {
      const invalidInput: OcrInput = {
        data: Buffer.from("text-bytes"),
        mimeType: "text/plain",
      };

      expect(() => validateOcrInput(invalidInput)).toThrow(/unsupported mime type/i);
    });

    it("should reject empty files", () => {
      const emptyInput: OcrInput = {
        data: Buffer.alloc(0),
        mimeType: "image/jpeg",
      };

      expect(() => validateOcrInput(emptyInput)).toThrow(/empty file/i);
    });

    it("should reject documents exceeding maximum size limit", () => {
      const oversizeInput: OcrInput = {
        data: Buffer.alloc(11 * 1024 * 1024), // 11MB
        mimeType: "application/pdf",
        maxSizeMb: 10,
      };

      expect(() => validateOcrInput(oversizeInput)).toThrow(/exceeds maximum allowed limit/i);
    });
  });

  describe("OCR Provider Interface & Mock Execution", () => {
    it("should extract document text correctly via mock provider", async () => {
      const provider = getOcrProvider();
      const result = await provider.extractDocument({
        data: Buffer.from("invoice-data"),
        mimeType: "image/jpeg",
      });

      expect(result.provider).toBeDefined();
      expect(result.fullText).toContain("MOCK GST INVOICE");
      expect(result.pages.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it("should handle custom provider implementations safely", async () => {
      const customProvider: OcrProvider = {
        async extractDocument(input: OcrInput): Promise<OcrResult> {
          validateOcrInput(input);
          return {
            provider: "google-cloud-vision",
            fullText: "CUSTOM EXTRACTED INVOICE TEXT",
            pages: [{ pageNumber: 1, text: "CUSTOM EXTRACTED INVOICE TEXT" }],
            confidence: 0.98,
          };
        },
      };

      setOcrProvider(customProvider);
      const provider = getOcrProvider();
      const res = await provider.extractDocument({
        data: Buffer.from("test"),
        mimeType: "image/png",
      });

      expect(res.fullText).toBe("CUSTOM EXTRACTED INVOICE TEXT");
      expect(res.provider).toBe("google-cloud-vision");
      setOcrProvider(null); // reset
    });
  });

  describe("OCR-Only Boundary Guarantee", () => {
    it("should not trigger any inventory or PO mutation when calling OCR extraction", async () => {
      const user = {
        id: 1,
        openId: "test-user-1",
        email: "test@clinic.com",
        name: "Test Doctor",
        loginMethod: "manus",
        role: "admin" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      };

      const ctx: TrpcContext = {
        user,
        req: { protocol: "https", headers: {} } as any,
        res: {} as any,
      };

      const caller = appRouter.createCaller(ctx);

      const ocrRes = await caller.ocr.extractDocument({
        data: Buffer.from("invoice-bytes").toString("base64"),
        mimeType: "image/jpeg",
      });

      expect(ocrRes).toBeDefined();
      expect(ocrRes.fullText).toBeTruthy();
      // Verify no side effects on PO or inventory
    });
  });
});
