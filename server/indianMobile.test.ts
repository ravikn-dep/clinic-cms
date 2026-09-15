import { describe, expect, it } from "vitest";
import { formatIndianMobileInput, isValidIndianMobile, maskIndianMobile, normalizeIndianMobile } from "../shared/indianMobile";

describe("Indian mobile normalization", () => {
  it("accepts a plain 10-digit Indian mobile number", () => {
    expect(normalizeIndianMobile("9876543210")).toBe("9876543210");
  });

  it("normalizes +91, spaces, and separators before New Visit submission", () => {
    expect(normalizeIndianMobile("+91 98765-43210")).toBe("9876543210");
    expect(isValidIndianMobile("+91 98765 43210")).toBe(true);
  });

  it("rejects short or non-Indian mobile values", () => {
    expect(normalizeIndianMobile("987654321")).toBeNull();
    expect(normalizeIndianMobile("1234567890")).toBeNull();
    expect(isValidIndianMobile("98765")).toBe(false);
  });

  it("keeps friendly mobile formatting characters while filtering unsupported input", () => {
    expect(formatIndianMobileInput("+91 98765-43210abc")).toBe("+91 98765-43210");
  });

  it("masks a valid number to only its last 4 digits for external-facing responses", () => {
    expect(maskIndianMobile("9876543210")).toBe("+91••••••3210");
    expect(maskIndianMobile("+919876543210")).toBe("+91••••••3210");
  });

  it("fully redacts a value that cannot be normalized, rather than ever echoing it raw", () => {
    expect(maskIndianMobile("not-a-number")).toBe("••••••••••");
    expect(maskIndianMobile("12345")).toBe("••••••••••");
  });
});
