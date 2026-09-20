import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const { invokeLLM } = vi.hoisted(() => ({ invokeLLM: vi.fn() }));
vi.mock("./_core/llm", () => ({ invokeLLM }));

import { ForgeOcrProvider } from "./ocr/forgeOcrProvider";
import { getOcrProvider, setOcrProvider } from "./ocr/provider";

const originalEnv = { ...process.env };

function successfulResponse(content: string) {
  return {
    id: "synthetic-ocr",
    created: 0,
    model: "synthetic",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
  };
}

describe("Manus Forge OCR provider", () => {
  beforeEach(() => {
    invokeLLM.mockReset();
    setOcrProvider(null);
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    setOcrProvider(null);
    process.env = { ...originalEnv };
  });

  it("normalizes a Forge transcription into OcrResult without fabricated confidence", async () => {
    invokeLLM.mockResolvedValue(successfulResponse("Vendor: Synthetic Pharma\nInvoice: INV-001\nQty: 4\nBatch: B-01"));
    const result = await new ForgeOcrProvider().extractDocument({
      data: Buffer.from("synthetic-image"),
      mimeType: "image/png",
    });

    expect(result.provider).toBe("manus-forge");
    expect(result.fullText).toContain("Synthetic Pharma");
    expect(result.pages).toEqual([{ pageNumber: 1, text: result.fullText }]);
    expect(result.sourceMimeType).toBe("image/png");
    expect(result.pageCount).toBe(1);
    expect(result.confidence).toBeUndefined();
    expect(invokeLLM).toHaveBeenCalledOnce();
    const request = invokeLLM.mock.calls[0][0];
    expect(JSON.stringify(request)).not.toContain("postReviewedReceipt");
    expect(JSON.stringify(request)).toContain("Do not guess");
  });

  it("sanitizes upstream Forge failures", async () => {
    invokeLLM.mockRejectedValue(new Error("Forge key=secret upstream URL=https://private.example/internal"));
    await expect(new ForgeOcrProvider().extractDocument({
      data: Buffer.from("synthetic-image"),
      mimeType: "image/jpeg",
    })).rejects.toThrow("OCR_PROVIDER_PROCESSING_FAILED");
  });

  it("fails closed in production when no real provider is configured", async () => {
    process.env.NODE_ENV = "production";
    process.env.VITEST = "";
    delete process.env.MOCK_OCR;
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

    await expect(getOcrProvider().extractDocument({
      data: Buffer.from("synthetic-image"),
      mimeType: "image/png",
    })).rejects.toThrow("OCR_PROVIDER_INITIALIZATION_FAILED");
  });

  it("selects Forge in production when the built-in Forge capability is configured", async () => {
    process.env.NODE_ENV = "production";
    process.env.VITEST = "";
    process.env.BUILT_IN_FORGE_API_KEY = "test-only-placeholder";
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    invokeLLM.mockResolvedValue(successfulResponse("Synthetic transcription"));

    const result = await getOcrProvider().extractDocument({
      data: Buffer.from("synthetic-image"),
      mimeType: "image/png",
    });

    expect(result.provider).toBe("manus-forge");
  });

  it("keeps explicit mock mode deterministic", async () => {
    process.env.NODE_ENV = "production";
    process.env.MOCK_OCR = "true";
    process.env.BUILT_IN_FORGE_API_KEY = "test-only-placeholder";

    const result = await getOcrProvider().extractDocument({
      data: Buffer.from("synthetic-image"),
      mimeType: "image/png",
    });

    expect(result.provider).toBe("mock-ocr");
    expect(invokeLLM).not.toHaveBeenCalled();
  });
});
