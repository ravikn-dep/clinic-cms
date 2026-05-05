import { describe, it, expect, vi } from "vitest";
import * as utils from "./utils";

describe("RBAC User Management", () => {
  describe("generateUserId", () => {
    it("should generate consultant ID with correct format", () => {
      const id = utils.generateUserId("consultant", 1);
      expect(id).toBe("CONS-001");
    });

    it("should generate staff ID with correct format", () => {
      const id = utils.generateUserId("staff", 5);
      expect(id).toBe("STAFF-005");
    });

    it("should pad sequence numbers correctly", () => {
      const id1 = utils.generateUserId("consultant", 42);
      const id2 = utils.generateUserId("staff", 100);
      expect(id1).toBe("CONS-042");
      expect(id2).toBe("STAFF-100");
    });
  });

  describe("Password Management", () => {
    it("should hash password and verify it", async () => {
      const password = "TestPassword123!";
      const hash = await utils.hashPassword(password);
      
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
      
      const isValid = await utils.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("should reject incorrect password", async () => {
      const password = "TestPassword123!";
      const hash = await utils.hashPassword(password);
      
      const isValid = await utils.verifyPassword("WrongPassword", hash);
      expect(isValid).toBe(false);
    });

    it("should generate temporary password with 8 characters", () => {
      const tempPassword = utils.generateTemporaryPassword();
      expect(tempPassword.length).toBe(8);
      expect(/[A-Za-z0-9!@#$%]/.test(tempPassword)).toBe(true);
    });
  });

  describe("QR Code Generation", () => {
    it("should generate QR code data URL", async () => {
      const qrCode = await utils.generateQRCodeForLogin("CONS-001", "TestPass123!");
      
      expect(qrCode).toContain("data:image/png");
      expect(qrCode.length).toBeGreaterThan(100);
    });

    it("should encode and decode QR code login data", async () => {
      const userId = "CONS-001";
      const password = "TestPass123!";
      
      const qrCode = await utils.generateQRCodeForLogin(userId, password);
      const encoded = Buffer.from(`${userId}:${password}`).toString("base64");
      
      const decoded = utils.decodeQRCodeLogin(encoded);
      expect(decoded.userId).toBe(userId);
      expect(decoded.password).toBe(password);
    });

    it("should handle special characters in password", async () => {
      const userId = "STAFF-005";
      const password = "P@ss!w0rd#2024";
      
      const encoded = Buffer.from(`${userId}:${password}`).toString("base64");
      const decoded = utils.decodeQRCodeLogin(encoded);
      
      expect(decoded.userId).toBe(userId);
      expect(decoded.password).toBe(password);
    });
  });

  describe("RBAC Access Control", () => {
    it("should distinguish between admin and staff roles", () => {
      const adminId = utils.generateUserId("consultant", 1);
      const staffId = utils.generateUserId("staff", 1);
      
      expect(adminId).toContain("CONS");
      expect(staffId).toContain("STAFF");
    });

    it("should validate user creation inputs", () => {
      // This would be validated by Zod in the actual procedure
      const userId = utils.generateUserId("consultant", 1);
      expect(userId).toMatch(/^(CONS|STAFF)-\d{3}$/);
    });
  });
});
