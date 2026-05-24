import { describe, expect, it } from "vitest";
import { keyFromStorageUrl, resolveArtifactStorageKey } from "./artifactAccess";

describe("artifact access helpers", () => {
  it("extracts a storage key from the managed storage URL path", () => {
    expect(keyFromStorageUrl("/files/patients/PAT-123/qr.png")).toBe("patients/PAT-123/qr.png");
    expect(keyFromStorageUrl("/manus-storage/patients/PAT-123/qr.png")).toBe("patients/PAT-123/qr.png");
  });

  it("removes query strings and fragments from extracted storage keys", () => {
    expect(keyFromStorageUrl("https://clinic.example/manus-storage/invoices/INV-1.pdf?download=1#top")).toBe("invoices/INV-1.pdf");
  });

  it("prefers explicit persisted storage keys over display URLs", () => {
    expect(resolveArtifactStorageKey({ key: "audio/consultation.webm", url: "/manus-storage/legacy.webm" })).toBe("audio/consultation.webm");
  });

  it("falls back to parsing the managed storage URL when no key is provided", () => {
    expect(resolveArtifactStorageKey({ url: "/manus-storage/barcodes/PAT-456.png" })).toBe("barcodes/PAT-456.png");
  });

  it("returns undefined when neither a key nor a managed storage URL is available", () => {
    expect(resolveArtifactStorageKey({ url: "https://example.com/outside-file.pdf" })).toBeUndefined();
    expect(resolveArtifactStorageKey({ key: "   " })).toBeUndefined();
  });
});
