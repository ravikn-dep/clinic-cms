import { describe, expect, it } from "vitest";
import { formatIndianMobileInput, isValidIndianMobile, normalizeIndianMobile } from "../shared/indianMobile";

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
});
