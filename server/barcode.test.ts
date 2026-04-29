import { describe, it, expect } from "vitest";
import { generateQRCode, generateBarcodeImage, generatePatientBarcodes } from "./barcode";

describe("Barcode Generation", () => {
  describe("generateQRCode", () => {
    it("should generate a QR code data URL", async () => {
      const qrCode = await generateQRCode("PAT-ABC12345");
      expect(qrCode).toBeTruthy();
      expect(qrCode).toMatch(/^data:image\/png;base64,/);
    });

    it("should generate different QR codes for different inputs", async () => {
      const qr1 = await generateQRCode("PAT-ABC12345");
      const qr2 = await generateQRCode("PAT-XYZ67890");
      expect(qr1).not.toBe(qr2);
    });

    it("should generate consistent QR codes for the same input", async () => {
      const qr1 = await generateQRCode("PAT-ABC12345");
      const qr2 = await generateQRCode("PAT-ABC12345");
      expect(qr1).toBe(qr2);
    });

    it("should throw error for invalid input", async () => {
      await expect(generateQRCode("")).rejects.toThrow();
    });
  });

  describe("generateBarcodeImage", () => {
    it("should generate an SVG barcode", () => {
      const barcode = generateBarcodeImage("PAT-ABC12345");
      expect(barcode).toBeTruthy();
      expect(barcode).toContain("<svg");
      expect(barcode).toContain("PAT-ABC12345");
    });

    it("should include OPD tracking label", () => {
      const barcode = generateBarcodeImage("PAT-ABC12345");
      expect(barcode).toContain("OPD Tracking Barcode");
    });
  });

  describe("generatePatientBarcodes", () => {
    it("should generate both QR code and barcode", async () => {
      const barcodes = await generatePatientBarcodes("PAT-ABC12345");
      expect(barcodes).toHaveProperty("qrCodeDataUrl");
      expect(barcodes).toHaveProperty("barcodeImage");
      expect(barcodes).toHaveProperty("patientId");
      expect(barcodes.patientId).toBe("PAT-ABC12345");
    });

    it("should generate valid QR code data URL", async () => {
      const barcodes = await generatePatientBarcodes("PAT-ABC12345");
      expect(barcodes.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it("should generate valid SVG barcode", async () => {
      const barcodes = await generatePatientBarcodes("PAT-ABC12345");
      expect(barcodes.barcodeImage).toContain("<svg");
    });
  });
});
