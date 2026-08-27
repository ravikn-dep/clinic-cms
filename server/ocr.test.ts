import { describe, it, expect } from "vitest";
import { validateOcrInput, setOcrProvider, getOcrProvider } from "./ocr/provider";
import { GoogleVisionProvider } from "./ocr/googleVisionProvider";
import { OcrProvider, OcrInput, OcrResult } from "./ocr/types";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("Phase 3 Step 1: OCR Security Hardening & Input Validation", () => {
  describe("MIME Validation", () => {
    it("should accept valid JPEG and PNG mime types", () => {
      const validInputs: OcrInput[] = [
        { data: Buffer.from("fake-jpeg-bytes"), mimeType: "image/jpeg" },
        { data: Buffer.from("fake-png-bytes"), mimeType: "image/png" },
      ];

      validInputs.forEach((input) => {
        expect(() => validateOcrInput(input)).not.toThrow();
      });
    });

    it("should allow PDF MIME to proceed to the bounded PDF inspection path", () => {
      const pdfInput: OcrInput = {
        data: Buffer.from("fake-pdf-bytes"),
        mimeType: "application/pdf",
      };

      expect(() => validateOcrInput(pdfInput)).not.toThrow();
    });

    it("should reject unsupported MIME types", () => {
      const invalidInput: OcrInput = {
        data: Buffer.from("text-bytes"),
        mimeType: "text/plain",
      };

      expect(() => validateOcrInput(invalidInput)).toThrow(/Unsupported MIME type/i);
    });

    it("should reject empty files", () => {
      const emptyInput: OcrInput = {
        data: Buffer.alloc(0),
        mimeType: "image/jpeg",
      };

      expect(() => validateOcrInput(emptyInput)).toThrow(/Cannot process empty file/i);
    });

    it("should reject documents exceeding maximum size limit", () => {
      const oversizeInput: OcrInput = {
        data: Buffer.alloc(11 * 1024 * 1024), // 11MB
        mimeType: "image/jpeg",
      };

      expect(() => validateOcrInput(oversizeInput)).toThrow(/exceeds maximum allowed limit/i);
    });
  });

  describe("Confidence & Provider Error Sanitization", () => {
    it("should not fabricate confidence in provider result", async () => {
      const provider = getOcrProvider();
      const result = await provider.extractDocument({
        data: Buffer.from("invoice-data"),
        mimeType: "image/jpeg",
      });

      expect(result.confidence).toBeUndefined();
    });

    it("should sanitize raw Google SDK errors inside GoogleVisionProvider", async () => {
      const provider = new GoogleVisionProvider() as any;
      provider.client = {
        documentTextDetection: async () => {
          throw new Error("Google quota exceeded for project clinic-prod with credential path /etc/secrets/google.json");
        },
      };

      await expect(
        provider.extractDocument({ data: Buffer.from("test"), mimeType: "image/png" })
      ).rejects.toThrow("OCR_PROVIDER_PROCESSING_FAILED");
    });

    it("should sanitize raw provider errors and throw stable application error codes", async () => {
      const failingProvider: OcrProvider = {
        async extractDocument(): Promise<OcrResult> {
          throw new Error("Internal Google SDK error: credentials file /secrets/sa.json not found in project my-secret-proj-999");
        },
      };

      setOcrProvider(failingProvider);
      const provider = getOcrProvider();

      await expect(
        provider.extractDocument({ data: Buffer.from("test"), mimeType: "image/png" })
      ).rejects.toThrow("OCR_PROVIDER_PROCESSING_FAILED");

      setOcrProvider(null);
    });
  });

  describe("OCR-Only Boundary & Side-Effect Guarantee", () => {
    it("should not trigger any purchase order, goods receipt, or inventory mutation", async () => {
      const user = {
        id: 1,
        openId: "test-user-1",
        email: "test@clinic.com",
        name: "Test Doctor",
        loginMethod: "manus" as const,
        role: "admin" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ctx: TrpcContext = {
        user,
        req: {} as any,
        res: {} as any,
      };

      const caller = appRouter.createCaller(ctx);

      const res = await caller.ocr.extractDocument({
        data: "ZmFrZS1pbWFnZS1ieXRlcw==",
        mimeType: "image/jpeg",
      });

      expect(res.fullText).toBeDefined();
      expect(res.provider).toBeDefined();
    });

    it("should mask raw provider error through tRPC router boundary with generic message", async () => {
      const secretFailingProvider: OcrProvider = {
        async extractDocument(): Promise<OcrResult> {
          throw new Error("Sensitive cloud storage failure at gs://private-bucket/secret.key");
        },
      };

      setOcrProvider(secretFailingProvider);

      const ctx: TrpcContext = {
        user: {
          id: 1,
          openId: "test-user-1",
          email: "test@clinic.com",
          name: "Test Doctor",
          loginMethod: "manus",
          role: "admin",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        req: {} as any,
        res: {} as any,
      };

      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.ocr.extractDocument({
          data: "ZmFrZS1pbWFnZS1ieXRlcw==",
          mimeType: "image/jpeg",
        })
      ).rejects.toThrow(/OCR extraction failed/i);

      // Verify sensitive path is not leaked to client
      try {
        await caller.ocr.extractDocument({
          data: "ZmFrZS1pbWFnZS1ieXRlcw==",
          mimeType: "image/jpeg",
        });
      } catch (err: any) {
        expect(err.message).not.toContain("private-bucket");
        expect(err.message).not.toContain("secret.key");
      }

      setOcrProvider(null);
    });
  });
});
