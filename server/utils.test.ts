import { describe, it, expect } from "vitest";
import {
  generatePatientId,
  generateConsultationId,
  generateBillId,
  generateBarcodeData,
  createDigitalSignature,
  verifyDigitalSignature,
} from "./utils";

describe("Utility Functions", () => {
  describe("generatePatientId", () => {
    it("should generate a daily sequence patient ID with correct format", () => {
      const id = generatePatientId(1, new Date("2026-04-29"));
      expect(id).toMatch(/^DOCM-\d{2}\/\d{2}\/\d{2}OP\d{3}$/);
    });

    it("should generate different IDs for different daily sequences", () => {
      const date = new Date("2026-04-29");
      const id1 = generatePatientId(1, date);
      const id2 = generatePatientId(2, date);
      expect(id1).not.toBe(id2);
    });

    it("should start with DOCM- prefix", () => {
      const id = generatePatientId(1, new Date("2026-04-29"));
      expect(id).toMatch(/^DOCM-/);
    });

    it("should have correct format with DOCM date and sequence", () => {
      const id = generatePatientId(5, new Date("2026-04-29"));
      expect(id).toMatch(/^DOCM-\d{2}\/\d{2}\/\d{2}OP\d{3}$/);
      expect(id).toBe("DOCM-29/04/26OP005");
    });
  });

  describe("generateConsultationId", () => {
    it("should generate unique consultation IDs", () => {
      const id1 = generateConsultationId();
      const id2 = generateConsultationId();
      expect(id1).not.toBe(id2);
    });

    it("should start with CON- prefix", () => {
      const id = generateConsultationId();
      expect(id).toMatch(/^CON-/);
    });
  });

  describe("generateBillId", () => {
    it("should generate unique bill IDs", () => {
      const id1 = generateBillId();
      const id2 = generateBillId();
      expect(id1).not.toBe(id2);
    });

    it("should start with BIL- prefix", () => {
      const id = generateBillId();
      expect(id).toMatch(/^BIL-/);
    });
  });

  describe("generateBarcodeData", () => {
    it("should return the patient ID as barcode data", () => {
      const patientId = "PAT-ABC12345";
      const barcodeData = generateBarcodeData(patientId);
      expect(barcodeData).toBe(patientId);
    });
  });

  describe("Digital Signature", () => {
    const testContent = "Test clinical documentation";
    const secretKey = "test-secret-key";

    it("should create a digital signature", () => {
      const signature = createDigitalSignature(testContent, secretKey);
      expect(signature).toBeTruthy();
      expect(typeof signature).toBe("string");
      expect(signature.length).toBeGreaterThan(0);
    });

    it("should create consistent signatures for the same content", () => {
      const sig1 = createDigitalSignature(testContent, secretKey);
      const sig2 = createDigitalSignature(testContent, secretKey);
      expect(sig1).toBe(sig2);
    });

    it("should verify a valid signature", () => {
      const signature = createDigitalSignature(testContent, secretKey);
      const isValid = verifyDigitalSignature(testContent, signature, secretKey);
      expect(isValid).toBe(true);
    });

    it("should reject an invalid signature", () => {
      const signature = createDigitalSignature(testContent, secretKey);
      const isValid = verifyDigitalSignature("Different content", signature, secretKey);
      expect(isValid).toBe(false);
    });

    it("should reject a signature with wrong secret key", () => {
      const signature = createDigitalSignature(testContent, secretKey);
      const isValid = verifyDigitalSignature(testContent, signature, "wrong-key");
      expect(isValid).toBe(false);
    });
  });
});
