import { PDFDocument } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleVisionProvider } from "./ocr/googleVisionProvider";
import { getOcrProvider, setOcrProvider } from "./ocr/provider";
import { inspectOcrInput, MAX_PDF_BYTES, runWithOcrTimeout } from "./ocr/document";
import { parseOcrText } from "./poParsing/parser";
import { appRouter } from "./routers";
import type { OcrProvider, OcrResult } from "./ocr/types";
import type { TrpcContext } from "./_core/context";
import { createPurchaseOrderReviewPrefill } from "../shared/poReviewPrefill";
import * as db from "./db";

async function createPdf(pageCount: number): Promise<Buffer> {
  const document = await PDFDocument.create();
  for (let page = 0; page < pageCount; page += 1) document.addPage([300, 200]);
  return Buffer.from(await document.save());
}

function dataUri(buffer: Buffer): string {
  return `data:application/pdf;base64,${buffer.toString("base64")}`;
}

function authenticatedContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "step6-test-user",
      email: "step6@test.invalid",
      name: "Step 6 Test Doctor",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    req: {} as any,
    res: {} as any,
  };
}

describe("Phase 3 Step 6: bounded PDF and multi-page OCR", () => {
  afterEach(() => {
    setOcrProvider(null);
    vi.restoreAllMocks();
  });

  it("accepts JPEG and PNG regression inputs with a single page", async () => {
    const provider = getOcrProvider();
    const jpeg = await provider.extractDocument({ data: Buffer.from("jpeg"), mimeType: "image/jpeg" });
    const png = await provider.extractDocument({ data: Buffer.from("png"), mimeType: "image/png" });
    expect(jpeg.sourceMimeType).toBe("image/jpeg");
    expect(png.sourceMimeType).toBe("image/png");
    expect(jpeg.pageCount).toBe(1);
    expect(png.pages).toHaveLength(1);
  });

  it("accepts a valid bounded PDF through the mock provider without calling a paid API", async () => {
    const provider = getOcrProvider();
    const result = await provider.extractDocument({ data: await createPdf(2), mimeType: "application/pdf" });
    expect(result.provider).toBe("mock-ocr");
    expect(result.sourceMimeType).toBe("application/pdf");
    expect(result.pageCount).toBe(2);
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(result.fullText).toContain("--- PAGE 1 ---");
    expect(result.fullText).toContain("--- PAGE 2 ---");
  });

  it("rejects malformed, empty, oversize, and more-than-five-page PDFs before provider invocation", async () => {
    await expect(inspectOcrInput({ data: Buffer.alloc(0), mimeType: "application/pdf" })).rejects.toThrow("Cannot process empty file for OCR");
    await expect(inspectOcrInput({ data: Buffer.from("%PDF-not-a-document"), mimeType: "application/pdf" })).rejects.toThrow("Malformed PDF document");
    await expect(inspectOcrInput({ data: Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(MAX_PDF_BYTES)]), mimeType: "application/pdf", maxSizeMb: 10 } as any)).rejects.toThrow("File size exceeds maximum allowed limit");
    await expect(inspectOcrInput({ data: await createPdf(6), mimeType: "application/pdf" })).rejects.toThrow("PDF exceeds maximum supported page count");
  });

  it("uses synchronous Vision file OCR in deterministic page order without repeating full-document text per page", async () => {
    const provider = new GoogleVisionProvider() as any;
    provider.client = {
      batchAnnotateFiles: async (request: any) => {
        expect(request.requests[0].pages).toEqual([1, 2]);
        return [{ responses: [{ responses: [
          { fullTextAnnotation: { text: "FIRST PAGE" } },
          { fullTextAnnotation: { text: "SECOND PAGE" } },
        ] }] }];
      },
      documentTextDetection: async () => {
        throw new Error("image route should not run for PDF");
      },
    };

    const result = await provider.extractDocument({ data: await createPdf(2), mimeType: "application/pdf" });
    expect(result.pages).toEqual([
      { pageNumber: 1, text: "FIRST PAGE" },
      { pageNumber: 2, text: "SECOND PAGE" },
    ]);
    expect(result.fullText).toBe("--- PAGE 1 ---\nFIRST PAGE\n\n--- PAGE 2 ---\nSECOND PAGE");
    expect(result.fullText.match(/FIRST PAGE/g)).toHaveLength(1);
    expect(result.fullText.match(/SECOND PAGE/g)).toHaveLength(1);
  });

  it("keeps PDF provider failures and timeouts behind stable error codes", async () => {
    const provider = new GoogleVisionProvider() as any;
    provider.client = {
      batchAnnotateFiles: async () => {
        throw new Error("Google project prod-ocr credentials /secret/key quota exhausted");
      },
    };
    await expect(provider.extractDocument({ data: await createPdf(1), mimeType: "application/pdf" })).rejects.toThrow("OCR_PROVIDER_PROCESSING_FAILED");
    await expect(runWithOcrTimeout(new Promise<never>(() => undefined), 1)).rejects.toThrow("OCR_PROVIDER_TIMEOUT");
  });

  it("feeds stable multi-page text into the deterministic parser without an LLM fallback", async () => {
    const provider = getOcrProvider();
    const result = await provider.extractDocument({ data: await createPdf(2), mimeType: "application/pdf" });
    const parsed = parseOcrText(result.fullText);
    expect(parsed.documentType).toBe("GST_INVOICE");
    expect(parsed.vendorGstin.value).toBe("29AABCA1234F1Z5");
    expect(parsed.items).toHaveLength(1);
  });

  it("performs no PO, evidence, receipt, inventory, stock, or catalog-acceptance mutation before the human explicitly submits the review", async () => {
    const createPoSpy = vi.spyOn(db, "createPurchaseOrderWithItemsAndExtractionReview");
    const receiptSpy = vi.spyOn(db, "createGoodsReceipt");
    const inventorySpy = vi.spyOn(db, "updateInventoryItem");
    const caller = appRouter.createCaller(authenticatedContext());

    const ocr = await caller.ocr.extractDocument({ data: dataUri(await createPdf(2)), mimeType: "application/pdf" });
    const parsed = await caller.poParsing.parseOcrText({ fullText: ocr.fullText });
    const review = createPurchaseOrderReviewPrefill(parsed);

    expect(review.requiresExplicitSubmission).toBe(true);
    expect(createPoSpy).not.toHaveBeenCalled();
    expect(receiptSpy).not.toHaveBeenCalled();
    expect(inventorySpy).not.toHaveBeenCalled();
  });

  it("requires an authenticated caller and does not expose a business mutation before review submission", async () => {
    const unauthenticatedCaller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any } as TrpcContext);
    await expect(unauthenticatedCaller.ocr.extractDocument({ data: "ZmFrZQ==", mimeType: "image/jpeg" })).rejects.toThrow();

    const caller = appRouter.createCaller(authenticatedContext());
    const result = await caller.ocr.extractDocument({ data: dataUri(await createPdf(2)), mimeType: "application/pdf" });
    expect(result.pageCount).toBe(2);
    expect(result.fullText).toContain("MOCK GST INVOICE");
  });

  it("masks raw PDF provider errors at the authenticated router boundary", async () => {
    const failingProvider: OcrProvider = {
      async extractDocument(): Promise<OcrResult> {
        throw new Error("gs://private-pdf-evidence/customer-file.pdf");
      },
    };
    setOcrProvider(failingProvider);
    const caller = appRouter.createCaller(authenticatedContext());
    await expect(caller.ocr.extractDocument({ data: "ZmFrZQ==", mimeType: "image/png" })).rejects.toThrow("OCR extraction failed");
    setOcrProvider(null);
  });
});
