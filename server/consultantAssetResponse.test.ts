import { describe, expect, it } from "vitest";
import { requireConsultantAssetUrl } from "../shared/consultantAssetResponse";

describe("consultant asset response validation", () => {
  it("accepts complete metadata for logo and signature uploads", () => {
    expect(requireConsultantAssetUrl({ success: true, asset: { url: "/manus-storage/logo.png" } })).toBe("/manus-storage/logo.png");
    expect(requireConsultantAssetUrl({ success: true, asset: { url: "/manus-storage/signature.png" } })).toBe("/manus-storage/signature.png");
  });

  it("turns a successful-looking response without asset metadata into a controlled error", () => {
    for (const result of [undefined, null, { success: true }, { success: true, asset: null }, { success: true, asset: {} }, { success: false, asset: { url: "/bad" } }]) {
      expect(() => requireConsultantAssetUrl(result)).toThrow("Upload completed without asset metadata");
    }
  });
});
