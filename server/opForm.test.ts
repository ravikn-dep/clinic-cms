import { describe, it, expect, beforeEach } from "vitest";
import * as db from "./db";

describe("OP Form Template Customization", () => {
  beforeEach(async () => {
    // Reset to default before each test
    await db.resetOPFormTemplate();
  });

  describe("getOPFormTemplate", () => {
    it("should return default template on first call", async () => {
      const template = await db.getOPFormTemplate();
      expect(template.clinicName).toBe("Clinic OP Form");
      expect(template.headerFields.length).toBeGreaterThan(0);
      expect(template.blankAreaHeight).toBe(200);
    });

    it("should include required default fields", async () => {
      const template = await db.getOPFormTemplate();
      const fieldLabels = template.headerFields.map((f) => f.label);
      expect(fieldLabels).toContain("Name");
      expect(fieldLabels).toContain("Age/DOB");
      expect(fieldLabels).toContain("Contact");
    });

    it("should have QR code and barcode enabled by default", async () => {
      const template = await db.getOPFormTemplate();
      expect(template.showQRCode).toBe(true);
      expect(template.showBarcode).toBe(true);
    });
  });

  describe("setOPFormTemplate", () => {
    it("should update clinic name", async () => {
      const template = await db.getOPFormTemplate();
      template.clinicName = "Updated Clinic Name";
      await db.setOPFormTemplate(template);

      const updated = await db.getOPFormTemplate();
      expect(updated.clinicName).toBe("Updated Clinic Name");
    });

    it("should update blank area height", async () => {
      const template = await db.getOPFormTemplate();
      template.blankAreaHeight = 250;
      await db.setOPFormTemplate(template);

      const updated = await db.getOPFormTemplate();
      expect(updated.blankAreaHeight).toBe(250);
    });

    it("should toggle QR code visibility", async () => {
      const template = await db.getOPFormTemplate();
      template.showQRCode = false;
      await db.setOPFormTemplate(template);

      const updated = await db.getOPFormTemplate();
      expect(updated.showQRCode).toBe(false);
    });

    it("should add custom fields", async () => {
      const template = await db.getOPFormTemplate();
      const initialCount = template.headerFields.length;
      
      template.headerFields.push({
        id: "insurance",
        label: "Insurance Number",
        fieldType: "text",
        required: false,
        placeholder: "Enter insurance number",
      });
      
      await db.setOPFormTemplate(template);
      const updated = await db.getOPFormTemplate();
      expect(updated.headerFields.length).toBe(initialCount + 1);
      expect(updated.headerFields[updated.headerFields.length - 1].label).toBe("Insurance Number");
    });

    it("should remove fields", async () => {
      const template = await db.getOPFormTemplate();
      const initialCount = template.headerFields.length;
      
      template.headerFields = template.headerFields.filter((f) => f.id !== "consultant");
      await db.setOPFormTemplate(template);
      
      const updated = await db.getOPFormTemplate();
      expect(updated.headerFields.length).toBe(initialCount - 1);
      expect(updated.headerFields.find((f) => f.id === "consultant")).toBeUndefined();
    });
  });

  describe("resetOPFormTemplate", () => {
    it("should reset to default template", async () => {
      let template = await db.getOPFormTemplate();
      template.clinicName = "Custom Clinic";
      template.blankAreaHeight = 150;
      await db.setOPFormTemplate(template);

      await db.resetOPFormTemplate();
      
      const reset = await db.getOPFormTemplate();
      expect(reset.clinicName).toBe("Clinic OP Form");
      expect(reset.blankAreaHeight).toBe(200);
    });

    it("should restore default fields after reset", async () => {
      let template = await db.getOPFormTemplate();
      template.headerFields = [];
      await db.setOPFormTemplate(template);

      await db.resetOPFormTemplate();
      
      const reset = await db.getOPFormTemplate();
      expect(reset.headerFields.length).toBeGreaterThan(0);
    });
  });

  describe("Template immutability", () => {
    it("should not affect original template when modifying returned copy", async () => {
      const template1 = await db.getOPFormTemplate();
      template1.clinicName = "Modified";
      
      const template2 = await db.getOPFormTemplate();
      expect(template2.clinicName).toBe("Clinic OP Form");
    });
  });
});
